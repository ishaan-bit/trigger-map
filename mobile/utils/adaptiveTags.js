import AsyncStorage from "@react-native-async-storage/async-storage";
import { TRIGGER_EMOTION_TAGS, TRIGGER_TAGS } from "@triggermap/shared/constants/tags";

const USAGE_KEY = "triggermap.tag_usage";

let _cache = null;

async function loadUsageData() {
  if (_cache) return _cache;
  try {
    const raw = await AsyncStorage.getItem(USAGE_KEY);
    _cache = raw ? JSON.parse(raw) : {};
  } catch {
    _cache = {};
  }
  return _cache;
}

async function saveUsageData(data) {
  _cache = data;
  try {
    await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(data));
  } catch {
    // best-effort persistence
  }
}

/**
 * Record that a set of tags was selected for a trigger+emotion pair.
 */
export async function recordTagUsage(trigger, emotion, tags) {
  if (!tags?.length || !trigger || !emotion) return;
  const data = await loadUsageData();
  const now = Date.now();

  for (const tag of tags) {
    const globalKey = `g:${tag}`;
    const pairKey = `p:${trigger}:${emotion}:${tag}`;

    if (!data[globalKey]) data[globalKey] = { count: 0, last: 0 };
    data[globalKey].count += 1;
    data[globalKey].last = now;

    if (!data[pairKey]) data[pairKey] = { count: 0, last: 0 };
    data[pairKey].count += 1;
    data[pairKey].last = now;
  }

  await saveUsageData(data);
}

/**
 * Get curated tags for a trigger+emotion combination.
 * Uses the emotion-aware TRIGGER_EMOTION_TAGS hierarchy (4 per pair).
 * Falls back to legacy TRIGGER_TAGS if pair not found.
 * Ranks by user history so most-used tags float to top.
 */
export async function getRelevantTags(trigger, emotion) {
  const emotionTags = TRIGGER_EMOTION_TAGS[trigger]?.[emotion];
  const baseTags = emotionTags || TRIGGER_TAGS[trigger] || [];
  if (!baseTags.length) return [];

  const data = await loadUsageData();
  const now = Date.now();
  const DAY_MS = 86400000;

  const scored = baseTags.map((tag) => {
    const globalEntry = data[`g:${tag}`] || { count: 0, last: 0 };
    const pairEntry = data[`p:${trigger}:${emotion}:${tag}`] || { count: 0, last: 0 };

    const freq = Math.min(globalEntry.count / 10, 1);
    const cooc = Math.min(pairEntry.count / 5, 1);

    const lastUsed = Math.max(globalEntry.last, pairEntry.last);
    const daysSince = lastUsed ? (now - lastUsed) / DAY_MS : 999;
    const recency = lastUsed ? Math.max(0, 1 - daysSince / 7) : 0;

    const score = 0.5 * freq + 0.3 * cooc + 0.2 * recency;
    return { tag, score };
  });

  scored.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
  return scored.map((s) => s.tag);
}

export function resetTagCache() {
  _cache = null;
}
