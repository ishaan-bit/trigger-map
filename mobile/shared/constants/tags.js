/**
 * Category-specific tags for each trigger.
 * Max 3 selectable per moment. Shown as optional chips after emotion selection.
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
export const ALL_TAGS = new Set(Object.values(TRIGGER_TAGS).flat());

export const MAX_TAGS_PER_MOMENT = 3;
