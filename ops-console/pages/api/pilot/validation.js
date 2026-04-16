import { requireAuth } from '../../../lib/auth.js';
import {
  sMembers,
  redisKey,
  pipeline,
  get,
} from '../../../lib/redis.js';
import { daysAgoKey, todayKey } from '../../../lib/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    const includeAnon = req.query.includeAnon !== 'false'; // default true
    const ownerIds = await sMembers(redisKey('owners'));
    const allSample = ownerIds.slice(0, 200);

    // Pre-fetch user info to determine anon vs auth before main pipeline
    const userInfoPipe = allSample.map(oid => ['HGETALL', redisKey('user', oid)]);
    const userInfoResults = userInfoPipe.length > 0 ? await pipeline(userInfoPipe) : [];
    const userInfoMap = {};
    for (let i = 0; i < allSample.length; i++) {
      userInfoMap[allSample[i]] = flatArr(userInfoResults[i]);
    }

    // Filter sample based on includeAnon toggle
    const sample = includeAnon
      ? allSample
      : allSample.filter(oid => !!userInfoMap[oid].email);

    // Per-user pipeline: 14-day aggregates + report + llm + modes + progress + moments/actions
    const pipeCommands = [];
    for (const oid of sample) {
      // 14-day moment counts (indices 0-13)
      for (let d = 0; d < 14; d++) {
        pipeCommands.push(['HGETALL', redisKey('daily', oid, daysAgoKey(d))]);
      }
      // Weekly report (index 14)
      pipeCommands.push(['GET', redisKey('weekly_report', oid)]);
      // LLM insight (index 15)
      pipeCommands.push(['GET', redisKey('llm_insight', oid)]);
      // Adaptive modes (index 16)
      pipeCommands.push(['GET', redisKey('modes', oid)]);
      // Action feedback list length (index 17)
      pipeCommands.push(['LLEN', redisKey('action_feedback', oid)]);
      // User info (index 18)
      pipeCommands.push(['HGETALL', redisKey('user', oid)]);
      // Total moments (index 19)
      pipeCommands.push(['LLEN', redisKey('moments', oid)]);
      // Subscription (index 20)
      pipeCommands.push(['HGETALL', redisKey('subscription', oid)]);
    }

    const perUser = 21;
    const results = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];

    const users = [];
    let totalMoments = 0;
    let usersWithReport = 0;
    let usersWithLlm = 0;
    let usersWithModes = 0;
    let usersWithFeedback = 0;
    let premiumUsers = 0;
    let activeThisWeek = 0;
    let activeLastWeek = 0;
    const daysDistribution = {};
    const triggerFleet = {};
    const emotionFleet = {};
    const weeklyMomentCounts = [];

    for (let u = 0; u < sample.length; u++) {
      const base = u * perUser;
      const oid = sample[u];

      let week1Moments = 0;
      let week2Moments = 0;
      let activeDays = 0;
      const userTriggers = {};
      const userEmotions = {};

      for (let d = 0; d < 14; d++) {
        const agg = flatArr(results[base + d]);
        const t = parseInt(agg.total || '0', 10);
        if (d < 7) week1Moments += t;
        else week2Moments += t;
        if (t > 0) activeDays++;
        for (const [key, val] of Object.entries(agg)) {
          if (key.startsWith('trigger:')) {
            const name = key.split(':')[1];
            triggerFleet[name] = (triggerFleet[name] || 0) + parseInt(val, 10);
            userTriggers[name] = (userTriggers[name] || 0) + parseInt(val, 10);
          }
          if (key.startsWith('emotion:')) {
            const name = key.split(':')[1];
            emotionFleet[name] = (emotionFleet[name] || 0) + parseInt(val, 10);
            userEmotions[name] = (userEmotions[name] || 0) + parseInt(val, 10);
          }
        }
      }

      const moments = parseInt(results[base + 19] || '0', 10);
      totalMoments += moments;
      const report = safeJson(results[base + 14]);
      const llm = safeJson(results[base + 15]);
      const modes = safeJson(results[base + 16]);
      const feedbackCount = parseInt(results[base + 17] || '0', 10);
      const userInfo = userInfoMap[oid] || flatArr(results[base + 18]);
      const isAnonymous = !userInfo.email;
      const sub = flatArr(results[base + 20]);

      if (report) usersWithReport++;
      if (llm) usersWithLlm++;
      if (modes) usersWithModes++;
      if (feedbackCount > 0) usersWithFeedback++;
      if (sub.status === 'active' || sub.status === 'grace_period') premiumUsers++;
      if (week1Moments > 0) activeThisWeek++;
      if (week2Moments > 0) activeLastWeek++;

      daysDistribution[activeDays] = (daysDistribution[activeDays] || 0) + 1;
      weeklyMomentCounts.push(week1Moments);

      users.push({
        id: oid.slice(0, 8),
        name: userInfo.name || null,
        email: userInfo.email || null,
        isAnonymous,
        moments,
        week1Moments,
        week2Moments,
        activeDays14d: activeDays,
        uniqueTriggers: Object.keys(userTriggers).length,
        uniqueEmotions: Object.keys(userEmotions).length,
        hasReport: !!report,
        hasLlm: !!llm,
        hasModes: !!modes,
        feedbackCount,
        isPremium: sub.status === 'active' || sub.status === 'grace_period',
      });
    }

    users.sort((a, b) => b.moments - a.moments);

    // Compute validation scores
    const totalUsers = sample.length;
    const dataRichUsers = users.filter(u => u.moments >= 10 && u.activeDays14d >= 4).length;
    const progressEligible = users.filter(u => u.week1Moments > 0 && u.week2Moments > 0).length;
    const avgMoments = totalUsers > 0 ? (totalMoments / totalUsers).toFixed(1) : 0;
    const medianWeekly = weeklyMomentCounts.sort((a, b) => a - b)[Math.floor(weeklyMomentCounts.length / 2)] || 0;

    // Validation checks
    const checks = [
      { label: 'Users with weekly report', value: usersWithReport, total: totalUsers, target: 50 },
      { label: 'Users with LLM insight', value: usersWithLlm, total: totalUsers, target: 30 },
      { label: 'Users with adaptive modes', value: usersWithModes, total: totalUsers, target: 20 },
      { label: 'Users giving action feedback', value: usersWithFeedback, total: totalUsers, target: 15 },
      { label: 'Premium subscribers', value: premiumUsers, total: totalUsers, target: 5 },
      { label: 'Progress-eligible (2+ active weeks)', value: progressEligible, total: totalUsers, target: 30 },
      { label: 'Data-rich users (10+ moments, 4+ days)', value: dataRichUsers, total: totalUsers, target: 20 },
      { label: 'Active this week', value: activeThisWeek, total: totalUsers, target: 40 },
      { label: 'Retained from last week', value: activeLastWeek, total: totalUsers, target: 30 },
    ];

    const authenticatedCount = users.filter(u => !u.isAnonymous).length;
    const anonymousCount = users.filter(u => u.isAnonymous).length;

    res.status(200).json({
      timestamp: new Date().toISOString(),
      totalUsers,
      authenticatedUsers: authenticatedCount,
      anonymousUsers: anonymousCount,
      includeAnon,
      totalMoments,
      avgMoments: parseFloat(avgMoments),
      medianWeeklyMoments: medianWeekly,
      checks,
      daysDistribution,
      triggerFleet: sortObj(triggerFleet),
      emotionFleet: sortObj(emotionFleet),
      users: users.slice(0, 50),
    });
  } catch (err) {
    console.error('Pilot validation error:', err);
    res.status(500).json({ error: err.message });
  }
}

function flatArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) {
    obj[arr[i]] = arr[i + 1];
  }
  return obj;
}

function safeJson(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function sortObj(obj) {
  return Object.fromEntries(
    Object.entries(obj).sort(([, a], [, b]) => b - a)
  );
}
