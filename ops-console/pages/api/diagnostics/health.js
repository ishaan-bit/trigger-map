import { requireAuth } from '../../../lib/auth.js';
import {
  sMembers,
  redisKey,
  pipeline,
  hgetallObject,
  pingRedis,
  lRange,
} from '../../../lib/redis.js';
import { todayKey, daysAgoKey } from '../../../lib/utils.js';
import { getBackendHealth } from '../../../lib/backendClient.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    // Parallel health checks
    const [redisHealth, backendHealth] = await Promise.all([
      pingRedis(),
      getBackendHealth().catch((err) => ({ ok: false, data: { error: err.message } })),
    ]);

    // Get owners for data quality checks
    const ownerIds = await sMembers(redisKey('owners'));
    const sample = ownerIds.slice(0, 100);
    const today = todayKey();

    // Check for data anomalies
    const pipeCommands = [];
    for (const oid of sample) {
      pipeCommands.push(['LLEN', redisKey('moments', oid)]);
      pipeCommands.push(['HGETALL', redisKey('daily', oid, today)]);
    }

    const results = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];

    const anomalies = [];
    const dataQuality = {
      emptyMomentLists: 0,
      highVolumeUsers: 0,
      zeroTodayActivity: 0,
    };

    for (let i = 0; i < sample.length; i++) {
      const momentCount = results[i * 2] || 0;
      const dayAgg = flatArr(results[i * 2 + 1]);
      const dayTotal = parseInt(dayAgg.total || '0', 10);

      if (momentCount === 0) {
        dataQuality.emptyMomentLists++;
      }

      if (dayTotal > 50) {
        dataQuality.highVolumeUsers++;
        anomalies.push({
          type: 'high_volume',
          ownerId: sample[i],
          value: dayTotal,
          message: `User logged ${dayTotal} moments today — potential abuse or test data`,
        });
      }

      if (momentCount > 0 && momentCount > 500) {
        anomalies.push({
          type: 'large_history',
          ownerId: sample[i],
          value: momentCount,
          message: `User has ${momentCount} total moments — unusually large`,
        });
      }
    }

    dataQuality.zeroTodayActivity = sample.length - sample.filter((_, i) => {
      const dayAgg = flatArr(results[i * 2 + 1]);
      return parseInt(dayAgg.total || '0', 10) > 0;
    }).length;

    // Check 7-day trend for drop-offs
    const weekTotals = [];
    for (let d = 0; d < 7; d++) {
      const dayKey = daysAgoKey(d);
      const dayPipe = sample.map((oid) => ['HGETALL', redisKey('daily', oid, dayKey)]);
      const dayResults = dayPipe.length > 0 ? await pipeline(dayPipe) : [];
      let daySum = 0;
      for (const r of dayResults) {
        const agg = flatArr(r);
        daySum += parseInt(agg.total || '0', 10);
      }
      weekTotals.push({ date: dayKey, total: daySum });
    }

    // Detect declines
    const trend = weekTotals.reverse();
    if (trend.length >= 3) {
      const recent = trend.slice(-3).reduce((s, d) => s + d.total, 0);
      const earlier = trend.slice(0, 3).reduce((s, d) => s + d.total, 0);
      if (earlier > 0 && recent < earlier * 0.5) {
        anomalies.push({
          type: 'activity_decline',
          value: Math.round((1 - recent / earlier) * 100),
          message: `Activity dropped ${Math.round((1 - recent / earlier) * 100)}% in last 3 days vs prior 3 days`,
        });
      }
    }

    return res.status(200).json({
      systems: {
        redis: {
          status: redisHealth.ok ? 'healthy' : 'degraded',
          latencyMs: redisHealth.latency,
          error: redisHealth.error || null,
        },
        backend: {
          status: backendHealth.ok ? 'healthy' : 'degraded',
          statusCode: backendHealth.status,
          error: backendHealth.data?.error || null,
        },
      },
      dataQuality,
      anomalies,
      weeklyTrend: trend,
    });
  } catch (err) {
    console.error('Diagnostics error:', err);
    return res.status(500).json({ error: 'Failed to fetch diagnostics' });
  }
}

function flatArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}
