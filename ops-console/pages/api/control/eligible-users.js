import { requireAuth } from '../../../lib/auth.js';
import { sMembers, pipeline, redisKey, keys } from '../../../lib/redis.js';

function flatArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const minMoments = Math.max(0, parseInt(req.query.minMoments, 10) || 0);

  try {
    // Get owners from the owners set (users who have logged moments)
    const ownerIds = await sMembers(redisKey('owners')) || [];

    // Also discover registered users not yet in the owners set
    // (signed in but never logged a moment)
    const userKeys = await keys(redisKey('user', '*')) || [];
    const registeredIds = userKeys
      .map(k => k.replace(redisKey('user', ''), ''))
      .filter(id => id && id.length > 8);
    const allIds = [...new Set([...ownerIds, ...registeredIds])];

    if (allIds.length === 0) {
      return res.status(200).json({ users: [], total: 0 });
    }

    // Pipeline: LLEN moments + HGETALL user hash per owner
    const cmds = [];
    for (const oid of allIds) {
      cmds.push(['LLEN', redisKey('moments', oid)]);
      cmds.push(['HGETALL', redisKey('user', oid)]);
    }

    const results = await pipeline(cmds);
    const users = [];

    for (let i = 0; i < allIds.length; i++) {
      const momentCount = results[i * 2] || 0;
      const userHash = flatArr(results[i * 2 + 1]);

      // Must be signed-in (has user hash with email or name)
      if (!userHash.email && !userHash.name) continue;
      // Must meet min-moments threshold
      if (momentCount < minMoments) continue;

      users.push({
        ownerId: allIds[i],
        name: userHash.name || null,
        email: userHash.email || null,
        momentCount,
        isAnonymous: !userHash.email,
      });
    }

    // Sort by moment count descending
    users.sort((a, b) => b.momentCount - a.momentCount);

    return res.status(200).json({ users, total: users.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
