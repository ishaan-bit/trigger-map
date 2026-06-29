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
import { getModeFeedback, getStoredModeOutput } from "../services/modeStore.js";

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

      // Check cooldown. Feedback after the last generation should bypass the
      // window so preferences are consumed on the next run.
      if (!force) {
        const modeList = ["move", "fuel", "perspective"];
        const outputs = await Promise.all(modeList.map((mode) => getStoredModeOutput(ownerId, mode).catch(() => null)));
        const generatedAtByMode = {};
        modeList.forEach((mode, i) => {
          generatedAtByMode[mode] = outputs[i]?.generatedAt ? new Date(outputs[i].generatedAt).getTime() : 0;
        });
        const hasAllFresh = modeList.every((mode) => generatedAtByMode[mode] && Date.now() - generatedAtByMode[mode] < MODE_WINDOW_MS);
        const feedback = await getModeFeedback(ownerId).catch(() => []);
        // Compare each feedback entry against ITS OWN mode's last generation, not
        // the oldest timestamp across all three modes — otherwise a stale
        // perspective generation made legitimately-new move/fuel feedback look
        // old (or new), so refreshes were skipped or over-fired incorrectly.
        // All three modes count: perspective HiTL feedback must bypass the window
        // too, or perspective-only feedback would never trigger a refresh (and,
        // because regeneration runs all modes together, move/fuel would stay stale
        // as well until the 24h cooldown lapsed).
        const hasNewModeFeedback = feedback.some((entry) =>
          ["move", "fuel", "perspective"].includes(entry?.mode) &&
          Number(entry.timestamp || 0) > (generatedAtByMode[entry.mode] || 0)
        );

        if (hasAllFresh && !hasNewModeFeedback) {
          results.push({ ownerId, skipped: true, reason: "window-not-elapsed" });
          skipped++;
          continue;
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
