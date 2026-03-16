import { fileURLToPath } from "node:url";
import { generateInsight } from "../ai/generateInsight.js";
import { getWeeklyAggregates, listOwnerIds } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { getStoredWeeklyInsight, storeWeeklyInsight } from "../services/reportStore.js";

const INSIGHT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns true when this owner's 7-day window has elapsed since their last
 * generated report. Also returns true when no report exists yet.
 */
function windowElapsed(existing) {
  if (!existing?.generatedAt) {
    return true;
  }
  return Date.now() - new Date(existing.generatedAt).getTime() >= INSIGHT_WINDOW_MS;
}

export async function runGenerateWeeklyReports() {
  const owners = await listOwnerIds();
  const results = [];

  for (const ownerId of owners) {
    try {
      const existing = await getStoredWeeklyInsight(ownerId);

      // Only process users whose rolling 7-day window has just completed
      if (!windowElapsed(existing)) {
        results.push({ ownerId, skipped: true, reason: "window-not-elapsed" });
        continue;
      }

      const aggregates = await getWeeklyAggregates(ownerId);
      const report = generateWeeklyReport({ aggregates });
      if (!report.totalMoments) {
        results.push({ ownerId, skipped: true, reason: "no-data" });
        continue;
      }

      // Generate rule-based insights for ALL users with data
      let insight;
      try {
        insight = await generateInsight({
          triggerData: JSON.stringify(report.triggerFrequency),
          emotionData: JSON.stringify(report.emotionFrequency),
          volatility: report.volatilityChange,
          stableDay: report.mostStableDay,
        });
      } catch (aiError) {
        results.push({ ownerId, skipped: true, reason: `ai-failed: ${aiError.message}` });
        continue;
      }

      const payload = {
        windowEnd: new Date().toISOString().slice(0, 10),
        summary: insight.summary,
        suggestion: insight.suggestion,
        microExperiment: insight.microExperiment || null,
        model: insight.model,
        generatedAt: new Date().toISOString(),
      };

      await storeWeeklyInsight(ownerId, payload);
      results.push({ ownerId, report: payload });
    } catch (error) {
      results.push({ ownerId, skipped: true, reason: error.message || "generation-failed" });
    }
  }

  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runGenerateWeeklyReports()
    .then((results) => {
      console.log(JSON.stringify({ ok: true, generated: results.length, results }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
      process.exitCode = 1;
    });
}