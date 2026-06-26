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

// Domain-specific "what contributed" tags, mapped to the SAME 9 emotion regions
// the slider produces ({good,bad,neutral} × {high,mid,low}). Every domain the Log
// screen can pass (work, family, partner, social, money, health, exercise, alone,
// travel, + other) is covered across all 9 regions, so the contribution chips stay
// granular and on-feeling wherever the slider lands — not a generic fallback.
const DOMAIN_SUGGESTIONS = {
  work: {
    bad_high: ["Deadline pressure", "Too many tasks", "Unclear expectations", "Meeting stress", "Performance anxiety", "Context switching", "Feeling watched"],
    bad_mid: ["Annoying task", "Slow progress", "Friction with a colleague", "Interrupted focus", "Unclear priorities", "Pushback"],
    bad_low: ["Burnt out", "Bored", "Stuck", "Underused", "Low motivation", "Drained by work", "Checked out"],
    good_high: ["Productive momentum", "Good challenge", "Clear target", "Recognition", "New idea", "Useful pressure", "On a roll"],
    good_mid: ["Steady progress", "Clear priorities", "Good rhythm", "Focused", "In control", "Manageable load"],
    good_low: ["Quiet progress", "Task completed", "Stable day", "Space to think", "Wrapped up", "Calm workload"],
    neutral_high: ["Lots to juggle", "Anticipating a deadline", "Keyed up before a meeting", "Scattered focus", "Waiting on others"],
    neutral_mid: ["Mixed workday", "Processing feedback", "Waiting for clarity", "Background work stress", "Not sure where it's going"],
    neutral_low: ["Slow workday", "Low energy at work", "Going through the motions", "Quiet office", "Coasting"],
  },
  family: {
    bad_high: ["Tension at home", "Feeling judged", "Old pattern triggered", "Too many demands", "Boundary crossed", "Unsaid things", "Protecting myself"],
    bad_mid: ["Small friction", "Feeling unseen", "Minor disagreement", "Walking on eggshells", "Unspoken tension"],
    bad_low: ["Feeling distant", "Not heard", "Carrying emotional weight", "Family fatigue", "Quiet resentment", "Missing someone"],
    good_high: ["Warm conversation", "Looking forward", "Family plan", "Feeling included", "Shared excitement", "Good news"],
    good_mid: ["Easy time together", "Feeling settled at home", "Small connection", "Ordinary good moment"],
    good_low: ["Felt supported", "Peaceful at home", "Small kindness", "Easy silence", "Familiar comfort", "Safe with them"],
    neutral_high: ["Anticipating a visit", "Lots happening at home", "Bracing for a conversation", "Keyed up around family"],
    neutral_mid: ["Mixed feelings about family", "Processing something said", "Waiting to talk it out", "Unresolved at home"],
    neutral_low: ["Quiet at home", "Low-key day", "Keeping to myself", "Going through routines"],
  },
  partner: {
    bad_high: ["Argument", "Feeling unheard", "Jealousy", "Needs mismatch", "Heated moment", "Defensive", "Walking on eggshells"],
    bad_mid: ["Small disagreement", "Feeling distant", "Miscommunication", "Unspoken tension", "Needing space", "Off rhythm"],
    bad_low: ["Disconnected", "Lonely together", "Emotional distance", "Resentment building", "Same old issue", "Unappreciated"],
    good_high: ["Excited together", "Flirty", "Looking forward to them", "Reconnecting", "Shared spark", "Feeling chosen"],
    good_mid: ["Comfortable together", "Good talk", "On the same page", "Easy connection", "Feeling teamed up"],
    good_low: ["Held", "Safe with them", "Quiet closeness", "Felt cared for", "Cozy", "Settled together"],
    neutral_high: ["Anticipating a talk", "Awaiting a reply", "Bracing for a topic", "Keyed up before seeing them"],
    neutral_mid: ["Mixed about us", "Processing a conversation", "Unsure where we stand", "Something unspoken"],
    neutral_low: ["Low-key together", "Parallel time", "Quiet evening", "Keeping it light"],
  },
  social: {
    bad_high: ["Social pressure", "Fear of judgment", "Said the wrong thing", "Overstimulated", "Comparing myself", "FOMO", "Too much input"],
    bad_mid: ["Awkward moment", "Forced small talk", "On the outside", "Draining conversation", "Social friction"],
    bad_low: ["Socially drained", "Lonely in a crowd", "Left out", "Wanting to leave", "People-fatigue", "Disconnected"],
    good_high: ["Great conversation", "Belonging", "Laughing together", "Energized by people", "Made a connection", "Felt seen"],
    good_mid: ["Easy hangout", "Comfortable in the group", "Good company", "Pleasant catch-up"],
    good_low: ["Relaxed with friends", "Quiet connection", "Felt accepted", "Low-key and warm", "At ease socially"],
    neutral_high: ["Before an event", "Anticipating a gathering", "Lots of people", "Keyed up to socialize"],
    neutral_mid: ["Mixed about the plan", "Unsure if I'll go", "Processing a social thing", "Not sure how it landed"],
    neutral_low: ["Quiet social day", "Keeping to myself", "Low social battery", "Observing"],
  },
  money: {
    bad_high: ["Bill due", "Unexpected expense", "Checking my balance", "Debt pressure", "Spending guilt", "Income uncertainty", "Big purchase stress"],
    bad_mid: ["Tight budget", "Money disagreement", "Small overspend", "Nagging cost", "Comparing finances"],
    bad_low: ["Money exhaustion", "Behind on goals", "Scarcity weight", "Avoiding finances", "Hopeless about money"],
    good_high: ["Got paid", "Hit a savings goal", "Good deal", "Financial win", "Bonus", "Feeling secure"],
    good_mid: ["On budget", "Bills handled", "Steady finances", "Small saving", "In control of money"],
    good_low: ["Financially at ease", "Provided for", "Settled about money", "Relieved after paying", "Enough for now"],
    neutral_high: ["Before payday", "Awaiting a payment", "Planning a big spend", "Watching the budget"],
    neutral_mid: ["Mixed about money", "Reviewing finances", "Unsure about a purchase", "Waiting on a decision"],
    neutral_low: ["Not thinking about money", "Routine spending", "Quiet on finances"],
  },
  health: {
    bad_high: ["Restless body", "Poor sleep", "Caffeine spike", "Hunger", "Pain signal", "Sensory overload", "Racing energy"],
    bad_mid: ["Slightly off", "Minor ache", "Sluggish digestion", "Low-grade discomfort", "Body tension"],
    bad_low: ["Exhausted", "Heavy body", "Sleep debt", "Low fuel", "Sluggish", "Sick-ish", "No energy"],
    good_high: ["Strong energy", "Post-workout lift", "Physically ready", "Awake", "Activated in a good way"],
    good_mid: ["Feeling okay", "Body cooperating", "Steady energy", "Comfortable in my body"],
    good_low: ["Rested", "Relaxed body", "Slow breathing", "Comfortable", "Recovered", "Soft energy"],
    neutral_high: ["Wired body", "Can't settle physically", "Restless energy", "Buzzing"],
    neutral_mid: ["Body feels neutral", "Tracking a symptom", "Waiting to feel better", "Not sure how I feel physically"],
    neutral_low: ["Low energy", "Tired but okay", "Quiet body", "Resting"],
  },
  exercise: {
    bad_high: ["Pushed too hard", "Racing energy", "Body tension", "Overexerted", "Sensory overload"],
    bad_mid: ["Didn't feel like it", "Sluggish workout", "Off form", "Going through motions"],
    bad_low: ["Heavy body", "Low fuel", "No energy", "Recovery needed", "Skipped and flat"],
    good_high: ["Strong energy", "Post-workout lift", "Physically ready", "Good challenge", "Crushed it", "Activated in a good way"],
    good_mid: ["Decent session", "Moved my body", "Steady effort", "Felt good to move"],
    good_low: ["Recovered", "Relaxed body", "Slow breathing", "Comfortable", "Soft energy", "Pleasant cooldown"],
    neutral_high: ["Amped before a workout", "Restless to move", "Pre-workout buzz"],
    neutral_mid: ["Mixed about exercising", "Deciding whether to move", "Unsure I have it in me"],
    neutral_low: ["Low energy to move", "Rest day", "Quiet body"],
  },
  sleep: {
    bad_high: ["Poor sleep", "Racing thoughts at night", "Can't settle", "Caffeine spike", "Restless body"],
    bad_mid: ["Light sleep", "Woke up off", "Slightly tired", "Disrupted night"],
    bad_low: ["Sleep debt", "Exhausted", "Heavy body", "Foggy", "No energy"],
    good_high: ["Awake", "Ready to act", "Strong energy", "Clear morning"],
    good_mid: ["Decent rest", "Okay morning", "Steady after sleep"],
    good_low: ["Rested", "Soft energy", "Slow breathing", "Recovered", "Comfortable"],
    neutral_high: ["Wired despite tiredness", "Can't wind down", "Restless before bed"],
    neutral_mid: ["Mixed sleep", "Not sure how I slept", "Average night"],
    neutral_low: ["Tired", "Groggy", "Slow start", "Quiet morning"],
  },
  alone: {
    bad_high: ["Overthinking", "Self-criticism", "Fear of messing up", "Urgency", "Inner pressure", "Spiraling thoughts"],
    bad_mid: ["Restless alone", "Mild self-doubt", "Nagging thought", "Bored and itchy", "Slight unease"],
    bad_low: ["Doubting myself", "Flat", "Unmotivated", "Avoiding", "Feeling behind", "Low self-trust", "Lonely"],
    good_high: ["Inspired", "Ambitious", "Confident", "Curious", "Creative spark", "Wanting movement"],
    good_mid: ["Content alone", "Focused on my thing", "Comfortable solitude", "Quietly okay"],
    good_low: ["Centered", "Accepting", "Clear-headed", "Self-trusting", "Gentle with myself", "Peaceful solitude"],
    neutral_high: ["Restless in my head", "Lots of thoughts", "Keyed up alone", "Can't settle"],
    neutral_mid: ["Mixed alone time", "Processing things", "Sitting with it", "Unclear mood"],
    neutral_low: ["Quiet alone", "Low energy solo", "Zoning out", "Just being"],
  },
  travel: {
    bad_high: ["Running late", "Navigation stress", "Crowds", "Delay", "Lost", "Logistics overload", "Unfamiliar place"],
    bad_mid: ["Tiring journey", "Cramped", "Minor mix-up", "Out of routine", "Mild disorientation"],
    bad_low: ["Travel-drained", "Jet-lagged", "Worn out", "Homesick", "Depleted from moving around"],
    good_high: ["Adventure", "New-place excitement", "Freedom", "Exploring", "Spontaneous", "Travel buzz"],
    good_mid: ["Smooth trip", "Enjoying the change", "Good pace", "Pleasant journey"],
    good_low: ["Restful travel", "Settled in", "Calm on the move", "Comfortable journey", "Slow and easy"],
    neutral_high: ["Before a trip", "Packing energy", "Anticipating travel", "In-transit buzz"],
    neutral_mid: ["Mixed about the trip", "In between places", "Waiting at a stop", "Unsure of plans"],
    neutral_low: ["Long quiet ride", "Low energy traveling", "Tired on the way", "Drifting"],
  },
  other: {
    bad_high: ["Something pressing", "Unexpected stress", "Too much at once", "On edge"],
    bad_mid: ["Something off", "Minor friction", "Nagging concern"],
    bad_low: ["Worn down", "Heavy day", "Low and flat"],
    good_high: ["Something exciting", "Good surprise", "Lifted", "Momentum"],
    good_mid: ["Decent moment", "Steady", "Okay"],
    good_low: ["At ease", "Calm moment", "Relieved"],
    neutral_high: ["Anticipating something", "Keyed up", "Lots going on"],
    neutral_mid: ["Mixed", "Unclear", "Processing"],
    neutral_low: ["Quiet", "Low energy", "Just noticing"],
  },
};

// Same-valence neighbour bands — used to top up a region that's light on
// domain-specific tags so we never fall through to purely generic suggestions.
const NEIGHBOUR_BANDS = {
  bad_high: ["bad_mid", "bad_low"],
  bad_mid: ["bad_high", "bad_low"],
  bad_low: ["bad_mid", "bad_high"],
  good_high: ["good_mid", "good_low"],
  good_mid: ["good_high", "good_low"],
  good_low: ["good_mid", "good_high"],
  neutral_high: ["neutral_mid", "neutral_low"],
  neutral_mid: ["neutral_high", "neutral_low"],
  neutral_low: ["neutral_mid", "neutral_high"],
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

/**
 * Collect the domain-specific tags for a region, topping up from same-valence
 * neighbour bands when the exact region is sparse. Guarantees domain-grounded
 * tags for every slider position, not just the four "corner" regions.
 */
function domainTagsForRegion(domainConfig, regionKey, minCount = 4) {
  const out = [...(domainConfig[regionKey] || [])];
  if (out.length >= minCount) return out;
  for (const band of NEIGHBOUR_BANDS[regionKey] || []) {
    for (const tag of domainConfig[band] || []) {
      if (!out.includes(tag)) out.push(tag);
      if (out.length >= minCount) return out;
    }
  }
  return out;
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

  // Domain-specific tags lead (incl. same-valence neighbour top-up), then the
  // region's generic feeling words, then a small neutral_mid safety net.
  addUnique(suggestions, domainTagsForRegion(domainConfig, regionKey), { ...metaBase, family: domainKey });
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
