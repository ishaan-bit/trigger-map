#!/usr/bin/env node
/**
 * Generate a premium report (rule-based + LLM) for a single user.
 *
 * Usage:
 *   node backend/scripts/generatePremiumReport.mjs --owner <ownerId>
 */

import "dotenv/config";
import { getWeeklyAggregates } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { generateInsight } from "../ai/generateInsight.js";
import { generateLlmInsight } from "../ai/generateLlmInsight.js";
import { storeWeeklyInsight } from "../services/reportStore.js";
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

  const aggregates = await getWeeklyAggregates(ownerId);
  const weeklyReport = generateWeeklyReport({ aggregates });

  if (!weeklyReport.totalMoments) {
    console.log("No moments found for this user in the past 7 days.");
    process.exit(0);
  }

  console.log(`Found ${weeklyReport.totalMoments} moments.`);
  console.log(`Confidence: ${weeklyReport.dataQuality.confidence}`);
  console.log(`Top trigger: ${weeklyReport.topTrigger || "(tied)"}`);
  console.log(`Top emotion: ${weeklyReport.topEmotion || "(tied)"}\n`);

  // Rule-based insight
  console.log("Generating rule-based insight...");
  const ruleInsight = await generateInsight(weeklyReport);

  await storeWeeklyInsight(ownerId, {
    windowEnd: new Date().toISOString().slice(0, 10),
    summary: ruleInsight.summary,
    microExperiment: ruleInsight.microExperiment || null,
    confidence: ruleInsight.confidence,
    model: ruleInsight.model,
    generatedAt: ruleInsight.generatedAt,
  });
  console.log("  Rule-based insight stored.\n");

  // LLM narrative
  console.log("Generating LLM narrative...");
  const llmInsight = await generateLlmInsight({ weeklyReport });

  await storeLlmInsight(ownerId, llmInsight);
  console.log("  LLM insight stored.\n");
  console.log("--- Narrative preview ---");
  console.log(llmInsight.narrative || "(empty)");
  console.log("-------------------------\n");
  console.log("Done. Report will appear on the user's next app refresh.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exitCode = 1;
});
