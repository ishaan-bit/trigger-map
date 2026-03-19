/**
 * Category-specific tags for each trigger.
 * Max 3 selectable per moment. Shown as optional chips after emotion selection.
 */
export const TRIGGER_TAGS = {
  work: ["deadline", "feedback", "meeting", "pressure"],
  social: ["comparison", "rejection", "support", "event"],
  money: ["unexpected expense", "planning", "guilt", "goal"],
  family: ["expectation", "conflict", "support", "obligation"],
  exercise: ["motivation", "fatigue", "progress", "routine"],
  health: ["sleep", "pain", "recovery", "appointment"],
  travel: ["commute", "adventure", "delay", "new place"],
  alone: ["recharge", "loneliness", "reflection", "boredom"],
  other: [],
};

/** Flat set of all valid tags for validation */
export const ALL_TAGS = new Set(Object.values(TRIGGER_TAGS).flat());

export const MAX_TAGS_PER_MOMENT = 3;
