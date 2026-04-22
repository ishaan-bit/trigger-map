import AsyncStorage from "@react-native-async-storage/async-storage";
import { REGION_TAGS } from "@triggermap/shared/constants/tags";

const TAG_USAGE_KEY = "adaptive_tag_usage";
const MAX_SUGGESTED = 6;

/**
 * Return up to MAX_SUGGESTED tags for the current emotion region.
 * Previously-used tags for this trigger+region are promoted to the front.
 */
export async function getRelevantTags(trigger, context) {
  const pool = REGION_TAGS[context.regionKey] || REGION_TAGS.neutral_mid;
  let usage = {};
  try {
    const raw = await AsyncStorage.getItem(TAG_USAGE_KEY);
    if (raw) usage = JSON.parse(raw);
  } catch { /* ignore */ }

  const key = `${trigger}:${context.regionKey}`;
  const history = usage[key] || {};

  // Sort pool by usage count descending, then original order
  const scored = pool.map((tag, idx) => ({
    tag,
    count: history[tag] || 0,
    order: idx,
  }));
  scored.sort((a, b) => b.count - a.count || a.order - b.order);

  return scored.slice(0, MAX_SUGGESTED).map((s) => s.tag);
}

/**
 * Record that these tags were selected for a trigger+region combo.
 * Increments a simple counter per tag so future suggestions are smarter.
 */
export async function recordTagUsage(trigger, context, tags) {
  const storageKey = TAG_USAGE_KEY;
  let usage = {};
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) usage = JSON.parse(raw);
  } catch { /* ignore */ }

  const key = `${trigger}:${context.regionKey}`;
  if (!usage[key]) usage[key] = {};
  for (const tag of tags) {
    usage[key][tag] = (usage[key][tag] || 0) + 1;
  }

  await AsyncStorage.setItem(storageKey, JSON.stringify(usage));
}