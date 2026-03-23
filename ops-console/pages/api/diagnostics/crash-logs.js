import { requireAuth } from '../../../lib/auth.js';
import { lRange, lLen, redisKey } from '../../../lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const key = redisKey('crash_logs');

    const [totalCount, rawLogs] = await Promise.all([
      lLen(key),
      lRange(key, 0, limit - 1),
    ]);

    const logs = (rawLogs || []).map((raw) => {
      try { return JSON.parse(raw); } catch { return null; }
    }).filter(Boolean);

    return res.status(200).json({
      total: totalCount || 0,
      logs,
    });
  } catch (err) {
    console.error('Crash logs fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch crash logs' });
  }
}
