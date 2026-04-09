import { requireInternalAuth } from '../../../../lib/internalAuth.js';
import enableCors from '../../../../lib/cors.js';
import { redis, pipeline, redisKey, flatArrayToObject } from '../../../../services/redisClient.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const SCHEDULE_KEY = redisKey('push_schedule');
const LAST_RUN_KEY = redisKey('push_schedule_last');
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

/**
 * Called by the local worker every 30 minutes.
 * Evaluates the push schedule config and sends notifications as needed.
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireInternalAuth(req, res)) return;

  try {
    const raw = await redis(['GET', SCHEDULE_KEY]);
    if (!raw) return res.status(200).json({ ok: true, action: 'none', reason: 'No schedule configured' });

    const config = JSON.parse(raw);
    if (!config.enabled) return res.status(200).json({ ok: true, action: 'none', reason: 'Schedule disabled' });

    // Get current IST time
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MS);
    const istHour = nowIst.getUTCHours();
    const istMinute = nowIst.getUTCMinutes();
    const istDay = nowIst.getUTCDay(); // 0=Sun
    const istTime = `${String(istHour).padStart(2, '0')}:${String(istMinute).padStart(2, '0')}`;
    const istDateKey = nowIst.toISOString().slice(0, 10);

    // Load last-run state to prevent duplicate sends
    const lastRunRaw = await redis(['GET', LAST_RUN_KEY]);
    const lastRun = lastRunRaw ? JSON.parse(lastRunRaw) : {};

    const actions = [];

    // ── Daily Check-in ──
    if (config.daily?.enabled) {
      const { amTime, pmTime } = config.daily;
      if (amTime && isTimeMatch(istTime, amTime) && lastRun[`daily_am_${istDateKey}`] !== true) {
        actions.push({ key: `daily_am_${istDateKey}`, type: 'reflection_reminder', title: 'Time to reflect', body: 'Good morning — how are you feeling today? A quick log sets the tone.' });
      }
      if (pmTime && isTimeMatch(istTime, pmTime) && lastRun[`daily_pm_${istDateKey}`] !== true) {
        actions.push({ key: `daily_pm_${istDateKey}`, type: 'reflection_reminder', title: 'Time to reflect', body: 'How did today feel? A quick log helps your pattern map stay current.' });
      }
    }

    // ── Weekly Insights ──
    if (config.weekly?.enabled && Array.isArray(config.weekly.days)) {
      const { days, time } = config.weekly;
      if (days.includes(istDay) && time && isTimeMatch(istTime, time) && lastRun[`weekly_${istDateKey}`] !== true) {
        actions.push({ key: `weekly_${istDateKey}`, type: 'weekly_insight', title: 'Your weekly patterns are ready', body: 'See what stood out this week — your patterns tell a story.' });
      }
    }

    // ── Gentle Nudge ──
    if (config.nudge?.enabled) {
      const inactiveDays = config.nudge.inactiveDays || 3;
      // Only evaluate nudges once per day (at AM time, or 11:00 IST default)
      const nudgeTime = config.daily?.amTime || '11:00';
      if (isTimeMatch(istTime, nudgeTime) && lastRun[`nudge_${istDateKey}`] !== true) {
        actions.push({ key: `nudge_${istDateKey}`, type: 'inactivity_nudge', inactiveDays, title: 'How has your day been?', body: 'Log a moment to keep your pattern map current.' });
      }
    }

    if (actions.length === 0) {
      return res.status(200).json({ ok: true, action: 'none', reason: 'No actions due', istTime, istDay });
    }

    // Get all users with push tokens
    const ownerIds = await redis(['SMEMBERS', redisKey('owners')]);
    if (!ownerIds || ownerIds.length === 0) {
      return res.status(200).json({ ok: true, action: 'none', reason: 'No users' });
    }

    // Fetch push tokens + last moment for all users in one pipeline
    const cmds = [];
    for (const oid of ownerIds) {
      cmds.push(['HGETALL', redisKey('push_tokens', oid)]);
      cmds.push(['LINDEX', redisKey('moments', oid), -1]); // last moment
    }
    const results = await pipeline(cmds);

    // Build user list with tokens and last-activity info
    const usersWithTokens = [];
    for (let i = 0; i < ownerIds.length; i++) {
      const tokenHash = flatArrayToObject(results[i * 2]);
      const lastMomentRaw = results[i * 2 + 1];

      const tokens = [];
      for (const [, entryJson] of Object.entries(tokenHash)) {
        try {
          const entry = JSON.parse(entryJson);
          if (entry.token) tokens.push(entry.token);
        } catch {}
      }
      if (tokens.length === 0) continue;

      let lastMomentAt = null;
      if (lastMomentRaw) {
        try { lastMomentAt = JSON.parse(lastMomentRaw).timestamp || null; } catch {}
      }

      usersWithTokens.push({ ownerId: ownerIds[i], tokens, lastMomentAt });
    }

    const summary = [];

    for (const action of actions) {
      let targetUsers = usersWithTokens;

      // For nudges, filter to users inactive for N days
      if (action.type === 'inactivity_nudge' && action.inactiveDays) {
        const threshold = Date.now() - action.inactiveDays * 24 * 60 * 60 * 1000;
        targetUsers = usersWithTokens.filter(u => {
          if (!u.lastMomentAt) return true; // never logged = definitely nudge
          return new Date(u.lastMomentAt).getTime() < threshold;
        });
      }

      if (targetUsers.length === 0) {
        summary.push({ action: action.key, sent: 0, reason: 'no eligible users' });
        lastRun[action.key] = true;
        continue;
      }

      // Build push messages
      const messages = [];
      for (const user of targetUsers) {
        for (const token of user.tokens) {
          messages.push({
            to: token,
            title: action.title,
            body: action.body,
            sound: 'default',
            data: { userId: user.ownerId, type: action.type },
          });
        }
      }

      // Send in batches of 100
      let delivered = 0;
      let errors = 0;
      for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100);
        try {
          const pushRes = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(batch),
          });
          if (pushRes.ok) {
            const pushData = await pushRes.json();
            delivered += (pushData.data || []).filter(r => r.status === 'ok').length;
            errors += (pushData.data || []).filter(r => r.status === 'error').length;
          } else {
            errors += batch.length;
          }
        } catch {
          errors += batch.length;
        }
      }

      lastRun[action.key] = true;
      summary.push({ action: action.key, type: action.type, users: targetUsers.length, messages: messages.length, delivered, errors });
      console.log(`[push-cron] ${action.key}: ${targetUsers.length} users, ${delivered} delivered, ${errors} errors`);
    }

    // Persist last-run state (keep last 30 entries to avoid unbounded growth)
    const keys = Object.keys(lastRun);
    if (keys.length > 30) {
      const sorted = keys.sort();
      for (const k of sorted.slice(0, keys.length - 30)) delete lastRun[k];
    }
    await redis(['SET', LAST_RUN_KEY, JSON.stringify(lastRun)]);

    return res.status(200).json({ ok: true, actions: summary, istTime, istDay });
  } catch (err) {
    console.error('[push-cron] error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Check if current IST time matches a target time within a 30-minute window.
 * e.g. target "08:00", current "08:14" → true. current "08:31" → false.
 */
function isTimeMatch(current, target) {
  const [ch, cm] = current.split(':').map(Number);
  const [th, tm] = target.split(':').map(Number);
  const currentMin = ch * 60 + cm;
  const targetMin = th * 60 + tm;
  const diff = currentMin - targetMin;
  return diff >= 0 && diff < 30; // Within 30-min window (matches cron interval)
}
