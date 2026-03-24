import { fileURLToPath } from "node:url";
import { generateInsight } from "../ai/generateInsight.js";
import { getWeeklyAggregates, listOwnerIds } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { generateActions } from "../services/actionEngine.js";
import { getStoredWeeklyInsight, storeWeeklyInsight, getActionFeedback, getActionPrefs } from "../services/reportStore.js";
import { getUserById } from "../services/authService.js";
import { phraseText, extractFirstName } from "../utils/phrasingLayer.js";

const INSIGHT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function windowElapsed(existing) {
  if (!existing?.generatedAt) return true;
  return Date.now() - new Date(existing.generatedAt).getTime() >= INSIGHT_WINDOW_MS;
}

const CONCURRENCY = 5;

async function processOwner(ownerId, force, { personalize = true } = {}) {
  const existing = await getStoredWeeklyInsight(ownerId);

  if (!force && !windowElapsed(existing)) {
    return { ownerId, skipped: true, reason: "window-not-elapsed" };
  }

  const aggregates = await getWeeklyAggregates(ownerId);
  const allAggregates = await getWeeklyAggregates(ownerId, 45);
  const previousAggregates = allAggregates.length >= 14 ? allAggregates.slice(-14, -7) : null;
  const report = generateWeeklyReport({ aggregates, allAggregates, previousAggregates });
  if (!report.totalMoments) {
    return { ownerId, skipped: true, reason: "no-data" };
  }

  // Fetch user for name personalization
  const user = personalize ? await getUserById(ownerId).catch(() => null) : null;
  const firstName = personalize ? extractFirstName(user?.name) : null;

  let insight;
  try {
    insight = await generateInsight(report, { firstName });
  } catch (aiError) {
    return { ownerId, skipped: true, reason: `ai-failed: ${aiError.message}` };
  }

  // Generate action cards from the full report (feedback-aware)
  const [actionFeedback, actionPrefs] = await Promise.all([
    getActionFeedback(ownerId),
    getActionPrefs(ownerId),
  ]);
  const actions = generateActions(report, actionFeedback || [], actionPrefs);

  // Polish text: local deterministic cleanup
  insight.summary = await phraseText(insight.summary, { firstName });
  for (const a of actions) {
    a.reason = await phraseText(a.reason, { firstName });
  }

  const bm = report.baselineMetrics;
  const payload = {
    windowEnd: new Date().toISOString().slice(0, 10),
    summary: insight.summary,
    microExperiment: insight.microExperiment || null,
    confidence: insight.confidence,
    model: insight.model,
    generatedAt: insight.generatedAt,
    stateOfMind: insight.stateOfMind || null,
    baselineSummary: insight.baselineSummary || null,
    baselineScore: bm?.baseline?.score ?? null,
    driftValue: bm?.drift?.value ?? null,
    driftLabel: bm?.drift?.label ?? null,
    stabilityScore: bm?.stability?.score ?? null,
    recoveryDays: bm?.recoveryLatency?.days ?? null,
    // New v78 fields
    actionsCount: actions.length,
    actionTypes: actions.map(a => a.type),
    hasDeltaData: !!report.weeklyDeltas,
    changeHighlightsCount: report.changeHighlights?.length ?? 0,
    // v81 continuity fields
    topRecurrence: report.recurrence?.[0] ? `${report.recurrence[0].trigger}+${report.recurrence[0].emotion} (${report.recurrence[0].count}x, ${report.recurrence[0].label})` : null,
    positiveStreakDays: report.positiveStreak?.days ?? null,
    negativeStreakDays: report.negativeStreak?.days ?? null,
  };

  await storeWeeklyInsight(ownerId, payload);
  console.log(`[generateWeeklyReports] Generated for ${ownerId.slice(0, 8)}... (${insight.confidence})`);
  return { ownerId, report: payload };
}

export async function runGenerateWeeklyReports({ force = false, ownerIds, personalize = true } = {}) {
  const startTime = Date.now();
  const owners = Array.isArray(ownerIds) && ownerIds.length > 0
    ? ownerIds
    : await listOwnerIds();
  console.log(`[generateWeeklyReports] Starting for ${owners.length} users (force=${force}${ownerIds ? ', filtered' : ''}${!personalize ? ', no-personalize' : ''})`);

  // Process in parallel batches
  const results = [];
  for (let i = 0; i < owners.length; i += CONCURRENCY) {
    const batch = owners.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((ownerId) =>
        processOwner(ownerId, force, { personalize }).catch((error) => {
          console.error(`[generateWeeklyReports] Error for ${ownerId.slice(0, 8)}...: ${error.message}`);
          return { ownerId, skipped: true, reason: error.message || "generation-failed" };
        })
      )
    );
    results.push(...batchResults);
  }

  const durationMs = Date.now() - startTime;
  const generated = results.filter(r => r.report).length;
  const skipped = results.filter(r => r.skipped).length;
  console.log(`[generateWeeklyReports] Done in ${durationMs}ms — ${generated} generated, ${skipped} skipped`);

  return { users: owners.length, generated, skipped, durationMs, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const force = process.argv.includes('--force');
  runGenerateWeeklyReports({ force })
    .then((output) => {
      console.log(JSON.stringify({ ok: true, ...output }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exitCode = 1;
    });
}
