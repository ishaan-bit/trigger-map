import AsyncStorage from "@react-native-async-storage/async-storage";
import { TRIGGER_TAGS } from "@triggermap/shared/constants/tags";

const USAGE_KEY = "triggermap.tag_usage";

/**
 * Adaptive tag ranking system.
 * Tags depend on trigger + emotion, ranked by:
 *   0.5 * user_frequency + 0.3 * trigger_emotion_cooccurrence + 0.2 * recency
 * Returns top 4–6 tags.
 */

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
 * Get ranked, relevant tags for a trigger+emotion combination.
 * Returns top 6 tags sorted by adaptive score.
 */
export async function getRelevantTags(trigger, emotion) {
  const baseTags = TRIGGER_TAGS[trigger] || [];
  if (!baseTags.length) return [];

  const data = await loadUsageData();
  const now = Date.now();
  const DAY_MS = 86400000;

  const scored = baseTags.map((tag) => {
    const globalEntry = data[`g:${tag}`] || { count: 0, last: 0 };
    const pairEntry = data[`p:${trigger}:${emotion}:${tag}`] || { count: 0, last: 0 };

    // Normalize frequency (log scale, capped)
    const freq = Math.min(globalEntry.count / 10, 1);

    // Co-occurrence with this specific trigger+emotion pair
    const cooc = Math.min(pairEntry.count / 5, 1);

    // Recency — decay over 7 days
    const lastUsed = Math.max(globalEntry.last, pairEntry.last);
    const daysSince = lastUsed ? (now - lastUsed) / DAY_MS : 999;
    const recency = lastUsed ? Math.max(0, 1 - daysSince / 7) : 0;

    const score = 0.5 * freq + 0.3 * cooc + 0.2 * recency;

    return { tag, score };
  });

  // Sort by score descending, then alphabetically for ties
  scored.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));

  return scored.slice(0, 6).map((s) => s.tag);
}

/**
 * Reset cached usage data (for testing/development).
 */
export function resetTagCache() {
  _cache = null;
}
