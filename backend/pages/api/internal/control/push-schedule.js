import { requireInternalAuth } from '../../../../lib/internalAuth.js';
import enableCors from '../../../../lib/cors.js';
import { redis, redisKey } from '../../../../services/redisClient.js';

const SCHEDULE_KEY = redisKey('push_schedule');

/**
 * GET  → return current schedule config
 * POST → update schedule config
 *
 * Config shape:
 * {
 *   enabled: boolean,
 *   daily: { enabled, amTime: "08:00", pmTime: "20:00" },    // IST times
 *   weekly: { enabled, days: [1, 4], time: "19:00" },         // IST, days 0=Sun..6=Sat
 *   nudge: { enabled, inactiveDays: 3 },
 * }
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;
  if (!requireInternalAuth(req, res)) return;

  if (req.method === 'GET') {
    const raw = await redis(['GET', SCHEDULE_KEY]);
    const config = raw ? JSON.parse(raw) : getDefaults();
    return res.status(200).json({ ok: true, schedule: config });
  }

  if (req.method === 'POST') {
    const config = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Invalid config' });
    }
    await redis(['SET', SCHEDULE_KEY, JSON.stringify(config)]);
    console.log('[push-schedule] Config updated:', JSON.stringify(config));
    return res.status(200).json({ ok: true, schedule: config });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function getDefaults() {
  return {
    enabled: false,
    daily: { enabled: false, amTime: '08:00', pmTime: '20:00' },
    weekly: { enabled: false, days: [0, 3], time: '19:00' },
    nudge: { enabled: false, inactiveDays: 3 },
  };
}
