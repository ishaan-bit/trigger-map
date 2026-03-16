#!/usr/bin/env node
/**
 * Generate a premium report (rule-based + LLM) for a single user.
 *
 * Usage:
 *   node backend/scripts/generatePremiumReport.mjs --owner <ownerId>
 *
 * Prerequisites:
 *   1. .env with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   2. Local LLM server running (Ollama / llama.cpp / LM Studio)
 *   3. Optional: LLM_API_URL, LLM_MODEL env vars
 */

import "dotenv/config";
import { getWeeklyAggregates } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { generateInsight } from "../ai/generateInsight.js";
import { generateLlmInsight } from "../ai/generateLlmInsight.js";
import { storeWeeklyInsight, getStoredWeeklyInsight } from "../services/reportStore.js";
import { redis, redisKey } from "../services/redisClient.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--owner");
  if (idx === -1 || !args[idx + 1]) {
    console.error("Usage: node generatePremiumReport.mjs --owner <ownerId>");
    process.exit(1);
  }
  return { ownerId: args[idx + 1] };
}

async function storeLlmInsight(ownerId, payload) {
  await redis(["SET", redisKey("llm_insight", ownerId), JSON.stringify(payload)]);
}

async function main() {
  const { ownerId } = parseArgs();

  console.log(`\n=== QuietDen Premium Report Generator ===`);
  console.log(`Owner:  ${ownerId}`);
  console.log(`LLM:    ${process.env.LLM_API_URL || "http://localhost:11434/v1"}`);
  console.log(`Model:  ${process.env.LLM_MODEL || "mistral"}\n`);

  // 1. Gather aggregates
  const aggregates = await getWeeklyAggregates(ownerId);
  const weeklyReport = generateWeeklyReport({ aggregates });

  if (!weeklyReport.totalMoments) {
    console.log("No moments found for this user in the past 7 days.");
    process.exit(0);
  }

  console.log(`Found ${weeklyReport.totalMoments} moments this week.`);
  console.log(`Top trigger: ${weeklyReport.topTrigger || "—"}`);
  console.log(`Top emotion: ${weeklyReport.topEmotion || "—"}\n`);

  // 2. Generate rule-based insight
  console.log("Generating rule-based insight...");
  const ruleInsight = await generateInsight({
    triggerData: JSON.stringify(weeklyReport.triggerFrequency),
    emotionData: JSON.stringify(weeklyReport.emotionFrequency),
    volatility: weeklyReport.volatilityChange,
    stableDay: weeklyReport.mostStableDay,
  });

  await storeWeeklyInsight(ownerId, {
    windowEnd: new Date().toISOString().slice(0, 10),
    summary: ruleInsight.summary,
    suggestion: ruleInsight.suggestion,
    microExperiment: ruleInsight.microExperiment || null,
    model: ruleInsight.model,
    generatedAt: new Date().toISOString(),
  });
  console.log("  ✓ Rule-based insight stored.\n");

  // 3. Generate LLM narrative
  console.log("Generating LLM narrative...");
  const existing = await getStoredWeeklyInsight(ownerId);
  const historicalReports = existing ? [existing] : [];

  const llmInsight = await generateLlmInsight({
    weeklyReport,
    historicalReports,
    userTrends: {
      topTrigger: weeklyReport.topTrigger,
      topEmotion: weeklyReport.topEmotion,
      volatility: weeklyReport.volatilityChange,
    },
  });

  await storeLlmInsight(ownerId, llmInsight);
  console.log("  ✓ LLM insight stored.\n");
  console.log("--- Narrative preview ---");
  console.log(llmInsight.narrative || llmInsight.raw || "(empty)");
  console.log("-------------------------\n");
  console.log("Done. Report will appear on the user's next app refresh.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exitCode = 1;
});
