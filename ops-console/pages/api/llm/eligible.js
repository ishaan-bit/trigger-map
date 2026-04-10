import { requireAuth } from '../../../lib/auth.js';
import { sMembers, pipeline, redisKey, keys } from '../../../lib/redis.js';

function flatArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}

/**
 * GET /api/llm/eligible
 *
 * Returns enriched user list with all the metadata needed for per-row filtering:
 *   momentCount, isPremium, lastLlmInsightAt, lastLlmActionsAt,
 *   lastMoveAt, lastFuelAt, lastPerspectiveAt, lastMomentAt,
 *   actionFeedbackCount, moveFeedbackCount, fuelFeedbackCount, perspectiveFeedbackCount
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    const ownerIds = await sMembers(redisKey('owners')) || [];
    const userKeys = await keys(redisKey('user', '*')) || [];
    const registeredIds = userKeys
      .map(k => k.replace(redisKey('user', ''), ''))
      .filter(id => id && id.length > 8);
    const allIds = [...new Set([...ownerIds, ...registeredIds])];

    if (allIds.length === 0) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.status(200).json({ users: [], total: 0 });
    }

    // Compute the 7 calendar dates (same as backend getWeeklyAggregates)
    const weekDates = [];
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      weekDates.push(d.toISOString().slice(0, 10));
    }

    // Pipeline: fetch all user data in one batch
    // Per-user commands: 11 base + 7 daily aggregate = 18
    const FIELDS_PER_USER = 18;
    const cmds = [];
    for (const oid of allIds) {
      cmds.push(['LLEN', redisKey('moments', oid)]);                    // 0: moment count (lifetime)
      cmds.push(['HGETALL', redisKey('user', oid)]);                    // 1: user hash
      cmds.push(['LINDEX', redisKey('moments', oid), '-1']);            // 2: last moment (for lastMomentAt)
      cmds.push(['GET', redisKey('llm_insight', oid)]);                 // 3: llm insight
      cmds.push(['HGETALL', redisKey('subscription', oid)]);            // 4: subscription
      cmds.push(['GET', redisKey('action_prefs', oid)]);                // 5: action prefs
      cmds.push(['GET', redisKey('mode_output', oid, 'move')]);         // 6: move output
      cmds.push(['GET', redisKey('mode_output', oid, 'fuel')]);         // 7: fuel output
      cmds.push(['GET', redisKey('mode_output', oid, 'perspective')]);  // 8: perspective output
      cmds.push(['LRANGE', redisKey('action_feedback', oid), '0', '-1']); // 9: action feedback (full list)
      cmds.push(['LRANGE', redisKey('mode_feedback', oid), '0', '-1']); // 10: mode feedback (full list)
      // 11-17: daily aggregate totals for last 7 days (matches backend exactly)
      for (const date of weekDates) {
        cmds.push(['HGET', redisKey('daily', oid, date), 'total']);
      }
    }

    const results = await pipeline(cmds);
    const users = [];

    for (let i = 0; i < allIds.length; i++) {
      const base = i * FIELDS_PER_USER;
      const momentCount = results[base] || 0;
      const userHash = flatArr(results[base + 1]);
      const lastMomentRaw = results[base + 2];
      const llmInsightRaw = results[base + 3];
      const subHash = flatArr(results[base + 4]);
      const actionPrefsRaw = results[base + 5];
      const moveOutputRaw = results[base + 6];
      const fuelOutputRaw = results[base + 7];
      const perspectiveOutputRaw = results[base + 8];
      const actionFeedbackRaw = results[base + 9];
      const modeFeedbackRaw = results[base + 10];

      if (!userHash.email && !userHash.name) continue;

      // Sum daily aggregate totals for the last 7 days
      // This mirrors exactly what backend getWeeklyAggregates + generateWeeklyReport does
      let weeklyMomentCount = 0;
      for (let d = 0; d < 7; d++) {
        weeklyMomentCount += Number(results[base + 11 + d] || 0);
      }

      let lastMomentAt = null;
      if (lastMomentRaw) {
        try { lastMomentAt = JSON.parse(lastMomentRaw).timestamp || null; } catch {}
      }

      let lastLlmInsightAt = null;
      if (llmInsightRaw) {
        try { lastLlmInsightAt = JSON.parse(llmInsightRaw).generatedAt || null; } catch {}
      }

      let isPremium = false;
      if (subHash.status) {
        isPremium = subHash.status === 'active' || subHash.status === 'grace_period';
      }

      let lastLlmActionsAt = null;
      if (actionPrefsRaw) {
        try { lastLlmActionsAt = JSON.parse(actionPrefsRaw).llmGeneratedAt || null; } catch {}
      }

      let lastMoveAt = null;
      if (moveOutputRaw) {
        try { lastMoveAt = JSON.parse(moveOutputRaw).generatedAt || null; } catch {}
      }

      let lastFuelAt = null;
      if (fuelOutputRaw) {
        try { lastFuelAt = JSON.parse(fuelOutputRaw).generatedAt || null; } catch {}
      }

      let lastPerspectiveAt = null;
      if (perspectiveOutputRaw) {
        try { lastPerspectiveAt = JSON.parse(perspectiveOutputRaw).generatedAt || null; } catch {}
      }

      // Count action feedback entries submitted AFTER the last LLM actions generation.
      // This ensures that once the LLM consumes feedback, those users drop off
      // until they provide new feedback.
      let actionFeedbackCount = 0;
      const lastActionsMs = lastLlmActionsAt ? new Date(lastLlmActionsAt).getTime() : 0;
      if (Array.isArray(actionFeedbackRaw)) {
        for (const entry of actionFeedbackRaw) {
          try {
            const fb = JSON.parse(entry);
            if ((fb.timestamp || 0) > lastActionsMs) actionFeedbackCount++;
          } catch {}
        }
      }

      // Count mode feedback by type, only entries submitted AFTER that mode's last generation.
      const lastMoveMs = lastMoveAt ? new Date(lastMoveAt).getTime() : 0;
      const lastFuelMs = lastFuelAt ? new Date(lastFuelAt).getTime() : 0;
      const lastPerspMs = lastPerspectiveAt ? new Date(lastPerspectiveAt).getTime() : 0;
      let moveFeedbackCount = 0;
      let fuelFeedbackCount = 0;
      let perspectiveFeedbackCount = 0;
      if (Array.isArray(modeFeedbackRaw)) {
        for (const entry of modeFeedbackRaw) {
          try {
            const fb = JSON.parse(entry);
            const ts = fb.timestamp || 0;
            if (fb.mode === 'move' && ts > lastMoveMs) moveFeedbackCount++;
            else if (fb.mode === 'fuel' && ts > lastFuelMs) fuelFeedbackCount++;
            else if (fb.mode === 'perspective' && ts > lastPerspMs) perspectiveFeedbackCount++;
          } catch {}
        }
      }

      users.push({
        ownerId: allIds[i],
        name: userHash.name || null,
        email: userHash.email || null,
        momentCount,
        weeklyMomentCount,
        isPremium,
        lastMomentAt,
        lastLlmInsightAt,
        lastLlmActionsAt,
        lastMoveAt,
        lastFuelAt,
        lastPerspectiveAt,
        actionFeedbackCount,
        moveFeedbackCount,
        fuelFeedbackCount,
        perspectiveFeedbackCount,
      });
    }

    users.sort((a, b) => b.momentCount - a.momentCount);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json({ users, total: users.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
