import { fileURLToPath } from "node:url";
import { generateInsight } from "../ai/generateInsight.js";
import { getWeeklyAggregates, listOwnerIds } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { getStoredWeeklyInsight, storeWeeklyInsight } from "../services/reportStore.js";

const INSIGHT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function windowElapsed(existing) {
  if (!existing?.generatedAt) return true;
  return Date.now() - new Date(existing.generatedAt).getTime() >= INSIGHT_WINDOW_MS;
}

const CONCURRENCY = 5;

async function processOwner(ownerId, force) {
  const existing = await getStoredWeeklyInsight(ownerId);

  if (!force && !windowElapsed(existing)) {
    return { ownerId, skipped: true, reason: "window-not-elapsed" };
  }

  const aggregates = await getWeeklyAggregates(ownerId);
  const report = generateWeeklyReport({ aggregates });
  if (!report.totalMoments) {
    return { ownerId, skipped: true, reason: "no-data" };
  }

  let insight;
  try {
    insight = await generateInsight(report);
  } catch (aiError) {
    return { ownerId, skipped: true, reason: `ai-failed: ${aiError.message}` };
  }

  const payload = {
    windowEnd: new Date().toISOString().slice(0, 10),
    summary: insight.summary,
    microExperiment: insight.microExperiment || null,
    confidence: insight.confidence,
    model: insight.model,
    generatedAt: insight.generatedAt,
  };

  await storeWeeklyInsight(ownerId, payload);
  console.log(`[generateWeeklyReports] Generated for ${ownerId.slice(0, 8)}... (${insight.confidence})`);
  return { ownerId, report: payload };
}

export async function runGenerateWeeklyReports({ force = false } = {}) {
  const startTime = Date.now();
  const owners = await listOwnerIds();
  console.log(`[generateWeeklyReports] Starting for ${owners.length} users (force=${force})`);

  // Process in parallel batches
  const results = [];
  for (let i = 0; i < owners.length; i += CONCURRENCY) {
    const batch = owners.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((ownerId) =>
        processOwner(ownerId, force).catch((error) => {
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
