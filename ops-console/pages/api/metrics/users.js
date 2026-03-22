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

    // For each user: get today's aggregate, moment count, user hash, subscription
    const pipeCommands = [];
    for (const oid of ownerIds.slice(0, 200)) {
      pipeCommands.push(['HGETALL', redisKey('daily', oid, today)]);
      pipeCommands.push(['LLEN', redisKey('moments', oid)]);
      pipeCommands.push(['HGETALL', redisKey('user', oid)]);
      pipeCommands.push(['GET', redisKey('subscription', oid)]);
    }

    const results = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];
    const n = Math.min(ownerIds.length, 200);
    const users = [];

    for (let i = 0; i < n; i++) {
      const agg = flatArr(results[i * 4]);
      const momentCount = results[i * 4 + 1] || 0;
      const userHash = flatArr(results[i * 4 + 2]);
      const sub = results[i * 4 + 3];

      let subscription = null;
      if (sub) {
        try { subscription = JSON.parse(sub); } catch {}
      }

      users.push({
        ownerId: ownerIds[i],
        name: userHash.name || null,
        email: userHash.email || null,
        provider: userHash.provider || null,
        isAnonymous: !userHash.email,
        momentCount,
        todayMoments: parseInt(agg.total || '0', 10),
        subscription: subscription?.status || 'none',
        createdAt: userHash.createdAt || null,
      });
    }

    // Sort by recent activity
    users.sort((a, b) => b.todayMoments - a.todayMoments || b.momentCount - a.momentCount);

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
