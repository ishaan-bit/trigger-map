import { emotionRegionKey } from "./emotions.js";

export const TRIGGER_EMOTION_TAGS = {
  work: {
    calm: ["flow", "focus", "clarity", "progress"],
    neutral: ["routine", "meeting", "admin", "steady"],
    anxious: ["deadline", "presentation", "pressure", "overwhelm"],
    frustrated: ["feedback", "blocked", "micromanage", "overload"],
    energized: ["win", "momentum", "collaboration", "breakthrough"],
  },
  family: {
    calm: ["support", "gratitude", "bonding", "comfort"],
    neutral: ["routine", "errand", "check-in", "obligation"],
    anxious: ["expectation", "judgment", "guilt", "worry"],
    frustrated: ["conflict", "boundary", "misunderstood", "pressure"],
    energized: ["celebration", "reunion", "laughter", "pride"],
  },
  partner: {
    calm: ["closeness", "trust", "safety", "affection"],
    neutral: ["routine", "logistics", "check-in", "space"],
    anxious: ["uncertainty", "avoidance", "jealousy", "worry"],
    frustrated: ["conflict", "miscommunication", "resentment", "neglect"],
    energized: ["spark", "adventure", "intimacy", "growth"],
  },
  social: {
    calm: ["belonging", "laughter", "ease", "connection"],
    neutral: ["small-talk", "plans", "acquaintance", "group"],
    anxious: ["comparison", "judgment", "awkward", "fomo"],
    frustrated: ["drained", "fake", "excluded", "obligation"],
    energized: ["deep-talk", "vibe", "inspiration", "new-people"],
  },
  alone: {
    calm: ["solitude", "rest", "reflection", "recharge"],
    neutral: ["quiet", "routine", "downtime", "waiting"],
    anxious: ["overthinking", "spiral", "loneliness", "restless"],
    frustrated: ["stuck", "boredom", "isolation", "rumination"],
    energized: ["creative", "freedom", "clarity", "self-care"],
  },
  exercise: {
    calm: ["stretch", "cooldown", "yoga", "recovery"],
    neutral: ["routine", "steady", "maintenance", "warmup"],
    anxious: ["pushing", "injury-fear", "comparison", "fatigue"],
    frustrated: ["skip", "plateau", "soreness", "failure"],
    energized: ["endorphins", "personal-best", "flow", "discipline"],
  },
  travel: {
    calm: ["scenic", "arrival", "exploration", "freedom"],
    neutral: ["commute", "transit", "routine", "movement"],
    anxious: ["delay", "lost", "rushing", "uncertainty"],
    frustrated: ["traffic", "cancellation", "exhaustion", "crowd"],
    energized: ["adventure", "discovery", "wanderlust", "spontaneous"],
  },
  health: {
    calm: ["recovery", "healing", "rest", "self-care"],
    neutral: ["checkup", "routine", "medication", "maintenance"],
    anxious: ["symptoms", "waiting", "uncertainty", "worry"],
    frustrated: ["illness", "setback", "pain", "insomnia"],
    energized: ["progress", "milestone", "vitality", "strength"],
  },
  money: {
    calm: ["saving", "stability", "plan", "security"],
    neutral: ["budget", "transaction", "review", "routine"],
    anxious: ["bill", "debt", "unexpected", "scarcity"],
    frustrated: ["overspend", "loss", "unfair", "stress"],
    energized: ["earning", "investment", "goal-hit", "opportunity"],
  },
};

export const TRIGGER_REGION_TAGS = {
  work: {
    positive_high: ["momentum", "breakthrough", "creative", "collaboration"],
    positive_low: ["focus", "clarity", "deep-work", "in-control"],
    positive_mid: ["productive", "steady", "progress", "capable"],
    neutral_high: ["busy", "switching", "anticipation", "prepping"],
    neutral_low: ["routine", "admin", "autopilot", "clocking-in"],
    negative_high: ["deadline", "pressure", "blocked", "scramble"],
    negative_low: ["drained", "burnout", "detached", "stalled"],
    negative_mid: ["friction", "micromanage", "unclear", "heavy"],
    center: ["normal-day", "steady", "routine", "fine"],
  },
  family: {
    positive_high: ["celebration", "laughter", "warmth", "reunion"],
    positive_low: ["support", "comfort", "bonding", "safe"],
    positive_mid: ["care", "together", "gratitude", "ease"],
    neutral_high: ["planning", "coordination", "check-in", "busy-home"],
    neutral_low: ["routine", "errand", "obligation", "regular"],
    negative_high: ["argument", "expectation", "judgment", "pressure"],
    negative_low: ["distance", "guilt", "drained", "withdrawn"],
    negative_mid: ["misread", "boundary", "tense", "unsettled"],
    center: ["home", "usual", "family-time", "neutral"],
  },
  partner: {
    positive_high: ["spark", "playful", "chemistry", "adventure"],
    positive_low: ["closeness", "trust", "safe", "affection"],
    positive_mid: ["connected", "seen", "soft", "grounded"],
    neutral_high: ["anticipation", "waiting", "mixed-signals", "processing"],
    neutral_low: ["routine", "space", "logistics", "ordinary"],
    negative_high: ["conflict", "jealousy", "avoidance", "miscommunication"],
    negative_low: ["distance", "numb", "lonely", "shut-down"],
    negative_mid: ["uncertainty", "resentment", "off-balance", "missed"],
    center: ["usual", "steady", "check-in", "normal"],
  },
  social: {
    positive_high: ["vibe", "deep-talk", "belonging", "buzz"],
    positive_low: ["ease", "connection", "comfortable", "seen"],
    positive_mid: ["friendly", "present", "light", "open"],
    neutral_high: ["crowd", "social-mode", "small-talk", "anticipation"],
    neutral_low: ["group", "plans", "familiar", "casual"],
    negative_high: ["awkward", "comparison", "fomo", "judged"],
    negative_low: ["drained", "excluded", "isolated", "done"],
    negative_mid: ["fake", "out-of-place", "guarded", "tense"],
    center: ["social", "normal", "okay", "mixed"],
  },
  alone: {
    positive_high: ["creative", "clarity", "reset", "free"],
    positive_low: ["rest", "solitude", "recharge", "quiet"],
    positive_mid: ["reflective", "steady", "self-time", "settled"],
    neutral_high: ["restless", "thinking", "itchy", "waiting"],
    neutral_low: ["downtime", "routine", "pausing", "still"],
    negative_high: ["spiral", "overthinking", "restless", "lonely"],
    negative_low: ["numb", "isolated", "stuck", "foggy"],
    negative_mid: ["bored", "ruminating", "off", "heavy"],
    center: ["alone-time", "quiet", "neutral", "just-being"],
  },
  exercise: {
    positive_high: ["strong", "endorphins", "push", "personal-best"],
    positive_low: ["recovery", "stretch", "cooldown", "release"],
    positive_mid: ["steady", "disciplined", "active", "good-session"],
    neutral_high: ["warming-up", "adrenaline", "challenged", "activated"],
    neutral_low: ["maintenance", "routine", "habit", "showed-up"],
    negative_high: ["overpush", "comparison", "injury-fear", "frustrated"],
    negative_low: ["fatigue", "skip", "sore", "depleted"],
    negative_mid: ["plateau", "resistance", "heavy-body", "unmotivated"],
    center: ["movement", "routine", "okay-session", "baseline"],
  },
  travel: {
    positive_high: ["adventure", "discovery", "spontaneous", "alive"],
    positive_low: ["scenic", "arrival", "freedom", "unwinding"],
    positive_mid: ["moving", "curious", "open", "fresh"],
    neutral_high: ["transit", "alert", "switching", "on-the-go"],
    neutral_low: ["commute", "routine-route", "waiting", "in-between"],
    negative_high: ["delay", "rushing", "lost", "crowded"],
    negative_low: ["exhausted", "jetlag", "drained", "stranded"],
    negative_mid: ["traffic", "uncertain", "stuck", "irritated"],
    center: ["travel-day", "usual-route", "movement", "neutral"],
  },
  health: {
    positive_high: ["progress", "vitality", "strong", "relief"],
    positive_low: ["healing", "rest", "recovery", "cared-for"],
    positive_mid: ["stable", "improving", "supported", "okay"],
    neutral_high: ["monitoring", "waiting", "checking", "alert"],
    neutral_low: ["routine", "medication", "maintenance", "checkup"],
    negative_high: ["symptoms", "pain", "worry", "flare-up"],
    negative_low: ["fatigued", "weak", "insomnia", "drained"],
    negative_mid: ["uncertain", "setback", "off", "fragile"],
    center: ["health", "baseline", "regular-care", "neutral"],
  },
  money: {
    positive_high: ["earning", "opportunity", "win", "growth"],
    positive_low: ["secure", "saving", "stable", "plan"],
    positive_mid: ["on-track", "covered", "steady", "relief"],
    neutral_high: ["planning", "reviewing", "decision", "calculating"],
    neutral_low: ["budget", "transaction", "routine", "admin"],
    negative_high: ["bill", "debt", "unexpected", "scarcity"],
    negative_low: ["drained", "stuck", "behind", "defeated"],
    negative_mid: ["overspend", "stress", "tight", "uncertain"],
    center: ["money", "usual", "neutral", "maintenance"],
  },
};

export const TRIGGER_TAGS = {
  work: ["deadline", "feedback", "meeting", "pressure"],
  family: ["expectation", "conflict", "support", "obligation"],
  partner: ["conflict", "distance", "closeness", "uncertainty"],
  social: ["group", "plans", "comparison", "isolation"],
  alone: ["rest", "overthinking", "loneliness", "recharge"],
  exercise: ["energy", "fatigue", "discipline", "skip"],
  travel: ["movement", "delay", "exploration", "stress"],
  health: ["sleep", "diet", "illness", "recovery"],
  money: ["spending", "earning", "stress", "planning"],
};

export const REGION_TAGS = {
  positive_high: ["energized", "lifted", "engaged", "alive"],
  positive_low: ["calm", "content", "safe", "settled"],
  positive_mid: ["good", "steady", "okay", "grounded"],
  neutral_high: ["alert", "busy", "activated", "restless"],
  neutral_low: ["flat", "tired", "quiet", "low"],
  negative_high: ["stressed", "overwhelmed", "tense", "irritated"],
  negative_low: ["drained", "heavy", "numb", "disconnected"],
  negative_mid: ["off", "uneasy", "friction", "unsettled"],
  center: ["neutral", "fine", "steady", "usual"],
};

export function getTriggerTagsForState(trigger, state = {}) {
  const regionKey = state.regionKey || emotionRegionKey(state.valence, state.arousal);
  const regionTags = TRIGGER_REGION_TAGS[trigger]?.[regionKey];
  if (regionTags?.length) return regionTags;
  if (state.emotion && TRIGGER_EMOTION_TAGS[trigger]?.[state.emotion]?.length) {
    return TRIGGER_EMOTION_TAGS[trigger][state.emotion];
  }
  return REGION_TAGS[regionKey] || TRIGGER_TAGS[trigger] || [];
}

export const ALL_TAGS = new Set([
  ...Object.values(TRIGGER_TAGS).flat(),
  ...Object.values(REGION_TAGS).flat(),
  ...Object.values(TRIGGER_EMOTION_TAGS).flatMap((emotions) => Object.values(emotions).flat()),
  ...Object.values(TRIGGER_REGION_TAGS).flatMap((regions) => Object.values(regions).flat()),
]);

export const MAX_TAGS_PER_MOMENT = 3;
