import { requireAuth } from '../../../lib/auth.js';
import {
  sMembers,
  hgetallObject,
  lRange,
  redisKey,
  pipeline,
  get,
} from '../../../lib/redis.js';
import { todayKey, daysAgoKey } from '../../../lib/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    const ownerIds = await sMembers(redisKey('owners'));
    const today = todayKey();

    // For each user: get today's aggregate, moment count, user hash, subscription, push tokens
    // Cap at 500 to stay within Upstash pipeline limits (5 cmds × 500 = 2500)
    const CAP = 500;
    const pipeCommands = [];
    for (const oid of ownerIds.slice(0, CAP)) {
      pipeCommands.push(['HGETALL', redisKey('daily', oid, today)]);
      pipeCommands.push(['LLEN', redisKey('moments', oid)]);
      pipeCommands.push(['HGETALL', redisKey('user', oid)]);
      pipeCommands.push(['HGETALL', redisKey('subscription', oid)]);
      pipeCommands.push(['HGETALL', redisKey('push_tokens', oid)]);
    }

    const results = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];
    const n = Math.min(ownerIds.length, CAP);
    const users = [];

    for (let i = 0; i < n; i++) {
      const agg = flatArr(results[i * 5]);
      const momentCount = results[i * 5 + 1] || 0;
      const userHash = flatArr(results[i * 5 + 2]);
      const subRaw = results[i * 5 + 3];
      const subscription = flatArr(subRaw);
      const pushTokensRaw = flatArr(results[i * 5 + 4]);

      // Parse push token entries to extract device info
      const devices = [];
      for (const [deviceId, entryJson] of Object.entries(pushTokensRaw)) {
        try {
          const entry = JSON.parse(entryJson);
          devices.push({
            deviceId: deviceId.slice(0, 8),
            platform: entry.platform || 'unknown',
            updatedAt: entry.updatedAt || null,
          });
        } catch {
          // skip malformed entries
        }
      }

      users.push({
        ownerId: ownerIds[i],
        name: userHash.name || null,
        email: userHash.email || null,
        provider: userHash.provider || null,
        hasPassword: !!userHash.passwordHash,
        isAnonymous: !userHash.email,
        momentCount,
        todayMoments: parseInt(agg.total || '0', 10),
        subscription: subscription?.status || 'none',
        createdAt: userHash.createdAt || null,
        devices,
        hasDevices: devices.length > 0,
      });
    }

    // Sort newest-first: today's active users first, then by total moments, then by createdAt
    users.sort((a, b) =>
      b.todayMoments - a.todayMoments ||
      b.momentCount - a.momentCount ||
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    const authenticated = users.filter((u) => !u.isAnonymous).length;
    const anonymous = users.filter((u) => u.isAnonymous).length;
    const googleUsers = users.filter((u) => u.provider === 'google').length;
    const emailUsers = users.filter((u) => u.provider === 'email').length;
    const premium = users.filter((u) => u.subscription === 'active' || u.subscription === 'grace_period').length;

    return res.status(200).json({
      summary: {
        total: ownerIds.length,
        sampled: n,
        authenticated,
        anonymous,
        google: googleUsers,
        email: emailUsers,
        premium,
      },
      users,
    });
  } catch (err) {
    console.error('User metrics error:', err);
    return res.status(500).json({ error: 'Failed to fetch user metrics' });
  }
}

function flatArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}
