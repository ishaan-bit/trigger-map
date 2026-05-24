import AsyncStorage from "@react-native-async-storage/async-storage";
import { getContributionSuggestions } from "@triggermap/shared/constants/contributions";

const TAG_USAGE_KEY = "adaptive_tag_usage";
const MAX_SUGGESTED = 6;

// In-memory cache of usage counts. Loaded once at startup so look-ups are
// synchronous — AsyncStorage on Android is 100-300ms which made the tag
// section visibly lag the user's drag.
let _usageCache = {};
let _usageLoaded = false;
let _usageLoadingPromise = null;

function loadUsageCache() {
  if (_usageLoaded) return Promise.resolve(_usageCache);
  if (_usageLoadingPromise) return _usageLoadingPromise;
  _usageLoadingPromise = AsyncStorage.getItem(TAG_USAGE_KEY)
    .then((raw) => {
      if (raw) {
        try { _usageCache = JSON.parse(raw) || {}; } catch { _usageCache = {}; }
      }
      _usageLoaded = true;
      return _usageCache;
    })
    .catch(() => { _usageLoaded = true; return _usageCache; });
  return _usageLoadingPromise;
}

// Kick off the load eagerly at import time.
loadUsageCache();

function rankTags(trigger, context) {
  const suggestionSet = getContributionSuggestions({
    domain: trigger,
    valence: context.valence,
    arousal: context.arousal,
    intensity: context.intensity,
    emotionLabel: context.emotionLabel,
    emotionQuadrant: context.emotionQuadrant,
    intensityBand: context.intensityBand,
    limit: MAX_SUGGESTED + 3,
  });
  const pool = suggestionSet.all.map((item) => item.label);
  const key = `${trigger}:${context.regionKey}`;
  const history = _usageCache[key] || {};
  const scored = pool.map((tag, idx) => ({
    tag,
    count: history[tag] || 0,
    order: idx,
  }));
  scored.sort((a, b) => b.count - a.count || a.order - b.order);
  return scored.slice(0, MAX_SUGGESTED).map((s) => s.tag);
}

/** Synchronous — uses in-memory cache. Safe to call on every render. */
export function getRelevantTagsSync(trigger, context) {
  return rankTags(trigger, context);
}

export function getRelevantContributionSuggestionsSync(trigger, context) {
  const suggestionSet = getContributionSuggestions({
    domain: trigger,
    valence: context.valence,
    arousal: context.arousal,
    intensity: context.intensity,
    emotionLabel: context.emotionLabel,
    emotionQuadrant: context.emotionQuadrant,
    intensityBand: context.intensityBand,
    limit: MAX_SUGGESTED + 3,
  });
  const rankedLabels = rankTags(trigger, context);
  const byLabel = new Map(suggestionSet.all.map((item) => [item.label, item]));
  return rankedLabels.map((label) => byLabel.get(label)).filter(Boolean);
}

/**
 * Async API kept for backward compatibility; resolves with the same
 * synchronous result once the in-memory cache is hydrated.
 */
export async function getRelevantTags(trigger, context) {
  if (!_usageLoaded) await loadUsageCache();
  return rankTags(trigger, context);
}

/**
 * Record that these tags were selected for a trigger+region combo.
 * Updates the in-memory cache immediately so subsequent lookups reflect
 * the new counts, then persists to AsyncStorage in the background.
 */
export async function recordTagUsage(trigger, context, tags) {
  if (!_usageLoaded) await loadUsageCache();
  const key = `${trigger}:${context.regionKey}`;
  if (!_usageCache[key]) _usageCache[key] = {};
  for (const tag of tags) {
    _usageCache[key][tag] = (_usageCache[key][tag] || 0) + 1;
  }
  try {
    await AsyncStorage.setItem(TAG_USAGE_KEY, JSON.stringify(_usageCache));
  } catch { /* ignore */ }
}
