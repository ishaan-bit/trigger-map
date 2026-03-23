import { requireAuth } from '../../../lib/auth.js';
import {
  sMembers,
  redisKey,
  pipeline,
  get,
  lRange,
} from '../../../lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  try {
    const ownerIds = await sMembers(redisKey('owners'));
    const sample = ownerIds.slice(0, 200);

    // Fetch stored insights + user hash + action feedback for each user
    const pipeCommands = [];
    for (const oid of sample) {
      pipeCommands.push(['GET', redisKey('weekly_report', oid)]);
      pipeCommands.push(['GET', redisKey('llm_insight', oid)]);
      pipeCommands.push(['GET', redisKey('llm_free_pass', oid)]);
      pipeCommands.push(['HGETALL', redisKey('user', oid)]);
      pipeCommands.push(['LRANGE', redisKey('action_feedback', oid), '0', '-1']);
    }

    const results = pipeCommands.length > 0 ? await pipeline(pipeCommands) : [];
    const n = sample.length;

    let ruleBasedCount = 0;
    let llmCount = 0;
    let freePassCount = 0;
    const recentInsights = [];
    const insightModels = {};

    // Action engine metrics
    let usersWithActions = 0;
    let totalActionsGenerated = 0;
    let totalFeedbackEntries = 0;
    let triedCount = 0;
    let skippedCount = 0;
    const actionTypeBreakdown = {};

    for (let i = 0; i < n; i++) {
      const ruleRaw = results[i * 5];
      const llmRaw = results[i * 5 + 1];
      const freePass = results[i * 5 + 2];
      const userHash = flatArr(results[i * 5 + 3]);
      const feedbackRaw = results[i * 5 + 4] || [];

      if (ruleRaw) {
        ruleBasedCount++;
        try {
          const parsed = JSON.parse(ruleRaw);
          if (parsed.generatedAt) {
            recentInsights.push({
              ownerId: sample[i],
              name: userHash.name || null,
              email: userHash.email || null,
              type: 'rule-based',
              model: parsed.model || 'rule-based',
              confidence: parsed.confidence || 'unknown',
              generatedAt: parsed.generatedAt,
            });
          }
          const model = parsed.model || 'rule-based';
          insightModels[model] = (insightModels[model] || 0) + 1;

          // Count actions from weekly report
          if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
            usersWithActions++;
            totalActionsGenerated += parsed.actions.length;
            for (const action of parsed.actions) {
              if (action.type) {
                actionTypeBreakdown[action.type] = (actionTypeBreakdown[action.type] || 0) + 1;
              }
            }
          }
        } catch {}
      }

      if (llmRaw) {
        llmCount++;
        try {
          const parsed = JSON.parse(llmRaw);
          if (parsed.generatedAt) {
            recentInsights.push({
              ownerId: sample[i],
              name: userHash.name || null,
              email: userHash.email || null,
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

      // Action feedback
      if (Array.isArray(feedbackRaw) && feedbackRaw.length > 0) {
        for (const raw of feedbackRaw) {
          try {
            const fb = JSON.parse(raw);
            totalFeedbackEntries++;
            if (fb.response === 'tried') triedCount++;
            else if (fb.response === 'skipped') skippedCount++;
          } catch {}
        }
      }
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
      actionEngine: {
        usersWithActions,
        totalActionsGenerated,
        totalFeedbackEntries,
        triedCount,
        skippedCount,
        triedPercent: totalFeedbackEntries > 0 ? Math.round((triedCount / totalFeedbackEntries) * 100) : 0,
        actionTypeBreakdown,
      },
      insightModels,
      recentInsights: recentInsights.slice(0, 50),
    });
  } catch (err) {
    console.error('Insight metrics error:', err);
    return res.status(500).json({ error: 'Failed to fetch insight metrics' });
  }
}

function flatArr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}
