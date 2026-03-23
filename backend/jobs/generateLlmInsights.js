/**
 * Local LLM insight generation job.
 *
 * Run manually:
 *   node backend/jobs/generateLlmInsights.js
 *   node backend/jobs/generateLlmInsights.js --force --min-moments=5
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { generateLlmInsight } from "../ai/generateLlmInsight.js";
import { getWeeklyAggregates, listOwnerIds } from "../services/aggregationService.js";
import { generateWeeklyReport } from "../services/patternEngine.js";
import { getTimeline } from "../services/momentService.js";
import { getUserById } from "../services/authService.js";
import { redis, redisKey } from "../services/redisClient.js";
import { getStoredLlmInsight, getLlmInsightKey } from "../services/reportStore.js";

const LLM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function parseCliFlags(argv) {
  const flags = { force: false, minMoments: 1 };
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
  return payload;
}

export async function runGenerateLlmInsights({ force = false, minMoments = 1 } = {}) {
  const envIds = process.env.LLM_OWNER_IDS;
  const owners = envIds
    ? envIds.split(',').filter(Boolean)
    : await listOwnerIds();
  const results = [];
  let processed = 0;
  let skipped = 0;

  console.log(`Found ${owners.length} total owners${envIds ? ' (filtered by selection)' : ''}. Filtering for eligible users...`);
  if (force) console.log("--force: ignoring cooldown window");
  if (minMoments > 1) console.log(`--min-moments=${minMoments}: skipping users below threshold`);

  for (const ownerId of owners) {
    try {
      const user = await getUserById(ownerId);
      if (!user) { skipped++; continue; }

      if (!force) {
        const existing = await getStoredLlmInsight(ownerId);
        if (existing?.generatedAt) {
          const elapsed = Date.now() - new Date(existing.generatedAt).getTime();
          if (elapsed < LLM_WINDOW_MS) {
            results.push({ ownerId, skipped: true, reason: "window-not-elapsed" });
            skipped++;
            continue;
          }
        }
      }

      const aggregates = await getWeeklyAggregates(ownerId, 45);
      const weeklyReport = generateWeeklyReport({ aggregates, allAggregates: aggregates });

      if (!weeklyReport.totalMoments || weeklyReport.totalMoments < minMoments) {
        results.push({ ownerId, skipped: true, reason: `below-threshold (${weeklyReport.totalMoments || 0} < ${minMoments})` });
        skipped++;
        continue;
      }

      // Fetch recent notes for LLM context (all available, max 15, truncated)
      const allMoments = await getTimeline(ownerId);
      const recentNotes = allMoments
        .filter(m => m.note && m.note.trim())
        .slice(0, 15)
        .map(m => ({ trigger: m.trigger, emotion: m.emotion, note: m.note.slice(0, 120) }));

      console.log(`Generating LLM insight for ${ownerId.slice(0, 8)}... (${weeklyReport.totalMoments} moments, ${recentNotes.length} notes)`);

      let insight;
      let bestSoFar = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          insight = await generateLlmInsight({ weeklyReport, recentNotes });
          if (insight.sectionCount >= 3) break;
          bestSoFar = bestSoFar || insight;
          console.log(`  Attempt ${attempt} got ${insight.sectionCount}/3 sections, retrying...`);
          if (attempt >= 5) break;
        } catch (retryErr) {
          if (attempt < 5) {
            console.log(`  Attempt ${attempt} failed, retrying... (${retryErr.message})`);
          } else if (bestSoFar) {
            insight = bestSoFar;
            break;
          } else {
            throw retryErr;
          }
        }
      }

      await storeLlmInsight(ownerId, insight);
      processed++;
      results.push({ ownerId, generated: true, model: insight.model });
      console.log(`  Done (${insight.model}, ${insight.sectionCount}/3 sections)`);

    } catch (error) {
      results.push({ ownerId, skipped: true, reason: error.message });
      console.error(`  Failed for ${ownerId.slice(0, 8)}: ${error.message}`);
    }
  }

  return { processed, skipped, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flags = parseCliFlags(process.argv);
  console.log("=== QuietDen LLM Insight Generator ===");
  console.log(`LLM endpoint: ${process.env.LLM_API_URL || "http://localhost:11434/v1"}`);
  console.log(`Model: ${process.env.LLM_MODEL || "mistral"}`);
  console.log("");

  runGenerateLlmInsights(flags)
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
