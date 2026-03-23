import { requireAuth } from '../../../lib/auth.js';
import { triggerJob, clearCache, getBackendHealth } from '../../../lib/backendClient.js';
import { runLlmInsights, runFreePass, cancelWorkerJob, getWorkerHealth, listModels, pullModel } from '../../../lib/workerClient.js';
import { pingRedis, sMembers, redisKey } from '../../../lib/redis.js';

// Jobs that run on the local worker (LLM inference)
const LOCAL_JOBS = new Set(['generateLlmInsights', 'generateFreePass']);

// Jobs that run on the Vercel backend (rule-based)
const BACKEND_JOBS = new Set(['generateWeeklyReports']);

const ALLOWED_CACHES = [
  'weekly_report',
  'llm_insight',
  'llm_free_pass',
  'action_feedback',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const { action, target, params } = req.body || {};

  if (!action || !target) {
    return res.status(400).json({ error: 'action and target required' });
  }

  const startTime = Date.now();

  try {
    // ── Run Job ──
    if (action === 'run-job') {
      // Local worker jobs (LLM)
      if (LOCAL_JOBS.has(target)) {
        const workerParams = {
          model: params?.llmModel,
          force: !!params?.force,
          minMoments: params?.minMoments,
          maxWords: params?.maxWords,
          ownerIds: params?.ownerIds,
        };
        let result;
        if (target === 'generateLlmInsights') {
          result = await runLlmInsights(workerParams);
        } else {
          result = await runFreePass(workerParams);
        }
        const duration = Date.now() - startTime;
        return res.status(result.ok ? 200 : 502).json({
          ok: result.ok,
          action,
          target,
          source: 'local-worker',
          durationMs: duration,
          result: result.data,
        });
      }

      // Backend jobs (rule-based)
      if (BACKEND_JOBS.has(target)) {
        const result = await triggerJob(target, params || {});
        const duration = Date.now() - startTime;
        return res.status(result.ok ? 200 : 502).json({
          ok: result.ok,
          action,
          target,
          source: 'backend',
          durationMs: duration,
          result: result.data,
          ...(result.ok ? {} : { error: result.data?.error || `Backend returned ${result.status}` }),
        });
      }

      return res.status(400).json({ error: `Job not allowed: ${target}` });
    }

    // ── Cancel Job ──
    if (action === 'cancel-job') {
      const result = await cancelWorkerJob(target);
      return res.status(result.ok ? 200 : 400).json({
        ok: result.ok,
        action,
        target,
        source: 'local-worker',
        result: result.data,
      });
    }

    // ── Clear Cache ──
    if (action === 'clear-cache') {
      if (!ALLOWED_CACHES.includes(target)) {
        return res.status(400).json({ error: `Cache key not allowed: ${target}` });
      }
      const result = await clearCache(target);
      return res.status(200).json({ ok: true, action, target, source: 'backend', result: result.data });
    }

    // ── Ping ──
    if (action === 'ping') {
      if (target === 'redis') {
        const result = await pingRedis();
        return res.status(200).json({ ok: true, action, target, result });
      }
      if (target === 'backend') {
        const result = await getBackendHealth();
        return res.status(200).json({ ok: true, action, target, result: result.data });
      }
      if (target === 'local-worker') {
        const result = await getWorkerHealth();
        return res.status(200).json({ ok: result.ok, action, target, result: result.data });
      }
    }

    // ── Count Owners ──
    if (action === 'count-owners') {
      const owners = await sMembers(redisKey('owners'));
      return res.status(200).json({ ok: true, action, target: 'owners', result: { count: owners.length } });
    }

    // ── List Models ──
    if (action === 'list-models') {
      const result = await listModels();
      return res.status(result.ok ? 200 : 502).json({
        ok: result.ok,
        action,
        result: result.data,
      });
    }

    // ── Pull Model ──
    if (action === 'pull-model') {
      const result = await pullModel(target);
      return res.status(result.ok ? 200 : 502).json({
        ok: result.ok,
        action,
        target,
        result: result.data,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('Control action error:', err);
    return res.status(500).json({
      error: 'Control action failed',
      message: err.message,
      durationMs: duration,
    });
  }
}
