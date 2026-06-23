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
import { listOwnerIds } from "../services/aggregationService.js";
import { getTimeline } from "../services/momentService.js";
import { getUserById } from "../services/authService.js";
import { redis } from "../services/redisClient.js";
import { getStoredLlmInsight, getLlmInsightKey, getActionFeedback, appendLlmInsightHistory } from "../services/reportStore.js";
import { phraseText } from "../utils/phrasingLayer.js";
import { resolveLlmInsightSource } from "./llmInsightSource.js";

const LLM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const RECENT_NOTE_LIMIT = 8;
const RECENT_NOTE_CONTEXT_LIMIT = 120;

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

export function toStoredLlmInsightPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const { diagnostics, promptDiagnostics, ...stored } = payload;
  return stored;
}

async function storeLlmInsight(ownerId, payload) {
  const storedPayload = toStoredLlmInsightPayload(payload);
  await redis(["SET", getLlmInsightKey(ownerId), JSON.stringify(storedPayload)]);
  // Also append to the insight history archive
  await appendLlmInsightHistory(ownerId, storedPayload).catch((err) =>
    console.error(`  History append failed for ${ownerId.slice(0, 8)}: ${err.message}`)
  );
  return storedPayload;
}

function formatDiagnostics(diagnostics = {}) {
  const fields = {
    status: diagnostics.status,
    reason: diagnostics.reason,
    selectedSource: diagnostics.selectedSource,
    aggregateWindowDays: diagnostics.aggregateWindowDays,
    aggregateWindowCount: diagnostics.aggregateWindowCount,
    rawMomentCount: diagnostics.rawMomentCount,
    rawQualifyingCount: diagnostics.rawQualifyingCount,
    threshold: diagnostics.threshold,
    skippedMalformedCount: diagnostics.skippedMalformedCount,
    rawActiveDaysUsed: diagnostics.rawActiveDaysUsed,
    rawSelectedMomentCount: diagnostics.rawSelectedMomentCount,
    promptCharCount: diagnostics.promptCharCount,
    approximateTokenEstimate: diagnostics.approximateTokenEstimate,
  };

  return Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

function logSourceDecision(ownerId, diagnostics) {
  console.log(`  ${ownerId.slice(0, 8)}: insight-source ${formatDiagnostics(diagnostics)}`);
}

export function buildRecentNotes(moments) {
  return (moments || [])
    .filter(m => (m.note && m.note.trim()) || m.contributionTags?.length)
    .slice(0, RECENT_NOTE_LIMIT)
    .map(m => ({
      trigger: m.trigger,
      emotion: m.derivedLabel || m.emotion,
      valence: m.valence,
      arousal: m.arousal,
      contributionTags: m.contributionTags || m.tags || [],
      note: (m.note || "").slice(0, RECENT_NOTE_CONTEXT_LIMIT),
    }));
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason || new Error("LLM insight generation aborted");
  }
}

function shouldRetryInsightError(err) {
  return !["LLM_UNAVAILABLE", "PROMPT_TOO_LARGE", "PAIR_TIMEOUT"].includes(err?.code);
}

async function generateWithRetries({ weeklyReport, recentNotes, actionFeedback, maxWords, userLang, signal, onDiagnostics, logAttempts = false }) {
  let insight;
  let bestSoFar = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      throwIfAborted(signal);
      onDiagnostics?.({ llmAttempt: attempt });
      insight = await generateLlmInsight({
        weeklyReport,
        recentNotes,
        actionFeedback,
        maxWords,
        lang: userLang,
        signal,
        onDiagnostics,
        failFastModelCheck: true,
      });
      if (insight.sectionCount >= 3) break;
      bestSoFar = bestSoFar || insight;
      if (logAttempts) console.log(`  Attempt ${attempt} got ${insight.sectionCount}/3 sections, retrying...`);
      if (attempt >= 5) break;
    } catch (retryErr) {
      throwIfAborted(signal);
      if (!shouldRetryInsightError(retryErr)) {
        throw retryErr;
      }
      if (attempt < 5) {
        if (logAttempts) console.log(`  Attempt ${attempt} failed, retrying... (${retryErr.message})`);
      } else if (bestSoFar) {
        insight = bestSoFar;
        break;
      } else {
        throw retryErr;
      }
    }
  }
  return insight;
}

async function polishInsight(insight, userLang) {
  if (!insight?.narrative || userLang === "hi") return insight;

  const sections = insight.narrative.split(/\n\n/);
  const phrased = [];
  for (const section of sections) {
    const headerMatch = section.match(/^(What stood out|What may be contributing|One thing to try)\n/i);
    if (headerMatch) {
      const header = headerMatch[1];
      const body = section.slice(header.length).trim();
      const polished = await phraseText(body);
      phrased.push(`${header}\n${polished}`);
    } else {
      phrased.push(section);
    }
  }
  insight.narrative = phrased.join("\n\n");
  return insight;
}

/**
 * Generate LLM insight for a single user. Used by batch orchestrator.
 * Skips eligibility checks — caller is responsible for filtering.
 */
export async function generateLlmInsightForUser(ownerId, { minMoments = 1, maxWords, signal, onDiagnostics } = {}) {
  const startedAt = Date.now();
  const diagnostics = {
    ownerIdPrefix: ownerId.slice(0, 8),
    status: "running",
    reason: null,
  };
  const updateDiagnostics = (patch) => {
    Object.assign(diagnostics, patch);
    onDiagnostics?.({ ...diagnostics });
  };

  const user = await getUserById(ownerId);
  if (!user) throw new Error("user not found");
  const userLang = user.lang || "en";

  const source = await resolveLlmInsightSource(ownerId, { minMoments });
  updateDiagnostics(source.diagnostics);
  logSourceDecision(ownerId, source.diagnostics);

  if (source.status === "skipped") {
    return { skipped: true, reason: source.reason, diagnostics: source.diagnostics };
  }

  const allMoments = source.moments || await getTimeline(ownerId);
  const recentNotes = buildRecentNotes(allMoments);
  updateDiagnostics({
    recentNoteCount: recentNotes.length,
    maxRecentNotes: RECENT_NOTE_LIMIT,
    maxContextCharsPerNote: RECENT_NOTE_CONTEXT_LIMIT,
  });

  const actionFeedback = await getActionFeedback(ownerId);
  let insight;

  try {
    insight = await polishInsight(await generateWithRetries({
      weeklyReport: source.weeklyReport,
      recentNotes,
      actionFeedback,
      maxWords,
      userLang,
      signal,
      onDiagnostics: updateDiagnostics,
    }), userLang);
  } catch (err) {
    throwIfAborted(signal);
    if (err.code === "LLM_UNAVAILABLE") {
      return {
        skipped: true,
        status: "skipped",
        reason: "llm_unavailable",
        model: err.details?.model || diagnostics.model || process.env.LLM_MODEL || "phi3",
        selectedSource: source.selectedSource,
        diagnostics: {
          ...diagnostics,
          status: "skipped",
          reason: "llm_unavailable",
          durationMs: Date.now() - startedAt,
          ...(err.details || {}),
        },
      };
    }
    if (err.code === "PROMPT_TOO_LARGE") {
      return {
        skipped: true,
        status: "skipped",
        reason: "prompt_too_large",
        model: diagnostics.model || process.env.LLM_MODEL || "phi3",
        selectedSource: source.selectedSource,
        diagnostics: {
          ...diagnostics,
          status: "skipped",
          reason: "prompt_too_large",
          durationMs: Date.now() - startedAt,
          ...(err.details || {}),
        },
      };
    }
    throw err;
  }

  throwIfAborted(signal);
  updateDiagnostics({ insightWriteStartedAt: new Date().toISOString() });
  await storeLlmInsight(ownerId, insight);
  updateDiagnostics({ status: "generated", reason: null, durationMs: Date.now() - startedAt });
  return {
    ok: true,
    model: insight.model,
    sectionCount: insight.sectionCount,
    selectedSource: source.selectedSource,
    diagnostics: { ...diagnostics },
  };
}

export async function runGenerateLlmInsights({ force = false, minMoments = 1, ownerIds } = {}) {
  const envIds = process.env.LLM_OWNER_IDS;
  const owners = Array.isArray(ownerIds) && ownerIds.length > 0
    ? ownerIds
    : envIds
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
      if (!user) {
        console.log(`  ${ownerId.slice(0, 8)}: SKIPPED — user not found`);
        skipped++;
        continue;
      }
      const userLang = user.lang || "en";

      if (!force) {
        const existing = await getStoredLlmInsight(ownerId);
        if (existing?.generatedAt) {
          const elapsed = Date.now() - new Date(existing.generatedAt).getTime();
          if (elapsed < LLM_WINDOW_MS) {
            const hoursLeft = ((LLM_WINDOW_MS - elapsed) / 3600000).toFixed(1);
            console.log(`  ${ownerId.slice(0, 8)}: SKIPPED — cooldown (${hoursLeft}h remaining)`);
            results.push({ ownerId, skipped: true, reason: "window-not-elapsed" });
            skipped++;
            continue;
          }
        }
      }

      const source = await resolveLlmInsightSource(ownerId, { minMoments });
      logSourceDecision(ownerId, source.diagnostics);

      if (source.status === "skipped") {
        console.log(`  ${ownerId.slice(0, 8)}: SKIPPED - ${source.reason}`);
        results.push({ ownerId, skipped: true, reason: source.reason, diagnostics: source.diagnostics });
        skipped++;
        continue;
      }

      // Fetch recent notes for LLM context (bounded and truncated)
      const allMoments = source.moments || await getTimeline(ownerId);
      const recentNotes = buildRecentNotes(allMoments);

      // Fetch action feedback for HiTL-aware LLM personalization
      const actionFeedback = await getActionFeedback(ownerId);

      console.log(`Generating LLM insight for ${ownerId.slice(0, 8)}... (${source.weeklyReport.totalMoments} moments, ${recentNotes.length} notes, source=${source.selectedSource})`);

      let insight = await generateWithRetries({
        weeklyReport: source.weeklyReport,
        recentNotes,
        actionFeedback,
        userLang,
        logAttempts: true,
      });

      // Polish LLM output — local deterministic cleanup (no HF API by default)
      // Skip firstName personalization for LLM output — the LLM writes in 2nd
      // person ("you"/"your") and replacing "Your" → "Name's" creates a jarring
      // 3rd-person switch that reads like a clinical report.
      // Skip phraseText for Hindi — Hindi text is pre-composed by the LLM.
      insight = await polishInsight(insight, userLang);

      await storeLlmInsight(ownerId, insight);
      processed++;
      results.push({
        ownerId,
        generated: true,
        model: insight.model,
        selectedSource: source.selectedSource,
        diagnostics: source.diagnostics,
      });
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
  console.log(`Model: ${process.env.LLM_MODEL || "phi3"}`);
  console.log("");

  runGenerateLlmInsights(flags)
    .then(({ processed, skipped, results }) => {
      console.log("");
      console.log(`Done. Generated: ${processed}, Skipped: ${skipped}`);
      if (results.filter(r => r.generated).length) {
        console.log("Generated for:", results.filter(r => r.generated).map(r => r.ownerId.slice(0, 8)).join(", "));
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error.message);
      process.exit(1);
    });
}
