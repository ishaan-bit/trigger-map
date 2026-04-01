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

  // ── Additional — Breathwork ──
  { id: "alternate_nostril", name: "Alternate Nostril Breathing", nameHi: "अनुलोम विलोम", description: "Close right nostril, inhale left. Close left, exhale right. Alternate for 5 minutes.", descriptionHi: "दायां नथुना बंद करें, बाएं से सांस लें। बायां बंद, दायें से छोड़ें। 5 मिनट।", mechanism: ["vagalTone", "breathwork"], environment: ["indoor", "office", "travel"], equipment: "none", intensity: "low", durationMin: 5, emotionTags: ["anxious", "stressed", "restless", "overwhelmed"] },
  { id: "wim_hof_light", name: "Wim Hof Lite", nameHi: "विम हॉफ लाइट", description: "30 deep breaths, exhale hold 30s, recovery breath 15s. 3 rounds.", descriptionHi: "30 गहरी सांसें, सांस छोड़कर 30 सेकंड रोकें, रिकवरी 15 सेकंड। 3 राउंड।", mechanism: ["breathwork", "endorphin"], environment: ["indoor"], equipment: "none", intensity: "moderate", durationMin: 10, emotionTags: ["low", "numb", "tired", "disconnected"] },

  // ── Additional — Grounding ──
  { id: "progressive_relaxation", name: "Progressive Muscle Relaxation", nameHi: "प्रोग्रेसिव मसल रिलैक्सेशन", description: "Tense each muscle group 5s then release. Work from feet to face.", descriptionHi: "हर मांसपेशी समूह को 5 सेकंड कसें फिर छोड़ें। पैरों से चेहरे तक।", mechanism: ["grounding", "vagalTone"], environment: ["indoor", "office", "travel"], equipment: "none", intensity: "low", durationMin: 12, emotionTags: ["anxious", "tense", "stressed", "restless"] },
  { id: "gentle_neck_rolls", name: "Gentle Neck & Shoulder Rolls", nameHi: "गर्दन और कंधे घुमाना", description: "Slow neck circles and shoulder rolls. 10 each direction.", descriptionHi: "धीरे गर्दन और कंधे घुमाएं। हर दिशा में 10 बार।", mechanism: ["grounding", "proprioception"], environment: ["indoor", "office", "travel"], equipment: "none", intensity: "low", durationMin: 3, emotionTags: ["tense", "stressed", "tired"] },
  { id: "foam_roller", name: "Foam Roller Release", nameHi: "फोम रोलर रिलीज़", description: "Roll out calves, quads, back, hips for 10 min. Slow pressure.", descriptionHi: "पिंडलियों, जांघों, पीठ, कूल्हों को 10 मिनट रोल करें।", mechanism: ["proprioception", "grounding"], environment: ["indoor"], equipment: "minimal", intensity: "low", durationMin: 10, emotionTags: ["tense", "stressed", "tired", "restless"] },
  { id: "balance_stand", name: "Single-Leg Balance", nameHi: "एक पैर पर संतुलन", description: "Stand on one leg, eyes open. 30s each side. Repeat 3 times.", descriptionHi: "एक पैर पर खड़े रहें, आंखें खुली। हर तरफ 30 सेकंड। 3 बार।", mechanism: ["proprioception", "grounding"], environment: ["indoor", "office", "outdoor"], equipment: "none", intensity: "low", durationMin: 4, emotionTags: ["anxious", "overwhelmed", "disconnected"] },

  // ── Additional — Moderate ──
  { id: "stair_climb", name: "Stair Climbing", nameHi: "सीढ़ियां चढ़ना", description: "Find a staircase, climb for 5 minutes at moderate pace.", descriptionHi: "सीढ़ी खोजें, 5 मिनट मध्यम गति से चढ़ें।", mechanism: ["cortisol", "endorphin"], environment: ["indoor", "office"], equipment: "none", intensity: "moderate", durationMin: 5, emotionTags: ["stressed", "restless", "frustrated", "angry"] },
  { id: "tai_chi_basics", name: "Tai Chi Basics", nameHi: "ताई ची बेसिक्स", description: "Slow, flowing movements - cloud hands, wave hands like clouds. 10 min.", descriptionHi: "धीमी, बहती गतिविधियां - क्लाउड हैंड्स। 10 मिनट।", mechanism: ["grounding", "breathwork", "proprioception"], environment: ["indoor", "outdoor"], equipment: "none", intensity: "moderate", durationMin: 10, emotionTags: ["anxious", "stressed", "tense", "overwhelmed"] },
  { id: "cycling_easy", name: "Easy Cycling", nameHi: "आसान साइकिलिंग", description: "Cycle at a comfortable pace for 15-20 minutes.", descriptionHi: "15-20 मिनट आरामदायक गति से साइकिलिंग।", mechanism: ["cortisol", "endorphin"], environment: ["outdoor"], equipment: "minimal", intensity: "moderate", durationMin: 15, emotionTags: ["stressed", "restless", "frustrated", "sad"] },
  { id: "swimming_easy", name: "Easy Swimming", nameHi: "आसान तैराकी", description: "Swim at a gentle pace for 15-20 minutes. Focus on breath rhythm.", descriptionHi: "15-20 मिनट धीमी गति से तैरें। सांस की लय पर ध्यान दें।", mechanism: ["cortisol", "endorphin", "breathwork"], environment: ["indoor"], equipment: "gym", intensity: "moderate", durationMin: 15, emotionTags: ["anxious", "stressed", "tense", "overwhelmed", "sad"] },
  { id: "resistance_band", name: "Resistance Band Flow", nameHi: "रेज़िस्टेंस बैंड फ्लो", description: "Upper-body pull-aparts and squats with band. 3 rounds of 10.", descriptionHi: "बैंड के साथ ऊपरी शरीर पुल-अपार्ट और स्क्वैट्स। 10-10 के 3 राउंड।", mechanism: ["proprioception", "cortisol"], environment: ["indoor", "office"], equipment: "minimal", intensity: "moderate", durationMin: 8, emotionTags: ["tense", "restless", "stressed", "frustrated"] },

  // ── Additional — High Intensity ──
  { id: "kettlebell_swings", name: "Kettlebell Swings", nameHi: "केटलबेल स्विंग", description: "3 sets of 15. Focus on hip hinge and explosive extension.", descriptionHi: "15-15 के 3 सेट। हिप हिंज और विस्फोटक एक्सटेंशन पर ध्यान दें।", mechanism: ["cortisol", "endorphin"], environment: ["indoor"], equipment: "gym", intensity: "high", durationMin: 8, emotionTags: ["angry", "frustrated", "restless", "stressed"] },
  { id: "battle_ropes", name: "Battle Ropes", nameHi: "बैटल रोप्स", description: "30s all-out, 30s rest. 6-8 rounds.", descriptionHi: "30 सेकंड पूरी ताकत, 30 सेकंड आराम। 6-8 राउंड।", mechanism: ["cortisol", "endorphin"], environment: ["indoor"], equipment: "gym", intensity: "high", durationMin: 8, emotionTags: ["angry", "frustrated", "stressed", "restless"] },
  { id: "mountain_climbers", name: "Mountain Climbers", nameHi: "माउंटेन क्लाइंबर्स", description: "3 sets of 20 reps. Quick, explosive movement.", descriptionHi: "20-20 रेप्स के 3 सेट। तेज़, विस्फोटक गतिविधि।", mechanism: ["cortisol", "endorphin"], environment: ["indoor", "outdoor"], equipment: "none", intensity: "high", durationMin: 6, emotionTags: ["restless", "frustrated", "angry", "stressed"] },

  // ── Additional — Walking / Flexibility ──
  { id: "nature_walk", name: "Nature Walk", nameHi: "प्रकृति में चलना", description: "Walk in a park or natural setting for 20 min. Notice sights, sounds, smells.", descriptionHi: "पार्क या प्रकृति में 20 मिनट चलें। दृश्य, ध्वनि, गंध नोटिस करें।", mechanism: ["grounding", "cortisol"], environment: ["outdoor"], equipment: "none", intensity: "low", durationMin: 20, emotionTags: ["stressed", "sad", "overwhelmed", "disconnected", "low"] },
  { id: "walking_meditation", name: "Walking Meditation", nameHi: "चलती ध्यान", description: "Walk extremely slowly. Focus on lifting, moving, placing each foot.", descriptionHi: "बहुत धीरे चलें। हर कदम उठाने, हिलाने, रखने पर ध्यान दें।", mechanism: ["grounding", "breathwork"], environment: ["indoor", "outdoor"], equipment: "none", intensity: "low", durationMin: 10, emotionTags: ["anxious", "overwhelmed", "restless", "disconnected"] },
  { id: "hip_opener_flow", name: "Hip Opener Flow", nameHi: "हिप ओपनर फ्लो", description: "Pigeon pose, lizard pose, frog stretch. Hold each 60s.", descriptionHi: "कबूतर पोज़, छिपकली पोज़, मेंढक स्ट्रेच। हरेक 60 सेकंड।", mechanism: ["grounding", "proprioception"], environment: ["indoor"], equipment: "minimal", intensity: "low", durationMin: 10, emotionTags: ["tense", "stressed", "anxious", "restless"] },
  { id: "spinal_twist_series", name: "Spinal Twist Series", nameHi: "स्पाइनल ट्विस्ट सीरीज़", description: "Seated and supine twists. Hold 30s each side.", descriptionHi: "बैठकर और लेटकर ट्विस्ट। हर तरफ 30 सेकंड।", mechanism: ["grounding", "proprioception"], environment: ["indoor", "office"], equipment: "none", intensity: "low", durationMin: 6, emotionTags: ["tense", "tired", "stressed"] },
];

/**
 * Resolve movements matching a set of filters.
 * Returns a subset of MOVEMENTS that match ALL specified criteria.
 */
export function filterMovements({ mechanisms, environments, equipment, intensity, emotions, maxDuration } = {}) {
  return MOVEMENTS.filter((m) => {
    if (mechanisms?.length && !mechanisms.some((mech) => m.mechanism.includes(mech))) return false;
    if (environments?.length && !environments.some((env) => m.environment.includes(env))) return false;
    if (equipment && m.equipment !== equipment) return false;
    if (intensity && m.intensity !== intensity) return false;
    if (emotions?.length && !emotions.some((e) => m.emotionTags.includes(e))) return false;
    if (maxDuration && m.durationMin > maxDuration) return false;
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
