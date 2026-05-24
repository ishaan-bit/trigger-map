import { derivedEmotionLabel, emotionRegionKey } from "./emotions.js";

const REGION_SUGGESTIONS = {
  bad_high: [
    "Wired", "Hyperaware", "On edge", "Defensive", "Pressured",
    "Overstimulated", "Anticipating", "Too much input", "Trying to keep control",
  ],
  good_high: [
    "Energized", "Excited", "Motivated", "Socially charged", "Hopeful",
    "Playful", "Ready to act", "Momentum", "Good pressure", "Looking forward",
  ],
  bad_low: [
    "Drained", "Heavy", "Disconnected", "Numb", "Avoidant",
    "Lonely", "Tired of explaining", "Emotionally flat", "Low bandwidth", "Withdrawing",
  ],
  good_low: [
    "Calm", "Settled", "Safe", "Clear", "Supported",
    "Relieved", "Grateful", "Grounded", "Slow and okay", "Easy connection",
  ],
  neutral_mid: [
    "Mixed", "Unsure", "Waiting", "Processing", "Distracted",
    "Background stress", "Slight shift", "Not clear yet", "Something unresolved", "Just noticing",
  ],
  bad_mid: ["Uneasy", "Irritated", "Blocked", "Friction", "Unseen", "Unresolved", "Resistant"],
  good_mid: ["Steady", "Clear", "Focused", "Open", "Balanced", "Present", "Good rhythm"],
  neutral_high: ["Wired", "Distracted", "Scattered", "Unsettled", "Anticipating", "Hyperaware", "Can't settle"],
  neutral_low: ["Flat", "Tired", "Foggy", "Checked out", "Low energy", "Quiet", "Detached"],
};

const DOMAIN_SUGGESTIONS = {
  family: {
    bad_high: ["Tension at home", "Feeling judged", "Old pattern triggered", "Too many demands", "Boundary crossed", "Unsaid things", "Protecting myself"],
    good_high: ["Warm conversation", "Looking forward", "Family plan", "Feeling included", "Shared excitement", "Good news"],
    bad_low: ["Feeling distant", "Not heard", "Carrying emotional weight", "Family fatigue", "Quiet resentment", "Missing someone"],
    good_low: ["Felt supported", "Peaceful at home", "Small kindness", "Easy silence", "Familiar comfort", "Safe with them"],
  },
  work: {
    bad_high: ["Deadline pressure", "Too many tasks", "Unclear expectations", "Meeting stress", "Performance anxiety", "Context switching", "Feeling watched"],
    good_high: ["Productive momentum", "Good challenge", "Clear target", "Recognition", "New idea", "Useful pressure"],
    bad_low: ["Burnt out", "Bored", "Stuck", "Underused", "Low motivation", "Drained by work"],
    good_low: ["Quiet progress", "Clear priorities", "Good rhythm", "Task completed", "Stable day", "Space to think"],
  },
  health: {
    bad_high: ["Restless body", "Poor sleep", "Caffeine spike", "Hunger", "Pain signal", "Sensory overload", "Racing energy"],
    good_high: ["Strong energy", "Post-workout lift", "Physically ready", "Awake", "Activated in a good way"],
    bad_low: ["Exhausted", "Heavy body", "Sleep debt", "Low fuel", "Sluggish", "Sick-ish", "No energy"],
    good_low: ["Rested", "Relaxed body", "Slow breathing", "Comfortable", "Recovered", "Soft energy"],
  },
  exercise: {
    bad_high: ["Restless body", "Racing energy", "Pushed too hard", "Body tension", "Sensory overload"],
    good_high: ["Strong energy", "Post-workout lift", "Physically ready", "Good challenge", "Activated in a good way"],
    bad_low: ["Heavy body", "Low fuel", "No energy", "Sluggish", "Recovery needed"],
    good_low: ["Recovered", "Relaxed body", "Slow breathing", "Comfortable", "Soft energy"],
  },
  sleep: {
    bad_high: ["Poor sleep", "Racing energy", "Can't settle", "Caffeine spike", "Restless body"],
    good_high: ["Awake", "Ready to act", "Strong energy", "Clear morning"],
    bad_low: ["Sleep debt", "Exhausted", "Heavy body", "Foggy", "No energy"],
    good_low: ["Rested", "Soft energy", "Slow breathing", "Recovered", "Comfortable"],
  },
  alone: {
    bad_high: ["Overthinking", "Self-criticism", "Fear of messing up", "Urgency", "Inner pressure", "Spiraling thoughts"],
    good_high: ["Inspired", "Ambitious", "Confident", "Curious", "Creative spark", "Wanting movement"],
    bad_low: ["Doubting myself", "Flat", "Unmotivated", "Avoiding", "Feeling behind", "Low self-trust"],
    good_low: ["Centered", "Accepting", "Clear-headed", "Self-trusting", "Gentle with myself", "At ease"],
  },
  other: {},
};

function intensityBandFor(valence = 0, arousal = 0, intensity) {
  const mag = typeof intensity === "number"
    ? intensity
    : Math.min(1, Math.sqrt(valence * valence + arousal * arousal));
  if (mag >= 0.7) return "high";
  if (mag >= 0.35) return "medium";
  return "low";
}

function quadrantFor(regionKey) {
  if (regionKey === "bad_high") return "high-arousal-low-valence";
  if (regionKey === "good_high") return "high-arousal-high-valence";
  if (regionKey === "bad_low") return "low-arousal-low-valence";
  if (regionKey === "good_low") return "low-arousal-high-valence";
  return "neutral-mid";
}

function normalizeDomain(domain) {
  const value = String(domain || "other").toLowerCase();
  if (value === "body") return "health";
  if (value === "self") return "alone";
  return value;
}

function addUnique(target, entries, metaBase) {
  const seen = new Set(target.map((item) => item.label.toLowerCase()));
  for (const label of entries || []) {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    target.push({ id, label, ...metaBase });
  }
}

export function getContributionSuggestions({
  domain,
  valence = 0,
  arousal = 0,
  intensity,
  emotionLabel,
  emotionQuadrant,
  intensityBand,
  limit = 9,
} = {}) {
  const regionKey = emotionRegionKey(valence, arousal);
  const band = intensityBand || intensityBandFor(valence, arousal, intensity);
  const quadrant = emotionQuadrant || quadrantFor(regionKey);
  const label = emotionLabel || derivedEmotionLabel(valence, arousal);
  const domainKey = normalizeDomain(domain);
  const domainConfig = DOMAIN_SUGGESTIONS[domainKey] || {};
  const suggestions = [];
  const metaBase = { quadrant, intensityBand: band, source: "dynamic-emotion-map" };

  addUnique(suggestions, domainConfig[regionKey], { ...metaBase, family: domainKey });
  addUnique(suggestions, REGION_SUGGESTIONS[regionKey], { ...metaBase, family: "emotion" });
  addUnique(suggestions, REGION_SUGGESTIONS.neutral_mid, { ...metaBase, family: "emotion" });

  return {
    primary: suggestions.slice(0, Math.min(6, limit)),
    secondary: suggestions.slice(6, limit),
    all: suggestions.slice(0, limit),
    emotionLabel: label,
    emotionQuadrant: quadrant,
    intensityBand: band,
    regionKey,
  };
}

export function buildContributionTagMeta(labels = [], suggestions = []) {
  const byLabel = new Map((suggestions || []).map((item) => [String(item.label).toLowerCase(), item]));
  return (labels || []).map((label) => {
    const match = byLabel.get(String(label).toLowerCase());
    return match || {
      id: String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      label,
      family: "legacy",
      source: "legacy",
    };
  });
}
