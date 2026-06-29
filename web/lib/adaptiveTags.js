import { getContributionSuggestions } from "@triggermap/shared/constants/contributions";

/**
 * Adaptive contribution tags (web port of mobile/utils/adaptiveTags.js).
 *
 * Ranks shared getContributionSuggestions by per-(trigger:region) usage history
 * so the chips a user picks most for a given context float to the top. Usage is
 * cached in-memory (synchronous lookups during a drag) and persisted to
 * localStorage.
 */

const TAG_USAGE_KEY = "adaptive_tag_usage";
const MAX_SUGGESTED = 6;

let _usageCache = {};
let _usageLoaded = false;

function loadUsageCache() {
  if (_usageLoaded || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(TAG_USAGE_KEY);
    if (raw) _usageCache = JSON.parse(raw) || {};
  } catch {
    _usageCache = {};
  }
  _usageLoaded = true;
}

function buildSuggestionSet(trigger, context) {
  return getContributionSuggestions({
    domain: trigger,
    valence: context.valence,
    arousal: context.arousal,
    intensity: context.intensity,
    emotionLabel: context.emotionLabel,
    emotionQuadrant: context.emotionQuadrant,
    intensityBand: context.intensityBand,
    limit: MAX_SUGGESTED + 3,
  });
}

function rankLabels(trigger, context, pool) {
  const key = `${trigger}:${context.regionKey}`;
  const history = _usageCache[key] || {};
  const scored = pool.map((label, idx) => ({ label, count: history[label] || 0, order: idx }));
  scored.sort((a, b) => b.count - a.count || a.order - b.order);
  return scored.slice(0, MAX_SUGGESTED).map((s) => s.label);
}

/** Synchronous — ranked label strings. */
export function getRelevantTagsSync(trigger, context) {
  loadUsageCache();
  const set = buildSuggestionSet(trigger, context);
  return rankLabels(trigger, context, set.all.map((item) => item.label));
}

/** Synchronous — ranked full suggestion objects (label + meta). */
export function getRelevantContributionSuggestionsSync(trigger, context) {
  loadUsageCache();
  const set = buildSuggestionSet(trigger, context);
  const rankedLabels = rankLabels(trigger, context, set.all.map((item) => item.label));
  const byLabel = new Map(set.all.map((item) => [item.label, item]));
  return rankedLabels.map((label) => byLabel.get(label)).filter(Boolean);
}

/** Record that these tags were chosen for a trigger+region combo. */
export function recordTagUsage(trigger, context, tags) {
  loadUsageCache();
  const key = `${trigger}:${context.regionKey}`;
  if (!_usageCache[key]) _usageCache[key] = {};
  for (const tag of tags) {
    _usageCache[key][tag] = (_usageCache[key][tag] || 0) + 1;
  }
  try {
    window.localStorage.setItem(TAG_USAGE_KEY, JSON.stringify(_usageCache));
  } catch {
    // ignore persistence failure
  }
}
