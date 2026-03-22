import { requireAuth } from '../../../lib/auth.js';
import {
  pingRedis,
  sMembers,
  sCard,
  hgetallObject,
  lRange,
  redisKey,
  pipeline,
  dbSize,
  get,
} from '../../../lib/redis.js';
import { todayKey, daysAgoKey } from '../../../lib/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    const today = todayKey();

    // Parallel batch 1: core counts
    const [redisHealth, totalOwners, totalKeys] = await Promise.all([
      pingRedis(),
      sCard(redisKey('owners')),
      dbSize(),
    ]);

    // Get all owner IDs for deeper metrics
    const ownerIds = await sMembers(redisKey('owners'));

    // Build pipeline for today's aggregates and moment counts
    const pipeCommands = [];
    const sampleOwners = ownerIds.slice(0, 100); // Cap to avoid huge pipelines

    for (const oid of sampleOwners) {
      pipeCommands.push(['HGETALL', redisKey('daily', oid, today)]);
      pipeCommands.push(['LLEN', redisKey('moments', oid)]);
    }

    // Day-over-day: also fetch yesterday
    const yesterday = daysAgoKey(1);
    for (const oid of sampleOwners) {
      pipeCommands.push(['HGETALL', redisKey('daily', oid, yesterday)]);
    }

    const pipeResults = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];

    // Parse results
    let todayMoments = 0;
    let totalMoments = 0;
    let activeToday = 0;
    let yesterdayMoments = 0;
    let activeYesterday = 0;

    const n = sampleOwners.length;
    for (let i = 0; i < n; i++) {
      // Today aggregate
      const todayAgg = flatArr(pipeResults[i * 2]);
      const todayTotal = parseInt(todayAgg.total || '0', 10);
      todayMoments += todayTotal;
      if (todayTotal > 0) activeToday++;

      // Total moments
      const momentCount = pipeResults[i * 2 + 1] || 0;
      totalMoments += momentCount;

      // Yesterday aggregate
      const yesterdayAgg = flatArr(pipeResults[n * 2 + i]);
      const yTotal = parseInt(yesterdayAgg.total || '0', 10);
      yesterdayMoments += yTotal;
      if (yTotal > 0) activeYesterday++;
    }

    // 7-day trend
    const weekCommands = [];
    for (let d = 0; d < 7; d++) {
      const dayKey = daysAgoKey(d);
      for (const oid of sampleOwners) {
        weekCommands.push(['HGETALL', redisKey('daily', oid, dayKey)]);
      }
    }

    const weekResults = weekCommands.length > 0 ? await pipeline(weekCommands) : [];
    const weeklyTrend = [];
    for (let d = 0; d < 7; d++) {
      let dayTotal = 0;
      let dayActive = 0;
      for (let i = 0; i < n; i++) {
        const agg = flatArr(weekResults[d * n + i]);
        const t = parseInt(agg.total || '0', 10);
        dayTotal += t;
        if (t > 0) dayActive++;
      }
      weeklyTrend.push({ date: daysAgoKey(d), moments: dayTotal, activeUsers: dayActive });
    }

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      redis: redisHealth,
      totalKeys,
      users: {
        total: totalOwners,
        sampled: sampleOwners.length,
        activeToday,
        activeYesterday,
      },
      moments: {
        total: totalMoments,
        today: todayMoments,
        yesterday: yesterdayMoments,
        deltaPercent:
          yesterdayMoments > 0
            ? Math.round(((todayMoments - yesterdayMoments) / yesterdayMoments) * 100)
            : todayMoments > 0
              ? 100
              : 0,
      },
      weeklyTrend: weeklyTrend.reverse(),
    });
  } catch (err) {
    console.error('Metrics overview error:', err);
    return res.status(500).json({ error: 'Failed to fetch metrics' });
  }
}

function flatArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}
