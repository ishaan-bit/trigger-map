import AsyncStorage from "@react-native-async-storage/async-storage";
import { emotionRegionKey } from "@triggermap/shared/constants/emotions";
import { getTriggerTagsForState } from "@triggermap/shared/constants/tags";

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

function normalizeEmotionContext(context) {
  if (!context) return { emotion: null, regionKey: null };
  if (typeof context === "string") return { emotion: context, regionKey: context };

  const regionKey = context.regionKey || emotionRegionKey(context.valence, context.arousal);
  return {
    emotion: context.emotion || null,
    regionKey,
    valence: context.valence,
    arousal: context.arousal,
  };
}

function contextKey(trigger, context) {
  const normalized = normalizeEmotionContext(context);
  return normalized.regionKey || normalized.emotion || trigger;
}

export async function recordTagUsage(trigger, context, tags) {
  if (!tags?.length || !trigger || !context) return;
  const data = await loadUsageData();
  const now = Date.now();
  const scopedKey = contextKey(trigger, context);

  for (const tag of tags) {
    const globalKey = `g:${tag}`;
    const pairKey = `p:${trigger}:${scopedKey}:${tag}`;

    if (!data[globalKey]) data[globalKey] = { count: 0, last: 0 };
    data[globalKey].count += 1;
    data[globalKey].last = now;

    if (!data[pairKey]) data[pairKey] = { count: 0, last: 0 };
    data[pairKey].count += 1;
    data[pairKey].last = now;
  }

  await saveUsageData(data);
}

export async function getRelevantTags(trigger, context) {
  const normalized = normalizeEmotionContext(context);
  const baseTags = getTriggerTagsForState(trigger, normalized);
  if (!baseTags.length) return [];

  const data = await loadUsageData();
  const now = Date.now();
  const DAY_MS = 86400000;
  const scopedKey = contextKey(trigger, normalized);

  const scored = baseTags.map((tag) => {
    const globalEntry = data[`g:${tag}`] || { count: 0, last: 0 };
    const pairEntry = data[`p:${trigger}:${scopedKey}:${tag}`] || { count: 0, last: 0 };

    const freq = Math.min(globalEntry.count / 10, 1);
    const cooc = Math.min(pairEntry.count / 5, 1);
    const lastUsed = Math.max(globalEntry.last, pairEntry.last);
    const daysSince = lastUsed ? (now - lastUsed) / DAY_MS : 999;
    const recency = lastUsed ? Math.max(0, 1 - daysSince / 7) : 0;

    return {
      tag,
      score: 0.5 * freq + 0.3 * cooc + 0.2 * recency,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
  return scored.map((entry) => entry.tag);
}

export function resetTagCache() {
  _cache = null;
}
