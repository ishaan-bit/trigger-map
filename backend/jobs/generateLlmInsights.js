/**
 * Local LLM insight generation job.
 *
 * Run manually every 2-3 days from your machine:
 *   node backend/jobs/generateLlmInsights.js
 *
 * Prerequisites:
 *   1. Local LLM server running (Ollama, llama.cpp, or LM Studio)
 *   2. .env with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   3. Optional: LLM_API_URL (default http://localhost:11434/v1)
 *   4. Optional: LLM_MODEL (default mistral)
 *
 * Flow:
 *   1. List all owner IDs from Redis
 *   2. Filter to premium subscribers only
 *   3. For each, check if LLM insight window has elapsed (≥3 days since last)
 *   4. Gather weekly report + historical reports
 *   5. Call local LLM to generate personalized narrative
 *   6. Store result in Redis under a separate key from rule-based insights
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { generateLlmInsight } from "../ai/generateLlmInsight.js";
import { getWeeklyAggregates, listOwnerIds } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { isPremiumActive } from "../services/premiumService.js";
import { redis, redisKey } from "../services/redisClient.js";
import { getStoredLlmInsight, getLlmInsightKey } from "../services/reportStore.js";

const LLM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

async function storeLlmInsight(ownerId, payload) {
  await redis(["SET", getLlmInsightKey(ownerId), JSON.stringify(payload)]);
  return payload;
}

async function getHistoricalSummaries(ownerId) {
  // Retrieve last 4 weekly rule-based reports for context
  const key = redisKey("weekly_report", ownerId);
  const raw = await redis(["GET", key]);
  if (!raw) return [];
  try {
    const report = JSON.parse(raw);
    return report ? [report] : [];
  } catch { return []; }
}

export async function runGenerateLlmInsights() {
  const owners = await listOwnerIds();
  const results = [];
  let processed = 0;
  let skipped = 0;

  console.log(`Found ${owners.length} total owners. Filtering for premium...`);

  for (const ownerId of owners) {
    try {
      // Only process premium subscribers
      const premium = await isPremiumActive(ownerId);
      if (!premium) {
        skipped++;
        continue;
      }

      // Check if LLM insight window has elapsed
      const existing = await getStoredLlmInsight(ownerId);
      if (existing?.generatedAt) {
        const elapsed = Date.now() - new Date(existing.generatedAt).getTime();
        if (elapsed < LLM_WINDOW_MS) {
          results.push({ ownerId, skipped: true, reason: "window-not-elapsed" });
          skipped++;
          continue;
        }
      }

      // Gather data
      const aggregates = await getWeeklyAggregates(ownerId);
      const weeklyReport = generateWeeklyReport({ aggregates });

      if (!weeklyReport.totalMoments) {
        results.push({ ownerId, skipped: true, reason: "no-data" });
        skipped++;
        continue;
      }

      const historicalReports = await getHistoricalSummaries(ownerId);

      console.log(`Generating LLM insight for ${ownerId.slice(0, 8)}... (${weeklyReport.totalMoments} moments)`);

      const insight = await generateLlmInsight({
        weeklyReport,
        historicalReports,
        userTrends: {
          topTrigger: weeklyReport.topTrigger,
          topEmotion: weeklyReport.topEmotion,
          volatility: weeklyReport.volatilityChange,
        },
      });

      await storeLlmInsight(ownerId, insight);
      processed++;
      results.push({ ownerId, generated: true, model: insight.model });
      console.log(`  ✓ Done (${insight.model})`);

    } catch (error) {
      results.push({ ownerId, skipped: true, reason: error.message });
      console.error(`  ✗ Failed for ${ownerId.slice(0, 8)}: ${error.message}`);
    }
  }

  return { processed, skipped, results };
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log("=== TriggerMap LLM Insight Generator ===");
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
