/**
 * Adaptive Modes generation job.
 *
 * Generates Move, Fuel, and Perspective outputs for premium users
 * using the LLM composition engine (modeComposer).
 *
 * Run manually:
 *   node backend/jobs/generateAdaptiveModes.js
 *   node backend/jobs/generateAdaptiveModes.js --force
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import { generateAllModes } from "../ai/modeComposer.js";
import { listOwnerIds } from "../services/aggregationService.js";
import { getUserById, getSubscription } from "../services/authService.js";
import { getStoredModeOutput } from "../services/modeStore.js";

const MODE_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day cooldown

function parseCliFlags(argv) {
  const flags = { force: false, maxWords: 100 };
  for (const arg of argv.slice(2)) {
    if (arg === "--force") flags.force = true;
    if (arg.startsWith("--max-words=")) {
      const n = parseInt(arg.split("=")[1], 10);
      if (n > 0) flags.maxWords = n;
    }
  }
  return flags;
}

export async function runGenerateAdaptiveModes({ force = false, maxWords, ownerIds, model } = {}) {
  const effectiveMaxWords = maxWords ?? (process.env.LLM_MAX_WORDS ? parseInt(process.env.LLM_MAX_WORDS, 10) : 100);
  const envIds = process.env.LLM_OWNER_IDS;
  const owners = Array.isArray(ownerIds) && ownerIds.length > 0
    ? ownerIds
    : envIds
      ? envIds.split(",").filter(Boolean)
      : await listOwnerIds();
  const results = [];
  let processed = 0;
  let skipped = 0;

  console.log(`[adaptive-modes] Found ${owners.length} total owners. Filtering for premium users...`);
  if (force) console.log("[adaptive-modes] --force: ignoring cooldown window");

  for (const ownerId of owners) {
    try {
      const user = await getUserById(ownerId);
      if (!user) { skipped++; continue; }

      // Check subscription — only premium users
      const sub = await getSubscription(ownerId);
      const isPremium = sub?.status === "active" || sub?.status === "grace_period";
      if (!isPremium) {
        results.push({ ownerId, skipped: true, reason: "not-premium" });
        skipped++;
        continue;
      }

      // Check cooldown
      if (!force) {
        const existing = await getStoredModeOutput(ownerId, "move");
        if (existing?.generatedAt) {
          const elapsed = Date.now() - new Date(existing.generatedAt).getTime();
          if (elapsed < MODE_WINDOW_MS) {
            results.push({ ownerId, skipped: true, reason: "window-not-elapsed" });
            skipped++;
            continue;
          }
        }
      }

      console.log(`[adaptive-modes] Generating modes for ${ownerId.slice(0, 8)}...`);
      const modeResults = await generateAllModes({ ownerId, lang: user.lang || "en", model, maxWords: effectiveMaxWords });
      const generated = Object.keys(modeResults).filter((k) => modeResults[k] != null);

      results.push({ ownerId, ok: true, modes: generated });
      processed++;
      console.log(`[adaptive-modes] ✓ ${ownerId.slice(0, 8)} — generated ${generated.length}/3 modes`);
    } catch (err) {
      results.push({ ownerId, ok: false, error: err.message });
      console.error(`[adaptive-modes] ✗ ${ownerId.slice(0, 8)}: ${err.message}`);
    }
  }

  const summary = { processed, skipped, total: owners.length, results };
  console.log(`\n[adaptive-modes] Done. Processed: ${processed}, Skipped: ${skipped}, Total: ${owners.length}`);
  return summary;
}

// ── CLI entry point ──
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const flags = parseCliFlags(process.argv);
  runGenerateAdaptiveModes(flags)
    .then((s) => { console.log(JSON.stringify(s, null, 2)); process.exit(0); })
    .catch((err) => { console.error("Fatal:", err); process.exit(1); });
}
