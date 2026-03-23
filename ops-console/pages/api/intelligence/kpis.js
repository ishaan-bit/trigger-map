import { requireAuth } from '../../../lib/auth.js';
import {
  sMembers,
  redisKey,
  pipeline,
  get,
  lRange,
} from '../../../lib/redis.js';
import { daysAgoKey, todayKey } from '../../../lib/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    const ownerIds = await sMembers(redisKey('owners'));
    const sample = ownerIds.slice(0, 200);
    const today = todayKey();
    const now = Date.now();

    // Build KPI pipeline: per-user 7-day history + insights + subscriptions
    const pipeCommands = [];
    for (const oid of sample) {
      // 7-day moment counts (indices 0-6)
      for (let d = 0; d < 7; d++) {
        pipeCommands.push(['HGETALL', redisKey('daily', oid, daysAgoKey(d))]);
      }
      // Insight presence (index 7, 8)
      pipeCommands.push(['GET', redisKey('weekly_report', oid)]);
      pipeCommands.push(['GET', redisKey('llm_insight', oid)]);
      // Moment list length (index 9)
      pipeCommands.push(['LLEN', redisKey('moments', oid)]);
      // User info (index 10)
      pipeCommands.push(['HGETALL', redisKey('user', oid)]);
      // Last 3 moments for latency/recency (index 11)
      pipeCommands.push(['LRANGE', redisKey('moments', oid), '0', '2']);
    }

    const perUser = 12; // 7 days + report + llm + llen + user + recent moments
    const results = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];

    // Engagement metrics
    let totalLoggingDays = 0;
    let multiDayUsers = 0;
    let singleDayUsers = 0;
    let powerUsers = 0;
    let dormantUsers = 0;
    let insightViewEligible = 0;
    let llmInsightCount = 0;
    let retentionDay1 = 0;
    let retentionDay7 = 0;

    // Enhanced KPIs
    let usersWithInsight = 0;
    let totalMomentsAllUsers = 0;
    let secondLogWithin24h = 0;
    let silentUsers3d = 0; // no logs in last 3 days
    let insightLatencies = [];
    let ruleInsightCount = 0;

    // Baseline fleet metrics
    const baselineScores = [];
    const driftValues = [];
    const stabilityScores = [];
    const stateOfMindCounts = {};

    // Behavioral signals
    const triggerCounts = {};
    const emotionCounts = {};

    for (let u = 0; u < sample.length; u++) {
      const base = u * perUser;
      let activeDays = 0;
      let weekMoments = 0;
      let last3DaysMoments = 0;

      for (let d = 0; d < 7; d++) {
        const agg = flatArr(results[base + d]);
        const t = parseInt(agg.total || '0', 10);
        if (t > 0) activeDays++;
        weekMoments += t;
        if (d < 3) last3DaysMoments += t;

        for (const [key, val] of Object.entries(agg)) {
          if (key.startsWith('trigger:')) {
            const name = key.split(':')[1];
            triggerCounts[name] = (triggerCounts[name] || 0) + parseInt(val, 10);
          }
          if (key.startsWith('emotion:')) {
            const name = key.split(':')[1];
            emotionCounts[name] = (emotionCounts[name] || 0) + parseInt(val, 10);
          }
        }
      }

      totalLoggingDays += activeDays;
      totalMomentsAllUsers += weekMoments;
      if (activeDays >= 5) powerUsers++;
      else if (activeDays >= 2) multiDayUsers++;
      else if (activeDays === 1) singleDayUsers++;
      else dormantUsers++;

      if (last3DaysMoments === 0) silentUsers3d++;

      // Check "second log within 24h": day-0 and day-1 both have moments
      const day0 = parseInt(flatArr(results[base + 0]).total || '0', 10);
      const day1 = parseInt(flatArr(results[base + 1]).total || '0', 10);
      if (day0 > 0 && day1 > 0) secondLogWithin24h++;

      const hasReport = !!results[base + 7];
      const hasLlm = !!results[base + 8];
      const totalMoments = results[base + 9] || 0;

      if (hasReport) { insightViewEligible++; ruleInsightCount++; }
      if (hasLlm) llmInsightCount++;
      if (hasReport || hasLlm) usersWithInsight++;

      // Extract baseline metrics from cached weekly report
      if (hasReport) {
        try {
          const reportRaw = results[base + 7];
          const rp = typeof reportRaw === 'string' ? JSON.parse(reportRaw) : null;
          if (rp?.baselineScore != null) baselineScores.push(rp.baselineScore);
          if (rp?.driftValue != null) driftValues.push(rp.driftValue);
          if (rp?.stabilityScore != null) stabilityScores.push(rp.stabilityScore);
          if (rp?.stateOfMind) stateOfMindCounts[rp.stateOfMind] = (stateOfMindCounts[rp.stateOfMind] || 0) + 1;
        } catch { /* ignore parse errors */ }
      }

      // Retention
      const todayAgg = flatArr(results[base + 0]);
      const day7Agg = flatArr(results[base + 6]);
      if (parseInt(todayAgg.total || '0', 10) > 0) retentionDay1++;
      if (parseInt(day7Agg.total || '0', 10) > 0) retentionDay7++;

      // Insight latency: time between most recent moment and insight generation
      if (hasLlm) {
        try {
          const llmRaw = results[base + 8];
          const parsed = typeof llmRaw === 'string' ? JSON.parse(llmRaw) : null;
          const recentMoments = results[base + 11];
          if (parsed?.generatedAt && Array.isArray(recentMoments) && recentMoments.length > 0) {
            const latestMoment = typeof recentMoments[0] === 'string' ? JSON.parse(recentMoments[0]) : recentMoments[0];
            if (latestMoment?.timestamp) {
              const latency = new Date(parsed.generatedAt).getTime() - new Date(latestMoment.timestamp).getTime();
              if (latency > 0 && latency < 7 * 24 * 60 * 60 * 1000) {
                insightLatencies.push(latency);
              }
            }
          }
        } catch { /* ignore parse errors */ }
      }
    }

    const n = sample.length;
    const avgLoggingDays = n > 0 ? (totalLoggingDays / n).toFixed(1) : 0;
    const logsPerActiveUser = (n - dormantUsers) > 0
      ? (totalMomentsAllUsers / (n - dormantUsers)).toFixed(1)
      : 0;

    // Insight success rate: users with any insight / users with moments
    const usersWithMoments = n - dormantUsers;
    const insightSuccessRate = usersWithMoments > 0
      ? Math.round((usersWithInsight / usersWithMoments) * 100)
      : 0;

    // LLM vs rule ratio
    const totalInsights = ruleInsightCount + llmInsightCount;
    const llmRatio = totalInsights > 0 ? Math.round((llmInsightCount / totalInsights) * 100) : 0;

    // Avg insight latency
    const avgInsightLatency = insightLatencies.length > 0
      ? Math.round(insightLatencies.reduce((a, b) => a + b, 0) / insightLatencies.length)
      : null;

    // ── 14-Day Growth Trends ──────────────────────────────────────
    // For each of the last 14 days, compute: total logs, active users, new signups
    const trendDays = 14;
    const trendPipe = [];
    for (let d = 0; d < trendDays; d++) {
      const dayKey = daysAgoKey(d);
      for (const oid of sample) {
        trendPipe.push(['HGETALL', redisKey('daily', oid, dayKey)]);
      }
    }
    const trendResults = trendPipe.length > 0 ? await pipeline(trendPipe) : [];

    // Also count signups per day from createdAt (already in results)
    const signupsByDay = {};
    for (let u = 0; u < sample.length; u++) {
      const base = u * perUser;
      const userHash = flatArr(results[base + 10]);
      if (userHash.createdAt) {
        const day = userHash.createdAt.split('T')[0];
        signupsByDay[day] = (signupsByDay[day] || 0) + 1;
      }
    }

    const trends = [];
    for (let d = trendDays - 1; d >= 0; d--) {
      const dayKey = daysAgoKey(d);
      let dayLogs = 0;
      let dayActive = 0;
      for (let u = 0; u < sample.length; u++) {
        const agg = flatArr(trendResults[d * sample.length + u]);
        const t = parseInt(agg.total || '0', 10);
        dayLogs += t;
        if (t > 0) dayActive++;
      }
      trends.push({
        date: dayKey,
        label: dayKey.slice(5), // "MM-DD"
        logs: dayLogs,
        activeUsers: dayActive,
        newUsers: signupsByDay[dayKey] || 0,
      });
    }

    // Compute rolling 7-day retention for each day in the trend
    // retention[day] = activeUsers[day] / activeUsers[day-7] × 100
    for (let i = 0; i < trends.length; i++) {
      if (i >= 7 && trends[i - 7].activeUsers > 0) {
        trends[i].retention = Math.round((trends[i].activeUsers / trends[i - 7].activeUsers) * 100);
      } else {
        trends[i].retention = null;
      }
    }

    return res.status(200).json({
      kpis: {
        totalUsers: ownerIds.length,
        sampled: n,
        dau: retentionDay1,
        wau: n - dormantUsers,
        dauPercent: n > 0 ? Math.round((retentionDay1 / n) * 100) : 0,
        wauPercent: n > 0 ? Math.round(((n - dormantUsers) / n) * 100) : 0,
        avgLoggingDays: parseFloat(avgLoggingDays),
        powerUsers,
        multiDayUsers,
        singleDayUsers,
        dormantUsers,
        insightCoverage: n > 0 ? Math.round((insightViewEligible / n) * 100) : 0,
        retentionD1: n > 0 ? Math.round((retentionDay1 / n) * 100) : 0,
        retentionD7: n > 0 ? Math.round((retentionDay7 / n) * 100) : 0,
      },
      insightKpis: {
        insightSuccessRate,
        llmRatio,
        ruleRatio: totalInsights > 0 ? 100 - llmRatio : 0,
        ruleInsightCount,
        llmInsightCount,
        usersWithInsight,
        avgInsightLatencyMs: avgInsightLatency,
        insightCoverage: n > 0 ? Math.round((usersWithInsight / n) * 100) : 0,
      },
      engagementKpis: {
        logsPerActiveUser: parseFloat(logsPerActiveUser),
        secondLogWithin24h,
        secondLogRate: n > 0 ? Math.round((secondLogWithin24h / n) * 100) : 0,
        silentUsers3d,
        silentRate: n > 0 ? Math.round((silentUsers3d / n) * 100) : 0,
      },
      distributions: {
        triggers: triggerCounts,
        emotions: emotionCounts,
      },
      engagement: {
        powerUsers,
        multiDayUsers,
        singleDayUsers,
        dormantUsers,
      },
      trends,
      baseline: {
        usersWithBaseline: baselineScores.length,
        avgBaseline: baselineScores.length > 0
          ? Number((baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length).toFixed(2))
          : null,
        avgDrift: driftValues.length > 0
          ? Number((driftValues.reduce((a, b) => a + b, 0) / driftValues.length).toFixed(2))
          : null,
        avgStability: stabilityScores.length > 0
          ? Number((stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length).toFixed(2))
          : null,
        driftDistribution: {
          improving: driftValues.filter(d => d > 0.15).length,
          stable: driftValues.filter(d => d >= -0.15 && d <= 0.15).length,
          declining: driftValues.filter(d => d < -0.15).length,
        },
        stateOfMind: stateOfMindCounts,
      },
    });
  } catch (err) {
    console.error('Intelligence error:', err);
    return res.status(500).json({ error: 'Failed to fetch intelligence data' });
  }
}

function flatArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}
