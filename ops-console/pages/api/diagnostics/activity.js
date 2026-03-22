import { requireAuth } from '../../../lib/auth.js';
import {
  sMembers,
  redisKey,
  pipeline,
  lRange,
} from '../../../lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    const ownerIds = await sMembers(redisKey('owners'));
    const sample = ownerIds.slice(0, 100);

    // Get last 5 moments per user to check for recent activity
    const pipeCommands = [];
    for (const oid of sample) {
      pipeCommands.push(['LRANGE', redisKey('moments', oid), '-5', '-1']);
    }

    const results = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];

    const recentActivity = [];
    const triggerDistribution = {};
    const emotionDistribution = {};
    const hourDistribution = {};

    for (let i = 0; i < sample.length; i++) {
      const moments = (results[i] || []).map((m) => {
        try { return JSON.parse(m); } catch { return null; }
      }).filter(Boolean);

      for (const m of moments) {
        // Track trigger/emotion distributions
        if (m.trigger) triggerDistribution[m.trigger] = (triggerDistribution[m.trigger] || 0) + 1;
        if (m.emotion) emotionDistribution[m.emotion] = (emotionDistribution[m.emotion] || 0) + 1;

        // Track hour of logging
        if (m.timestamp) {
          const hour = new Date(m.timestamp).getUTCHours();
          hourDistribution[hour] = (hourDistribution[hour] || 0) + 1;
        }

        recentActivity.push({
          ownerId: sample[i],
          trigger: m.trigger,
          emotion: m.emotion,
          hasNote: !!m.note,
          hasTags: Array.isArray(m.tags) && m.tags.length > 0,
          timestamp: m.timestamp,
        });
      }
    }

    // Sort recent activity by timestamp desc
    recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({
      triggerDistribution,
      emotionDistribution,
      hourDistribution,
      recentActivity: recentActivity.slice(0, 100),
    });
  } catch (err) {
    console.error('Activity diagnostics error:', err);
    return res.status(500).json({ error: 'Failed to fetch activity data' });
  }
}
