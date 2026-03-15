import { redis, redisKey } from "./redisClient.js";

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