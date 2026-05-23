/**
 * Mode Store — Redis persistence for adaptive mode profiles, history, and outputs.
 * Follows the same patterns as reportStore.js (redisKey, JSON encode, TTLs).
 *
 * Key layout:
 *   triggermap:mode_profile:{ownerId}      – user's movement + nourishment preferences  (90d TTL)
 *   triggermap:mode_history:{ownerId}       – last N generated outputs per mode (RPUSH list, 90d)
 *   triggermap:mode_output:{ownerId}:{mode} – latest generated output for a mode (7d TTL)
 *   triggermap:mode_feedback:{ownerId}      – HiTL feedback on mode outputs (RPUSH list, 90d)
 */

import { redis, redisKey } from "./redisClient.js";

const TTL_90D = String(60 * 60 * 24 * 90);
const TTL_7D  = String(60 * 60 * 24 * 7);
const MAX_HISTORY = 20; // keep last N entries per mode

// ── Mode Profile (movement + nourishment prefs) ────────────────────────

export function getModeProfileKey(ownerId) {
  return redisKey("mode_profile", ownerId);
}

/**
 * Profile shape:
 * {
 *   environment: "indoor" | "outdoor" | "office" | "travel" | null,
 *   equipment: "none" | "minimal" | "gym" | null,
 *   diet: "vegetarian" | "vegan" | "nonVeg" | "glutenFree" | null,
 *   cuisine: "indian" | "universal" | "japanese" | "mediterranean" | null,
 *   intensityPref: "low" | "moderate" | "high" | null,
 *   likedMovements: string[],     // movement IDs the user liked
 *   dislikedMovements: string[],  // movement IDs the user disliked
 *   likedNourishments: string[],  // nourishment IDs the user liked
 *   dislikedNourishments: string[],
 *   updatedAt: ISO string,
 * }
 */
export async function getModeProfile(ownerId) {
  const raw = await redis(["GET", getModeProfileKey(ownerId)]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function storeModeProfile(ownerId, profile) {
  const payload = { ...profile, updatedAt: new Date().toISOString() };
  await redis(["SET", getModeProfileKey(ownerId), JSON.stringify(payload)]);
  await redis(["EXPIRE", getModeProfileKey(ownerId), TTL_90D]);
  return payload;
}

// ── Mode History (anti-repetition) ─────────────────────────────────────

export function getModeHistoryKey(ownerId) {
  return redisKey("mode_history", ownerId);
}

/**
 * Each history entry: { mode, itemIds: string[], timestamp }
 * itemIds = the movement/nourishment IDs that were included in the output.
 */
export async function appendModeHistory(ownerId, mode, itemIds) {
  const key = getModeHistoryKey(ownerId);
  const entry = JSON.stringify({ mode, itemIds, timestamp: Date.now() });
  await redis(["RPUSH", key, entry]);
  await redis(["LTRIM", key, String(-MAX_HISTORY), "-1"]); // keep last N
  await redis(["EXPIRE", key, TTL_90D]);
}

export async function getModeHistory(ownerId) {
  const key = getModeHistoryKey(ownerId);
  const raw = await redis(["LRANGE", key, "0", "-1"]);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => { try { return JSON.parse(r); } catch { return null; } })
    .filter(Boolean);
}

/**
 * Get recently used item IDs for a specific mode (for anti-repetition).
 * Returns the union of itemIds from the last `n` outputs for that mode.
 */
export async function getRecentItemIds(ownerId, mode, n = 3) {
  const history = await getModeHistory(ownerId);
  const modeEntries = history.filter((h) => h.mode === mode);
  const recent = modeEntries.slice(-n);
  const ids = new Set();
  for (const entry of recent) {
    for (const id of entry.itemIds || []) ids.add(id);
  }
  return [...ids];
}

// ── Mode Output (latest per mode) ──────────────────────────────────────

export function getModeOutputKey(ownerId, mode) {
  return redisKey("mode_output", ownerId, mode);
}

/**
 * Output shape varies by mode but always includes:
 * { mode, items: [...], narrative: string, generatedAt: ISO, model: string }
 */
export async function getStoredModeOutput(ownerId, mode) {
  const raw = await redis(["GET", getModeOutputKey(ownerId, mode)]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function storeModeOutput(ownerId, mode, output) {
  const payload = { ...output, mode, generatedAt: new Date().toISOString() };
  await redis(["SET", getModeOutputKey(ownerId, mode), JSON.stringify(payload)]);
  await redis(["EXPIRE", getModeOutputKey(ownerId, mode), TTL_7D]);
  return payload;
}

// ── Mode Feedback (HiTL on mode outputs) ───────────────────────────────

export function getModeFeedbackKey(ownerId) {
  return redisKey("mode_feedback", ownerId);
}

/**
 * Each feedback entry keeps the original contract:
 * { mode, itemId, response: "helpful"|"not_helpful", timestamp }
 * Extra metadata is additive and optional.
 */
export async function storeModeFeedback(ownerId, mode, itemId, response, metadata = {}) {
  const key = getModeFeedbackKey(ownerId);
  const entry = JSON.stringify({
    mode,
    itemId,
    response,
    timestamp: Date.now(),
    ...metadata,
  });
  await redis(["RPUSH", key, entry]);
  await redis(["EXPIRE", key, TTL_90D]);
}

export async function getModeFeedback(ownerId) {
  const key = getModeFeedbackKey(ownerId);
  const raw = await redis(["LRANGE", key, "0", "-1"]);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => { try { return JSON.parse(r); } catch { return null; } })
    .filter(Boolean);
}

/**
 * Update profile based on feedback — auto-adjust liked/disliked lists.
 */
export async function applyModeFeedbackToProfile(ownerId, mode, itemId, response) {
  const profile = (await getModeProfile(ownerId)) || {};
  const likedKey = mode === "move" ? "likedMovements" : "likedNourishments";
  const dislikedKey = mode === "move" ? "dislikedMovements" : "dislikedNourishments";
  const liked = new Set(profile[likedKey] || []);
  const disliked = new Set(profile[dislikedKey] || []);

  if (response === "helpful") {
    liked.add(itemId);
    disliked.delete(itemId);
  } else if (response === "not_helpful") {
    disliked.add(itemId);
    liked.delete(itemId);
  }

  return storeModeProfile(ownerId, {
    ...profile,
    [likedKey]: [...liked],
    [dislikedKey]: [...disliked],
  });
}
