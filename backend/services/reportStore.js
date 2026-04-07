import { redis, redisKey, pipeline } from "./redisClient.js";

export function getWeeklyReportKey(ownerId) {
  return redisKey("weekly_report", ownerId);
}

export async function getStoredWeeklyInsight(ownerId) {
  const raw = await redis(["GET", getWeeklyReportKey(ownerId)]);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function storeWeeklyInsight(ownerId, payload) {
  await redis(["SET", getWeeklyReportKey(ownerId), JSON.stringify(payload)]);
  return payload;
}

export function getLlmInsightKey(ownerId) {
  return redisKey("llm_insight", ownerId);
}

export async function getStoredLlmInsight(ownerId) {
  const raw = await redis(["GET", getLlmInsightKey(ownerId)]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// --- Insight history (append-only archive) ---

export function getLlmInsightHistoryKey(ownerId) {
  return redisKey("llm_insight_history", ownerId);
}

export async function appendLlmInsightHistory(ownerId, insight) {
  const key = getLlmInsightHistoryKey(ownerId);
  const entry = JSON.stringify({
    narrative: insight.narrative,
    generatedAt: insight.generatedAt,
    sectionCount: insight.sectionCount,
    weekLabel: insight.weekLabel || null,
  });
  await pipeline([
    ["RPUSH", key, entry],
    ["EXPIRE", key, String(60 * 60 * 24 * 180)], // 6 months
  ]);
}

export async function getLlmInsightHistory(ownerId, limit = 12) {
  const key = getLlmInsightHistoryKey(ownerId);
  // Most recent last in Redis list; return newest-first
  const raw = await redis(["LRANGE", key, "0", "-1"]);
  if (!Array.isArray(raw) || !raw.length) return [];
  const parsed = raw
    .map((r) => { try { return JSON.parse(r); } catch { return null; } })
    .filter(Boolean);
  // Deduplicate by generatedAt
  const seen = new Set();
  const unique = [];
  for (let i = parsed.length - 1; i >= 0; i--) {
    const key = parsed[i].generatedAt || `idx-${i}`;
    if (!seen.has(key)) { seen.add(key); unique.push(parsed[i]); }
  }
  return unique.slice(0, limit);
}

// --- Free-pass (one-time view) helpers ---

export function getFreePassKey(ownerId) {
  return redisKey("llm_free_pass", ownerId);
}

export async function hasFreePass(ownerId) {
  const val = await redis(["GET", getFreePassKey(ownerId)]);
  return val === "1";
}

export async function grantFreePass(ownerId) {
  // Free pass is valid for 48 hours from grant time
  await redis(["SET", getFreePassKey(ownerId), "1", "EX", 172800]);
}

export async function consumeFreePass(ownerId) {
  // Instead of deleting immediately, let the TTL handle expiration.
  // This allows the user to view the insight on multiple devices/sessions
  // within the 48-hour window. No-op if pass already expired.
}

// --- Action feedback (HiTL) ---

export function getActionFeedbackKey(ownerId) {
  return redisKey("action_feedback", ownerId);
}

export async function storeActionFeedback(ownerId, actionId, response) {
  const key = getActionFeedbackKey(ownerId);
  const entry = JSON.stringify({ actionId, response, timestamp: Date.now() });
  await pipeline([
    ["RPUSH", key, entry],
    ["EXPIRE", key, String(60 * 60 * 24 * 90)],
  ]);
}

export async function getActionFeedback(ownerId) {
  const key = getActionFeedbackKey(ownerId);
  const raw = await redis(["LRANGE", key, "0", "-1"]);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => { try { return JSON.parse(r); } catch { return null; } })
    .filter(Boolean);
}

// --- Action preferences (feedback-driven parameters) ---

export function getActionPrefsKey(ownerId) {
  return redisKey("action_prefs", ownerId);
}

/**
 * Action prefs shape:
 * {
 *   likedTriggers: string[],       // triggers from "tried" actions
 *   dislikedApproaches: string[],  // action IDs the user skipped
 *   llmActions: Action[],          // LLM-generated replacement actions
 *   llmGeneratedAt: ISO string,
 *   llmModel: string,
 *   updatedAt: ISO string,
 * }
 */
export async function getActionPrefs(ownerId) {
  const raw = await redis(["GET", getActionPrefsKey(ownerId)]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function storeActionPrefs(ownerId, prefs) {
  const payload = { ...prefs, updatedAt: new Date().toISOString() };
  await redis(["SET", getActionPrefsKey(ownerId), JSON.stringify(payload)]);
  await redis(["EXPIRE", getActionPrefsKey(ownerId), String(60 * 60 * 24 * 90)]);
  return payload;
}