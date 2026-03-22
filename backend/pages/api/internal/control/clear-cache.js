import { requireInternalAuth } from '../../../../lib/internalAuth.js';
import enableCors from '../../../../lib/cors.js';
import { redis, redisKey } from '../../../../services/redisClient.js';
import { listOwnerIds } from '../../../../services/aggregationService.js';

const ALLOWED_CACHES = ['weekly_report', 'llm_insight', 'llm_free_pass'];

export default async function handler(req, res) {
  if (enableCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireInternalAuth(req, res)) return;

  const { key } = req.body || {};

  if (!key || !ALLOWED_CACHES.includes(key)) {
    return res.status(400).json({ error: `Unknown or disallowed cache key: ${key}` });
  }

  try {
    const ownerIds = await listOwnerIds();
    let cleared = 0;

    // Delete cache keys for all owners in batches
    const batchSize = 50;
    for (let i = 0; i < ownerIds.length; i += batchSize) {
      const batch = ownerIds.slice(i, i + batchSize);
      const delCommands = batch.map((oid) => ['DEL', redisKey(key, oid)]);

      if (delCommands.length > 0) {
        const results = await Promise.all(
          delCommands.map((cmd) => redis(cmd).catch(() => 0))
        );
        cleared += results.filter((r) => r === 1).length;
      }
    }

    return res.status(200).json({
      ok: true,
      cacheKey: key,
      cleared,
      totalOwners: ownerIds.length,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Cache clear error [${key}]:`, err);
    return res.status(500).json({
      error: 'Cache clear failed',
      message: err.message,
    });
  }
}
