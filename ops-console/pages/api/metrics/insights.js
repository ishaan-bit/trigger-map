import { requireAuth } from '../../../lib/auth.js';
import {
  sMembers,
  redisKey,
  pipeline,
  get,
} from '../../../lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    const ownerIds = await sMembers(redisKey('owners'));
    const sample = ownerIds.slice(0, 200);

    // Fetch stored insights for each user
    const pipeCommands = [];
    for (const oid of sample) {
      pipeCommands.push(['GET', redisKey('weekly_report', oid)]);
      pipeCommands.push(['GET', redisKey('llm_insight', oid)]);
      pipeCommands.push(['GET', redisKey('llm_free_pass', oid)]);
    }

    const results = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];
    const n = sample.length;

    let ruleBasedCount = 0;
    let llmCount = 0;
    let freePassCount = 0;
    const recentInsights = [];
    const insightModels = {};

    for (let i = 0; i < n; i++) {
      const ruleRaw = results[i * 3];
      const llmRaw = results[i * 3 + 1];
      const freePass = results[i * 3 + 2];

      if (ruleRaw) {
        ruleBasedCount++;
        try {
          const parsed = JSON.parse(ruleRaw);
          if (parsed.generatedAt) {
            recentInsights.push({
              ownerId: sample[i],
              type: 'rule-based',
              model: parsed.model || 'rule-based',
              confidence: parsed.confidence || 'unknown',
              generatedAt: parsed.generatedAt,
            });
          }
          const model = parsed.model || 'rule-based';
          insightModels[model] = (insightModels[model] || 0) + 1;
        } catch {}
      }

      if (llmRaw) {
        llmCount++;
        try {
          const parsed = JSON.parse(llmRaw);
          if (parsed.generatedAt) {
            recentInsights.push({
              ownerId: sample[i],
              type: 'llm',
              model: parsed.model || 'unknown',
              sectionCount: parsed.sectionCount || 0,
              generatedAt: parsed.generatedAt,
            });
          }
          const model = parsed.model || 'unknown-llm';
          insightModels[model] = (insightModels[model] || 0) + 1;
        } catch {}
      }

      if (freePass) freePassCount++;
    }

    // Sort recent insights by date desc
    recentInsights.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));

    return res.status(200).json({
      summary: {
        sampled: n,
        ruleBasedInsights: ruleBasedCount,
        llmInsights: llmCount,
        activeFreePass: freePassCount,
        coveragePercent: n > 0 ? Math.round((ruleBasedCount / n) * 100) : 0,
        llmCoveragePercent: n > 0 ? Math.round((llmCount / n) * 100) : 0,
      },
      insightModels,
      recentInsights: recentInsights.slice(0, 50),
    });
  } catch (err) {
    console.error('Insight metrics error:', err);
    return res.status(500).json({ error: 'Failed to fetch insight metrics' });
  }
}
