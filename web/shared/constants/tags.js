/** Maximum tags a user can attach to a single moment */
export const MAX_TAGS_PER_MOMENT = 3;

/**
 * Region-based adaptive tag pools.
 * Keys match emotionRegionKey() output: {bad,neutral,good}_{low,mid,high}
 */
export const REGION_TAGS = {
  bad_high:    ["pressure", "conflict", "rushed", "overstimulated", "angry", "tense", "panicked", "overwhelmed"],
  bad_mid:     ["irritated", "stuck", "uneasy", "restless", "agitated", "on edge"],
  bad_low:     ["drained", "lonely", "disappointed", "numb", "discouraged", "stuck", "heavy", "hopeless"],
  neutral_high:["wired", "distracted", "scattered", "unsettled", "anticipating", "hyperaware"],
  neutral_mid: ["waiting", "autopilot", "indifferent", "routine", "in between", "so-so"],
  neutral_low: ["flat", "tired", "disconnected", "empty", "meh", "foggy"],
  good_high:   ["motivated", "connected", "proud", "playful", "confident", "inspired", "excited", "alive"],
  good_mid:    ["steady", "focused", "engaged", "clear", "hopeful", "pleasant"],
  good_low:    ["peaceful", "relieved", "grateful", "safe", "cozy", "content", "settled", "resting"],
};