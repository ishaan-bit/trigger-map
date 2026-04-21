/** Maximum tags a user can attach to a single moment */
export const MAX_TAGS_PER_MOMENT = 3;

/**
 * Region-based adaptive tag pools.
 * Keys match emotionRegionKey() output: {bad,neutral,good}_{low,mid,high}
 * Pools are intentionally broad — adaptiveTags.js surfaces the most relevant.
 */
export const REGION_TAGS = {
  // Bad feel + high energy: stress, anger, panic
  bad_high: [
    "pressure", "conflict", "rushed", "overstimulated", "angry", "tense",
    "panicked", "overwhelmed", "defensive", "frustrated", "on edge",
    "snapping", "wound up", "chaos", "triggered", "fighting",
  ],
  // Bad feel + moderate energy: irritation, friction
  bad_mid: [
    "irritated", "stuck", "uneasy", "restless", "agitated", "on edge",
    "annoyed", "tense", "short-tempered", "blocked", "unsatisfied",
    "brooding", "friction", "resistant", "unseen",
  ],
  // Bad feel + low energy: depletion, sadness, numbness
  bad_low: [
    "drained", "lonely", "disappointed", "numb", "discouraged", "heavy",
    "hopeless", "sad", "withdrawn", "grieving", "defeated", "empty",
    "not enough", "invisible", "burned out", "shut down",
  ],
  // Neutral feel + high energy: unsettled buzz, anticipation
  neutral_high: [
    "wired", "distracted", "scattered", "unsettled", "anticipating",
    "hyperaware", "buzzing", "can't settle", "overloaded", "alert",
    "ungrounded", "searching", "spinning",
  ],
  // Neutral feel + moderate energy: going through motions
  neutral_mid: [
    "waiting", "autopilot", "indifferent", "routine", "in between", "so-so",
    "fine", "okay", "measured", "holding", "neutral", "composed",
    "just getting by", "floating",
  ],
  // Neutral feel + low energy: flatness, fog
  neutral_low: [
    "flat", "tired", "disconnected", "empty", "meh", "foggy",
    "slow", "zoned out", "passive", "low energy", "checked out",
    "dull", "quiet", "detached",
  ],
  // Good feel + high energy: excitement, momentum
  good_high: [
    "motivated", "connected", "proud", "playful", "confident", "inspired",
    "excited", "alive", "unstoppable", "lit up", "electric", "celebrating",
    "fired up", "in flow", "energized", "thriving",
  ],
  // Good feel + moderate energy: calm confidence, clarity
  good_mid: [
    "steady", "focused", "engaged", "clear", "hopeful", "pleasant",
    "balanced", "grounded", "productive", "secure", "present",
    "open", "flowing", "satisfied",
  ],
  // Good feel + low energy: rest, softness, warmth
  good_low: [
    "peaceful", "relieved", "grateful", "safe", "cozy", "content",
    "settled", "resting", "warm", "soft", "at ease", "melting",
    "unhurried", "accepted", "tender",
  ],
};