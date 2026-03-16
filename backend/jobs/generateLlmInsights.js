/**
 * Local LLM insight generation job.
 *
 * Run manually:
 *   node backend/jobs/generateLlmInsights.js
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { generateLlmInsight } from "../ai/generateLlmInsight.js";
import { getWeeklyAggregates, listOwnerIds } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { isPremiumActive } from "../services/premiumService.js";
import { redis, redisKey } from "../services/redisClient.js";
import { getStoredLlmInsight, getLlmInsightKey } from "../services/reportStore.js";

const LLM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

async function storeLlmInsight(ownerId, payload) {
  await redis(["SET", getLlmInsightKey(ownerId), JSON.stringify(payload)]);
  return payload;
}

export async function runGenerateLlmInsights() {
  const owners = await listOwnerIds();
  const results = [];
  let processed = 0;
  let skipped = 0;

  console.log(`Found ${owners.length} total owners. Filtering for premium...`);

  for (const ownerId of owners) {
    try {
      const premium = await isPremiumActive(ownerId);
      if (!premium) { skipped++; continue; }

      const existing = await getStoredLlmInsight(ownerId);
      if (existing?.generatedAt) {
        const elapsed = Date.now() - new Date(existing.generatedAt).getTime();
        if (elapsed < LLM_WINDOW_MS) {
          results.push({ ownerId, skipped: true, reason: "window-not-elapsed" });
          skipped++;
          continue;
        }
      }

      const aggregates = await getWeeklyAggregates(ownerId);
      const weeklyReport = generateWeeklyReport({ aggregates });

      if (!weeklyReport.totalMoments) {
        results.push({ ownerId, skipped: true, reason: "no-data" });
        skipped++;
        continue;
      }

      console.log(`Generating LLM insight for ${ownerId.slice(0, 8)}... (${weeklyReport.totalMoments} moments)`);

      const insight = await generateLlmInsight({ weeklyReport });

      await storeLlmInsight(ownerId, insight);
      processed++;
      results.push({ ownerId, generated: true, model: insight.model });
      console.log(`  Done (${insight.model})`);

    } catch (error) {
      results.push({ ownerId, skipped: true, reason: error.message });
      console.error(`  Failed for ${ownerId.slice(0, 8)}: ${error.message}`);
    }
  }

  return { processed, skipped, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log("=== QuietDen LLM Insight Generator ===");
  console.log(`LLM endpoint: ${process.env.LLM_API_URL || "http://localhost:11434/v1"}`);
  console.log(`Model: ${process.env.LLM_MODEL || "mistral"}`);
  console.log("");

  runGenerateLlmInsights()
    .then(({ processed, skipped, results }) => {
      console.log("");
      console.log(`Done. Generated: ${processed}, Skipped: ${skipped}`);
      if (results.filter(r => r.generated).length) {
        console.log("Generated for:", results.filter(r => r.generated).map(r => r.ownerId.slice(0, 8)).join(", "));
      }
    })
    .catch((error) => {
      console.error("Fatal error:", error.message);
      process.exitCode = 1;
    });
}
