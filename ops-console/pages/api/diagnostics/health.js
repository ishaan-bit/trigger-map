import { requireAuth } from '../../../lib/auth.js';
import {
  sMembers,
  redisKey,
  pipeline,
  hgetallObject,
  pingRedis,
  dbSize,
  get,
  keys,
} from '../../../lib/redis.js';
import { todayKey, daysAgoKey } from '../../../lib/utils.js';
import { getBackendHealth } from '../../../lib/backendClient.js';
import { getWorkerHealth, listModels } from '../../../lib/workerClient.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const diagnosticStart = Date.now();

  try {
    // ── Parallel health checks ──
    const [redisHealth, backendHealth, workerHealth, ollamaModels] = await Promise.all([
      pingRedis(),
      getBackendHealth().catch((err) => ({ ok: false, data: { error: err.message } })),
      getWorkerHealth().catch(() => ({ ok: false, data: null })),
      listModels().catch(() => ({ ok: false, data: null })),
    ]);

    // ── Environment validation ──
    const envChecks = {
      UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      BACKEND_URL: !!process.env.BACKEND_URL,
      BACKEND_INTERNAL_KEY: !!process.env.BACKEND_INTERNAL_KEY,
      LOCAL_WORKER_KEY: !!process.env.LOCAL_WORKER_KEY,
      OPS_PASSWORD: !!process.env.OPS_PASSWORD,
      OPS_JWT_SECRET: !!process.env.OPS_JWT_SECRET,
    };
    const envMissing = Object.entries(envChecks).filter(([, v]) => !v).map(([k]) => k);

    // ── Redis stats ──
    const totalKeys = await dbSize().catch(() => null);

    // ── Get owners for data quality checks ──
    const ownerIds = await sMembers(redisKey('owners'));
    const totalUsers = ownerIds.length;
    const sample = ownerIds.slice(0, 100);
    const today = todayKey();

    // ── Per-user pipeline: moments count, daily agg, subscription, insight, report ──
    const pipeCommands = [];
    for (const oid of sample) {
      pipeCommands.push(['LLEN', redisKey('moments', oid)]);
      pipeCommands.push(['HGETALL', redisKey('daily', oid, today)]);
      pipeCommands.push(['HGETALL', redisKey('subscription', oid)]);
      pipeCommands.push(['GET', redisKey('llm_insight', oid)]);
      pipeCommands.push(['GET', redisKey('weekly_report', oid)]);
    }

    const results = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];

    const anomalies = [];
    const dataQuality = {
      emptyMomentLists: 0,
      highVolumeUsers: 0,
      zeroTodayActivity: 0,
    };
    const coverage = {
      subscriptions: { premium: 0, expired: 0, gracePeriod: 0, cancelled: 0, none: 0 },
      llmInsights: { hasInsight: 0, staleInsight: 0 },
      weeklyReports: { hasReport: 0, staleReport: 0 },
    };
    const STALE_THRESHOLD = 8 * 24 * 60 * 60 * 1000; // 8 days

    for (let i = 0; i < sample.length; i++) {
      const base = i * 5;
      const momentCount = results[base] || 0;
      const dayAgg = flatArr(results[base + 1]);
      const subData = flatArr(results[base + 2]);
      const insightRaw = results[base + 3];
      const reportRaw = results[base + 4];
      const dayTotal = parseInt(dayAgg.total || '0', 10);

      // Data quality
      if (momentCount === 0) dataQuality.emptyMomentLists++;
      if (dayTotal > 50) {
        dataQuality.highVolumeUsers++;
        anomalies.push({
          type: 'high_volume', severity: 'warn',
          ownerId: sample[i], value: dayTotal,
          message: `User logged ${dayTotal} moments today — potential abuse or test data`,
        });
      }
      if (momentCount > 500) {
        anomalies.push({
          type: 'large_history', severity: 'info',
          ownerId: sample[i], value: momentCount,
          message: `User has ${momentCount} total moments — unusually large`,
        });
      }

      // Subscription coverage
      const subStatus = subData.status || 'none';
      if (subStatus === 'active') coverage.subscriptions.premium++;
      else if (subStatus === 'expired') coverage.subscriptions.expired++;
      else if (subStatus === 'grace_period') coverage.subscriptions.gracePeriod++;
      else if (subStatus === 'cancelled') coverage.subscriptions.cancelled++;
      else coverage.subscriptions.none++;

      // LLM insight coverage
      if (insightRaw) {
        coverage.llmInsights.hasInsight++;
        try {
          const ins = JSON.parse(insightRaw);
          if (ins.generatedAt && Date.now() - new Date(ins.generatedAt).getTime() > STALE_THRESHOLD) {
            coverage.llmInsights.staleInsight++;
          }
        } catch { /* ignore parse errors */ }
      }

      // Weekly report coverage
      if (reportRaw) {
        coverage.weeklyReports.hasReport++;
        try {
          const rpt = JSON.parse(reportRaw);
          if (rpt.generatedAt && Date.now() - new Date(rpt.generatedAt).getTime() > STALE_THRESHOLD) {
            coverage.weeklyReports.staleReport++;
          }
        } catch { /* ignore parse errors */ }
      }
    }

    dataQuality.zeroTodayActivity = sample.length - sample.filter((_, i) => {
      const dayAgg = flatArr(results[i * 5 + 1]);
      return parseInt(dayAgg.total || '0', 10) > 0;
    }).length;

    // Subscription anomalies
    if (coverage.subscriptions.expired > 0) {
      anomalies.push({
        type: 'expired_subscriptions', severity: 'warn',
        value: coverage.subscriptions.expired,
        message: `${coverage.subscriptions.expired} user(s) with expired subscriptions`,
      });
    }
    if (coverage.subscriptions.gracePeriod > 0) {
      anomalies.push({
        type: 'grace_period', severity: 'info',
        value: coverage.subscriptions.gracePeriod,
        message: `${coverage.subscriptions.gracePeriod} user(s) in subscription grace period`,
      });
    }

    // Stale content anomalies
    if (coverage.llmInsights.staleInsight > 0) {
      anomalies.push({
        type: 'stale_insights', severity: 'warn',
        value: coverage.llmInsights.staleInsight,
        message: `${coverage.llmInsights.staleInsight} user(s) have LLM insights older than 8 days`,
      });
    }
    if (coverage.weeklyReports.staleReport > 0) {
      anomalies.push({
        type: 'stale_reports', severity: 'warn',
        value: coverage.weeklyReports.staleReport,
        message: `${coverage.weeklyReports.staleReport} user(s) have weekly reports older than 8 days`,
      });
    }

    // ── 7-day trend ──
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

    const trend = weekTotals.reverse();
    if (trend.length >= 3) {
      const recent = trend.slice(-3).reduce((s, d) => s + d.total, 0);
      const earlier = trend.slice(0, 3).reduce((s, d) => s + d.total, 0);
      if (earlier > 0 && recent < earlier * 0.5) {
        anomalies.push({
          type: 'activity_decline', severity: 'critical',
          value: Math.round((1 - recent / earlier) * 100),
          message: `Activity dropped ${Math.round((1 - recent / earlier) * 100)}% in last 3 days vs prior 3 days`,
        });
      }
    }

    // Worker details
    const workerInfo = workerHealth.ok ? workerHealth.data : null;
    const activeJobs = workerInfo?.activeJobs || [];
    if (activeJobs.length > 0) {
      for (const job of activeJobs) {
        const elapsed = job.elapsed || 0;
        if (elapsed > 20 * 60 * 1000) {
          anomalies.push({
            type: 'long_running_job', severity: 'warn',
            value: Math.round(elapsed / 60000),
            message: `Job "${job.name}" has been running for ${Math.round(elapsed / 60000)} minutes`,
          });
        }
      }
    }

    // Sort anomalies by severity
    const severityOrder = { critical: 0, warn: 1, info: 2 };
    anomalies.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

    const diagnosticDuration = Date.now() - diagnosticStart;

    return res.status(200).json({
      checkedAt: new Date().toISOString(),
      durationMs: diagnosticDuration,
      systems: {
        redis: {
          status: redisHealth.ok ? 'healthy' : 'degraded',
          latencyMs: redisHealth.latency,
          error: redisHealth.error || null,
        },
        backend: {
          status: backendHealth.ok ? 'healthy' : 'degraded',
          statusCode: backendHealth.status,
          envReport: backendHealth.data?.env || null,
          error: backendHealth.data?.error || null,
        },
        worker: {
          status: workerHealth.ok ? 'healthy' : 'offline',
          uptime: workerInfo?.uptime || null,
          activeJobs,
        },
        ollama: {
          status: ollamaModels.ok ? 'healthy' : 'offline',
          models: ollamaModels.ok ? (ollamaModels.data?.models || []).map((m) => m.name || m) : [],
        },
      },
      environment: { checks: envChecks, missing: envMissing },
      redis: { totalKeys },
      totalUsers,
      sampleSize: sample.length,
      dataQuality,
      coverage,
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
