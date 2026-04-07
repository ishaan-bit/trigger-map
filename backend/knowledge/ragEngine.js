/**
 * RAG Retrieval Engine for insight generation.
 *
 * Tag-based semantic retrieval — no vector DB needed.  The signal profile
 * already classifies user state into discrete tags.  We score knowledge
 * chunks by tag overlap + weight and return top-k for prompt injection.
 *
 * Three retrieval modes:
 *   retrieveForLLM()       — rich context for LLM prompt augmentation
 *   retrieveForRuleBased() — framing + interpretation hints for rule builders
 *   retrieveForMode()      — modality-specific dynamics for mode composer
 */

import { KNOWLEDGE_CHUNKS } from "./insightKnowledge.js";
import { buildSignalProfile } from "../ai/signalProfile.js";

// ── Tag extraction from signal profile + report ────────────────────────

function extractTags(signalProfile, report) {
  const tags = new Set();

  // Volatility
  if (signalProfile.volatility) tags.add(`volatility:${signalProfile.volatility}`);

  // Drift
  if (signalProfile.drift) tags.add(`drift:${signalProfile.drift}`);

  // Intensity
  if (signalProfile.intensity) tags.add(`intensity:${signalProfile.intensity}`);

  // Boolean flags
  if (signalProfile.isFlattening) tags.add("flattening");
  if (signalProfile.maskingLevel && signalProfile.maskingLevel !== "none") tags.add("masking");
  if (signalProfile.falseRecovery) tags.add("false_recovery");
  if (signalProfile.crashRisk) tags.add("crash_risk");

  // Vacuum drift
  if (signalProfile.vacuumDrift && signalProfile.vacuumDrift !== "none") {
    tags.add(`vacuum:${signalProfile.vacuumDrift}`);
  }

  // Recovery
  const rl = report?.baselineMetrics?.recoveryLatency;
  if (rl) {
    if (rl.days >= 3) tags.add("recovery:slow");
    else if (rl.days <= 1) tags.add("recovery:fast");
  }

  // Confidence
  const conf = report?.dataQuality?.confidence;
  if (conf) tags.add(`confidence:${conf}`);

  // Top trigger
  if (report?.topTrigger) tags.add(`trigger:${report.topTrigger}`);
  // Tied triggers
  if (report?.tiedTriggers?.length) {
    for (const t of report.tiedTriggers.slice(0, 3)) tags.add(`trigger:${t}`);
  }

  // Top emotion
  if (report?.topEmotion) tags.add(`emotion:${report.topEmotion}`);

  // Recurrence
  if (report?.recurrence?.length) tags.add("recurrence");

  // Streaks
  if (report?.positiveStreak) tags.add("streak:positive");
  if (report?.negativeStreak) tags.add("streak:negative");

  return tags;
}

// ── Scoring ────────────────────────────────────────────────────────────

function scoreChunk(chunk, userTags) {
  let matchCount = 0;
  for (const tag of chunk.tags) {
    if (userTags.has(tag)) matchCount++;
  }
  if (matchCount === 0) return 0;

  // Score = (matched tags / total chunk tags) × chunk weight
  // This favours chunks where a higher proportion of their tags match
  const tagCoverage = matchCount / chunk.tags.length;
  return tagCoverage * chunk.weight;
}

function retrieve(userTags, { domains, maxChunks = 5 }) {
  const scored = [];

  for (const chunk of KNOWLEDGE_CHUNKS) {
    // Filter by domain if specified
    if (domains && !domains.includes(chunk.domain)) continue;

    const score = scoreChunk(chunk, userTags);
    if (score > 0) scored.push({ chunk, score });
  }

  // Sort by score descending, take top-k
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxChunks);
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Retrieve context for LLM prompt augmentation.
 * Returns a formatted string block for injection into the LLM prompt.
 *
 * Pulls from all domains: interpretation + intervention + dynamics + framing.
 * This gives the LLM richer grounding for its narrative.
 */
export function retrieveForLLM(report, maxChunks = 6) {
  if (!report) return "";
  const sp = buildSignalProfile(report);
  const tags = extractTags(sp, report);
  const results = retrieve(tags, { maxChunks });

  if (!results.length) return "";

  const lines = results.map(({ chunk }) =>
    `[${chunk.domain.toUpperCase()}] ${chunk.content}`
  );

  return `CONTEXTUAL KNOWLEDGE (use to inform your interpretation, do not quote directly, do not reference these labels):\n${lines.join("\n\n")}`;
}

/**
 * Retrieve framing and interpretation hints for rule-based insight builders.
 * Returns structured objects for programmatic use.
 */
export function retrieveForRuleBased(report, maxChunks = 4) {
  if (!report) return { interpretations: [], framing: [] };
  const sp = buildSignalProfile(report);
  const tags = extractTags(sp, report);

  // Interpretation + framing only — interventions handled by existing micro-experiments
  const results = retrieve(tags, {
    domains: ["interpretation", "framing"],
    maxChunks,
  });

  return {
    interpretations: results
      .filter(r => r.chunk.domain === "interpretation")
      .map(r => ({ id: r.chunk.id, content: r.chunk.content, score: r.score })),
    framing: results
      .filter(r => r.chunk.domain === "framing")
      .map(r => ({ id: r.chunk.id, content: r.chunk.content, score: r.score })),
  };
}

/**
 * Retrieve modality-specific context for mode composer.
 * Focuses on dynamics + interpretation relevant to MODE generation.
 */
export function retrieveForMode(report, maxChunks = 3) {
  if (!report) return "";
  const sp = buildSignalProfile(report);
  const tags = extractTags(sp, report);

  const results = retrieve(tags, {
    domains: ["dynamics", "interpretation", "intervention"],
    maxChunks,
  });

  if (!results.length) return "";

  const lines = results.map(({ chunk }) => chunk.content);
  return `Emotional context knowledge:\n${lines.join("\n")}`;
}

/**
 * Retrieve the best-matching intervention for a given signal profile.
 * Used by the rule-based micro-experiment selector to pick more
 * contextually appropriate suggestions.
 */
export function retrieveIntervention(report) {
  if (!report) return null;
  const sp = buildSignalProfile(report);
  const tags = extractTags(sp, report);

  const results = retrieve(tags, {
    domains: ["intervention"],
    maxChunks: 2,
  });

  if (!results.length) return null;
  return results[0].chunk.content;
}
