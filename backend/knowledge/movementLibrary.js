/**
 * Movement Library — structured exercise primitives for the Move mode.
 * Each entry is tagged by mechanism (what it does physiologically),
 * environment (where it can be done), equipment needs, intensity,
 * and emotional-regulation relevance.
 *
 * The LLM composition engine uses these as structured inputs —
 * it does NOT invent exercises; it selects from and composes around these.
 */

export const MECHANISMS = {
  vagalTone:     { id: "vagalTone",     label: "Vagal Tone",      labelHi: "वेगल टोन" },
  cortisol:      { id: "cortisol",      label: "Cortisol Flush",  labelHi: "कॉर्टिसोल फ्लश" },
  endorphin:     { id: "endorphin",     label: "Endorphin Release", labelHi: "एंडॉर्फिन रिलीज़" },
  grounding:     { id: "grounding",     label: "Grounding",       labelHi: "ग्राउंडिंग" },
  proprioception:{ id: "proprioception", label: "Proprioception", labelHi: "प्रोप्रियोसेप्शन" },
  breathwork:    { id: "breathwork",    label: "Breathwork",      labelHi: "श्वास क्रिया" },
};

export const ENVIRONMENTS = {
  indoor:  { id: "indoor",  label: "Indoor",  labelHi: "घर के अंदर" },
  outdoor: { id: "outdoor", label: "Outdoor", labelHi: "बाहर" },
  office:  { id: "office",  label: "Office",  labelHi: "ऑफिस" },
  travel:  { id: "travel",  label: "Travel",  labelHi: "यात्रा" },
};

export const EQUIPMENT = {
  none:    { id: "none",    label: "No Equipment",   labelHi: "बिना उपकरण" },
  minimal: { id: "minimal", label: "Minimal",        labelHi: "कम उपकरण" },
  gym:     { id: "gym",     label: "Gym Equipment",  labelHi: "जिम उपकरण" },
};

export const INTENSITY_LEVELS = ["low", "moderate", "high"];

/**
 * Movement primitives — the atomic library.
 * Each entry must have: id, name, nameHi, mechanism[], environment[], equipment, intensity,
 * durationMin (minutes), emotionTags (which emotions this helps regulate).
 */
export const MOVEMENTS = [
  // ── Breathwork ──
  {
    id: "box_breathing",
    name: "Box Breathing",
    nameHi: "बॉक्स ब्रीथिंग",
    description: "Inhale 4s, hold 4s, exhale 4s, hold 4s. Repeat 4-6 cycles.",
    descriptionHi: "4 सेकंड सांस लें, 4 सेकंड रोकें, 4 सेकंड छोड़ें, 4 सेकंड रोकें। 4-6 बार दोहराएं।",
    mechanism: ["vagalTone", "breathwork"],
    environment: ["indoor", "outdoor", "office", "travel"],
    equipment: "none",
    intensity: "low",
    durationMin: 3,
    emotionTags: ["anxious", "stressed", "overwhelmed", "restless"],
  },
  {
    id: "physiological_sigh",
    name: "Physiological Sigh",
    nameHi: "फिजियोलॉजिकल साई",
    description: "Double inhale through nose, long exhale through mouth. 5 cycles.",
    descriptionHi: "नाक से दो बार सांस लें, मुंह से लंबी सांस छोड़ें। 5 बार दोहराएं।",
    mechanism: ["vagalTone", "breathwork"],
    environment: ["indoor", "outdoor", "office", "travel"],
    equipment: "none",
    intensity: "low",
    durationMin: 2,
    emotionTags: ["anxious", "stressed", "panicky", "angry"],
  },
  {
    id: "extended_exhale",
    name: "Extended Exhale Breathing",
    nameHi: "लंबी सांस छोड़ना",
    description: "Inhale 4s, exhale 8s. Focus on the exhale. 8-10 cycles.",
    descriptionHi: "4 सेकंड सांस लें, 8 सेकंड छोड़ें। छोड़ने पर ध्यान दें। 8-10 बार।",
    mechanism: ["vagalTone", "breathwork"],
    environment: ["indoor", "outdoor", "office", "travel"],
    equipment: "none",
    intensity: "low",
    durationMin: 3,
    emotionTags: ["anxious", "stressed", "restless", "angry"],
  },

  // ── Grounding / Low Intensity ──
  {
    id: "barefoot_walk",
    name: "Barefoot Walking",
    nameHi: "नंगे पैर चलना",
    description: "Walk slowly on grass or earth, feeling each step deliberately.",
    descriptionHi: "घास या ज़मीन पर धीरे-धीरे चलें, हर कदम को महसूस करें।",
    mechanism: ["grounding", "proprioception"],
    environment: ["outdoor"],
    equipment: "none",
    intensity: "low",
    durationMin: 10,
    emotionTags: ["disconnected", "numb", "overwhelmed", "anxious"],
  },
  {
    id: "body_scan_stretch",
    name: "Body Scan Stretch",
    nameHi: "बॉडी स्कैन स्ट्रेच",
    description: "Slow head-to-toe stretch, pausing to notice tension in each area.",
    descriptionHi: "सिर से पैर तक धीरे स्ट्रेच करें, हर हिस्से में तनाव नोटिस करें।",
    mechanism: ["grounding", "proprioception"],
    environment: ["indoor", "office"],
    equipment: "none",
    intensity: "low",
    durationMin: 8,
    emotionTags: ["stressed", "tense", "disconnected", "tired"],
  },
  {
    id: "cold_water_face",
    name: "Cold Water Face Immersion",
    nameHi: "ठंडे पानी से चेहरा भिगोना",
    description: "Splash cold water on face or hold cold cloth on forehead for 30s.",
    descriptionHi: "चेहरे पर ठंडा पानी मारें या माथे पर ठंडा कपड़ा 30 सेकंड रखें।",
    mechanism: ["vagalTone"],
    environment: ["indoor", "office"],
    equipment: "none",
    intensity: "low",
    durationMin: 1,
    emotionTags: ["panicky", "anxious", "overwhelmed", "angry"],
  },

  // ── Moderate Movement ──
  {
    id: "brisk_walk",
    name: "Brisk Walk",
    nameHi: "तेज़ चाल",
    description: "Walk at a pace where conversation becomes slightly difficult. 15-20 min.",
    descriptionHi: "इतनी तेज़ चलें कि बात करना थोड़ा मुश्किल हो। 15-20 मिनट।",
    mechanism: ["cortisol", "endorphin"],
    environment: ["outdoor", "indoor"],
    equipment: "none",
    intensity: "moderate",
    durationMin: 15,
    emotionTags: ["stressed", "sad", "low", "restless", "frustrated"],
  },
  {
    id: "yoga_flow",
    name: "Yoga Flow",
    nameHi: "योग फ्लो",
    description: "Sun salutation or vinyasa flow - 5 to 8 rounds at your own pace.",
    descriptionHi: "सूर्य नमस्कार या विन्यास फ्लो - 5 से 8 राउंड अपनी गति से।",
    mechanism: ["grounding", "proprioception", "breathwork"],
    environment: ["indoor", "outdoor"],
    equipment: "minimal",
    intensity: "moderate",
    durationMin: 15,
    emotionTags: ["anxious", "stressed", "tense", "disconnected", "low"],
  },
  {
    id: "dance_movement",
    name: "Free Dance",
    nameHi: "फ्री डांस",
    description: "Put on music and move freely - no choreography, just expression.",
    descriptionHi: "म्यूज़िक लगाएं और बस मूव करें - कोई स्टेप नहीं, बस एक्सप्रेशन।",
    mechanism: ["endorphin", "cortisol"],
    environment: ["indoor"],
    equipment: "none",
    intensity: "moderate",
    durationMin: 10,
    emotionTags: ["sad", "low", "stuck", "frustrated", "numb"],
  },
  {
    id: "jumping_jacks",
    name: "Jumping Jacks",
    nameHi: "जंपिंग जैक",
    description: "3 sets of 20 with 30s rest between. Quick cortisol flush.",
    descriptionHi: "30 सेकंड आराम के साथ 20-20 के 3 सेट। तेज़ कॉर्टिसोल फ्लश।",
    mechanism: ["cortisol", "endorphin"],
    environment: ["indoor", "outdoor", "office"],
    equipment: "none",
    intensity: "moderate",
    durationMin: 5,
    emotionTags: ["stressed", "restless", "angry", "frustrated"],
  },

  // ── High Intensity ──
  {
    id: "sprint_intervals",
    name: "Sprint Intervals",
    nameHi: "स्प्रिंट इंटरवल",
    description: "Sprint 20s, walk 40s. Repeat 6-8 times.",
    descriptionHi: "20 सेकंड स्प्रिंट, 40 सेकंड वॉक। 6-8 बार दोहराएं।",
    mechanism: ["cortisol", "endorphin"],
    environment: ["outdoor"],
    equipment: "none",
    intensity: "high",
    durationMin: 10,
    emotionTags: ["angry", "frustrated", "restless", "stressed"],
  },
  {
    id: "heavy_bag_work",
    name: "Heavy Bag Work",
    nameHi: "हेवी बैग वर्क",
    description: "3 rounds of 2 min on the bag with 1 min rest.",
    descriptionHi: "1 मिनट आराम के साथ 2-2 मिनट के 3 राउंड बैग पर।",
    mechanism: ["cortisol", "endorphin"],
    environment: ["indoor"],
    equipment: "gym",
    intensity: "high",
    durationMin: 10,
    emotionTags: ["angry", "frustrated", "overwhelmed"],
  },
  {
    id: "burpees",
    name: "Burpees",
    nameHi: "बर्पीज़",
    description: "3 sets of 8-10 with 45s rest. Full-body cortisol dump.",
    descriptionHi: "45 सेकंड आराम के साथ 8-10 के 3 सेट। पूरे शरीर का कॉर्टिसोल डंप।",
    mechanism: ["cortisol", "endorphin"],
    environment: ["indoor", "outdoor"],
    equipment: "none",
    intensity: "high",
    durationMin: 8,
    emotionTags: ["stressed", "angry", "frustrated", "restless"],
  },

  // ── Proprioceptive / Somatic ──
  {
    id: "wall_push",
    name: "Wall Push Isometrics",
    nameHi: "दीवार इसोमेट्रिक्स",
    description: "Push against a wall with both hands for 30s. Release. Repeat 5 times.",
    descriptionHi: "दोनों हाथों से दीवार को 30 सेकंड धक्का दें। छोड़ें। 5 बार दोहराएं।",
    mechanism: ["proprioception", "grounding"],
    environment: ["indoor", "office"],
    equipment: "none",
    intensity: "low",
    durationMin: 3,
    emotionTags: ["anxious", "overwhelmed", "panicky", "tense"],
  },
  {
    id: "shake_it_off",
    name: "Shake It Off",
    nameHi: "शेक इट ऑफ",
    description: "Stand and shake your whole body vigorously for 60-90 seconds.",
    descriptionHi: "खड़े होकर पूरे शरीर को 60-90 सेकंड तक ज़ोर से हिलाएं।",
    mechanism: ["cortisol", "proprioception"],
    environment: ["indoor", "outdoor", "office"],
    equipment: "none",
    intensity: "low",
    durationMin: 2,
    emotionTags: ["stressed", "tense", "stuck", "numb", "frustrated"],
  },
];

/**
 * Resolve movements matching a set of filters.
 * Returns a subset of MOVEMENTS that match ALL specified criteria.
 */
export function filterMovements({ mechanisms, environments, equipment, intensity, emotions } = {}) {
  return MOVEMENTS.filter((m) => {
    if (mechanisms?.length && !mechanisms.some((mech) => m.mechanism.includes(mech))) return false;
    if (environments?.length && !environments.some((env) => m.environment.includes(env))) return false;
    if (equipment && m.equipment !== equipment) return false;
    if (intensity && m.intensity !== intensity) return false;
    if (emotions?.length && !emotions.some((e) => m.emotionTags.includes(e))) return false;
    return true;
  });
}

/**
 * Pick N non-repeating movements best matching the given emotional state.
 * Prioritises entries whose emotionTags overlap the most with the input emotions.
 * Excludes items in the `exclude` set (anti-repetition).
 */
export function pickMovements(emotions, n = 2, { exclude = [], environment, equipment: equip } = {}) {
  const pool = filterMovements({ emotions, environments: environment ? [environment] : undefined, equipment: equip });
  const excludeSet = new Set(exclude);
  const candidates = pool.filter((m) => !excludeSet.has(m.id));
  if (candidates.length === 0) return pool.slice(0, n);

  // Score by overlap count, then shuffle ties
  const scored = candidates.map((m) => ({
    ...m,
    _score: emotions.filter((e) => m.emotionTags.includes(e)).length + Math.random() * 0.5,
  }));
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, n);
}
