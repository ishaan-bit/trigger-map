/**
 * Emotion-aware tags for each trigger × emotion pair.
 * Only tags that make emotional sense for the combination are shown.
 * 4 tags per pairing — curated, not random.
 */
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

/**
 * Legacy flat trigger tags — kept for backward compatibility with
 * existing moments and backend aggregation. Do not use for new UI.
 */
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

/** Flat set of all valid tags for validation */
export const ALL_TAGS = new Set([
  ...Object.values(TRIGGER_TAGS).flat(),
  ...Object.values(TRIGGER_EMOTION_TAGS).flatMap((emotions) =>
    Object.values(emotions).flat()
  ),
]);

export const MAX_TAGS_PER_MOMENT = 3;
