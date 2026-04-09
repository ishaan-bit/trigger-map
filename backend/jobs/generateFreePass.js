/**
 * One-time bulk LLM insight generation + free-pass grant.
 *
 * Generates AI insights for all eligible signed-in users and grants
 * a one-time free view that bypasses the premium gateway ONCE.
 * After the user views the full insight, the free pass is consumed
 * and the premium gate is restored.
 *
 * Usage:
 *   node backend/jobs/generateFreePass.js
 *   node backend/jobs/generateFreePass.js --force --min-moments=5
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { generateLlmInsight } from "../ai/generateLlmInsight.js";
import { getWeeklyAggregates, listOwnerIds } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { getTimeline } from "../services/momentService.js";
import { getUserById } from "../services/authService.js";
import { redis } from "../services/redisClient.js";
import { getStoredLlmInsight, getLlmInsightKey, grantFreePass } from "../services/reportStore.js";

function parseCliFlags(argv) {
  const flags = { force: false, minMoments: 5 };
  for (const arg of argv.slice(2)) {
    if (arg === "--force") flags.force = true;
    if (arg.startsWith("--min-moments=")) {
      const n = parseInt(arg.split("=")[1], 10);
      if (n > 0) flags.minMoments = n;
    }
  }
  return flags;
}

async function storeLlmInsight(ownerId, payload) {
  await redis(["SET", getLlmInsightKey(ownerId), JSON.stringify(payload)]);
}

export async function runGenerateFreePass({ force = false, minMoments = 5, ownerIds } = {}) {
  const envIds = process.env.LLM_OWNER_IDS;
  const owners = Array.isArray(ownerIds) && ownerIds.length > 0
    ? ownerIds
    : envIds
      ? envIds.split(',').filter(Boolean)
      : await listOwnerIds();
  let scanned = 0;
  let eligible = 0;
  let generated = 0;
  let freePassGranted = 0;
  let skipped = 0;
  const results = [];

  console.log(`Scanning ${owners.length} total owners${envIds ? ' (filtered by selection)' : ''}...`);
  if (force) console.log("--force: regenerating even if recent insight exists");
  console.log(`--min-moments=${minMoments}`);
  console.log("");

  for (const ownerId of owners) {
    scanned++;
    try {
      // Must be a signed-in user
      const user = await getUserById(ownerId);
      if (!user) {
        results.push({ ownerId, skipped: true, reason: "not-signed-in" });
        skipped++;
        continue;
      }

      // Check moment threshold
      const aggregates = await getWeeklyAggregates(ownerId, 45);
      const weeklyReport = generateWeeklyReport({ aggregates, allAggregates: aggregates });

      if (!weeklyReport.totalMoments || weeklyReport.totalMoments < minMoments) {
        results.push({ ownerId, skipped: true, reason: `below-threshold (${weeklyReport.totalMoments || 0} < ${minMoments})` });
        skipped++;
        continue;
      }

      eligible++;

      // Check if insight already exists and is recent (skip unless --force)
      const existing = await getStoredLlmInsight(ownerId);
      let needsGeneration = true;
      if (!force && existing?.generatedAt) {
        const elapsed = Date.now() - new Date(existing.generatedAt).getTime();
        if (elapsed < 24 * 60 * 60 * 1000) {
          needsGeneration = false;
          console.log(`  ${ownerId.slice(0, 8)}: recent insight exists, skipping generation`);
        }
      }

      if (needsGeneration) {
        const allMoments = await getTimeline(ownerId);
        const recentNotes = allMoments
          .filter(m => m.note && m.note.trim())
          .slice(0, 15)
          .map(m => ({ trigger: m.trigger, emotion: m.emotion, note: m.note.slice(0, 120) }));

        console.log(`  ${ownerId.slice(0, 8)}: generating... (${weeklyReport.totalMoments} moments, ${recentNotes.length} notes)`);

        // Retry up to 5 times — small models can produce invalid output.
        // Prefer results with all 3 sections; accept 2 after exhausting retries.
        let insight;
        let bestSoFar = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            insight = await generateLlmInsight({ weeklyReport, recentNotes });
            if (insight.sectionCount >= 3) break; // ideal result
            bestSoFar = bestSoFar || insight;
            console.log(`  ${ownerId.slice(0, 8)}: attempt ${attempt} got ${insight.sectionCount}/3 sections, retrying for full set...`);
            if (attempt >= 5) break;
          } catch (retryErr) {
            if (attempt < 5) {
              console.log(`  ${ownerId.slice(0, 8)}: attempt ${attempt} failed, retrying... (${retryErr.message})`);
            } else if (bestSoFar) {
              insight = bestSoFar; // accept partial result
              break;
            } else {
              throw retryErr;
            }
          }
        }
        await storeLlmInsight(ownerId, insight);
        generated++;
        console.log(`  ${ownerId.slice(0, 8)}: generated (${insight.model}, ${insight.sectionCount}/3 sections)`);
      }

      // Grant one-time free-pass
      await grantFreePass(ownerId);
      freePassGranted++;
      console.log(`  ${ownerId.slice(0, 8)}: free pass granted`);

      results.push({ ownerId, generated: needsGeneration, freePass: true });

    } catch (error) {
      results.push({ ownerId, skipped: true, reason: error.message });
      console.error(`  ${ownerId.slice(0, 8)}: FAILED — ${error.message}`);
    }
  }

  return { scanned, eligible, generated, freePassGranted, skipped, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flags = parseCliFlags(process.argv);
  console.log("=== TriggerMap Free Pass Generator ===");
  console.log(`LLM endpoint: ${process.env.LLM_API_URL || "http://localhost:11434/v1"}`);
  console.log(`Model: ${process.env.LLM_MODEL || "mistral"}`);
  console.log("");

  runGenerateFreePass(flags)
    .then(({ scanned, eligible, generated, freePassGranted, skipped }) => {
      console.log("");
      console.log("=== Summary ===");
      console.log(`  Scanned:          ${scanned}`);
      console.log(`  Eligible:         ${eligible}`);
      console.log(`  Insights generated: ${generated}`);
      console.log(`  Free passes granted: ${freePassGranted}`);
      console.log(`  Skipped:          ${skipped}`);
    })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Fatal error:", error.message);
      process.exit(1);
    });
}
