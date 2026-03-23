import { requireAuth } from '../../../lib/auth.js';
import { sMembers, pipeline, redisKey } from '../../../lib/redis.js';

function flatArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const minMoments = Math.max(1, parseInt(req.query.minMoments, 10) || 1);

  try {
    const ownerIds = await sMembers(redisKey('owners'));
    if (!ownerIds || ownerIds.length === 0) {
      return res.status(200).json({ users: [], total: 0 });
    }

    // Pipeline: LLEN moments + HGETALL user hash per owner
    const cmds = [];
    for (const oid of ownerIds) {
      cmds.push(['LLEN', redisKey('moments', oid)]);
      cmds.push(['HGETALL', redisKey('user', oid)]);
    }

    const results = await pipeline(cmds);
    const users = [];

    for (let i = 0; i < ownerIds.length; i++) {
      const momentCount = results[i * 2] || 0;
      const userHash = flatArr(results[i * 2 + 1]);

      // Must be signed-in (has user hash with email or name)
      if (!userHash.email && !userHash.name) continue;
      // Must meet min-moments threshold
      if (momentCount < minMoments) continue;

      users.push({
        ownerId: ownerIds[i],
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
