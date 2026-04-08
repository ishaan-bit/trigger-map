/**
 * Nourishment Library — structured food/nutrition primitives for the Fuel mode.
 * Each entry is tagged by type (what it is), diet compatibility,
 * cuisine tradition, preparation effort, and emotional-regulation relevance.
 *
 * The LLM composition engine selects from these and composes
 * contextualised nourishment guidance — it does NOT invent foods.
 */

export const FOOD_TYPES = {
  meal:     { id: "meal",     label: "Full Meal",     labelHi: "पूरा भोजन" },
  snack:    { id: "snack",    label: "Snack",         labelHi: "स्नैक" },
  drink:    { id: "drink",    label: "Drink",         labelHi: "पेय" },
  ritual:   { id: "ritual",   label: "Food Ritual",   labelHi: "भोजन रिचुअल" },
};

export const DIETS = {
  vegetarian: { id: "vegetarian", label: "Vegetarian", labelHi: "शाकाहारी" },
  vegan:      { id: "vegan",      label: "Vegan",      labelHi: "वीगन" },
  nonVeg:     { id: "nonVeg",     label: "Non-Veg",    labelHi: "मांसाहारी" },
  glutenFree: { id: "glutenFree", label: "Gluten-Free", labelHi: "ग्लूटेन-फ्री" },
};

export const CUISINES = {
  indian:     { id: "indian",     label: "Indian",      labelHi: "भारतीय" },
  universal:  { id: "universal",  label: "Universal",   labelHi: "सामान्य" },
  japanese:   { id: "japanese",   label: "Japanese",    labelHi: "जापानी" },
  mediterranean: { id: "mediterranean", label: "Mediterranean", labelHi: "भूमध्यसागरीय" },
};

export const PREP_LEVELS = ["none", "minimal", "moderate"];

/**
 * Nourishment primitives — the atomic library.
 * Each entry: id, name, nameHi, description, descriptionHi,
 * type, diet[], cuisine[], prepLevel, emotionTags[],
 * nutrientFocus (what it targets biochemically).
 */
export const NOURISHMENTS = [
  // ── Drinks / Quick ──
  {
    id: "warm_turmeric_milk",
    name: "Warm Turmeric Milk",
    nameHi: "हल्दी दूध",
    description: "Warm milk with turmeric, black pepper, and a pinch of cardamom.",
    descriptionHi: "हल्दी, काली मिर्च और इलायची के साथ गर्म दूध।",
    type: "drink",
    diet: ["vegetarian"],
    cuisine: ["indian"],
    prepLevel: "minimal",
    nutrientFocus: "anti-inflammatory, tryptophan",
    emotionTags: ["anxious", "stressed", "restless", "tired"],
  },
  {
    id: "green_tea",
    name: "Green Tea (no sugar)",
    nameHi: "ग्रीन टी (बिना चीनी)",
    description: "Brewed green tea - L-theanine supports calm focus.",
    descriptionHi: "ग्रीन टी - L-थीनाइन शांत ध्यान में मदद करता है।",
    type: "drink",
    diet: ["vegetarian", "vegan", "glutenFree"],
    cuisine: ["japanese", "universal"],
    prepLevel: "minimal",
    nutrientFocus: "L-theanine, antioxidants",
    emotionTags: ["anxious", "stressed", "overwhelmed", "low"],
  },
  {
    id: "banana_smoothie",
    name: "Banana Smoothie",
    nameHi: "केला स्मूदी",
    description: "Banana, yoghurt, honey. Quick tryptophan and potassium boost.",
    descriptionHi: "केला, दही, शहद। तेज़ ट्रिप्टोफन और पोटैशियम बूस्ट।",
    type: "drink",
    diet: ["vegetarian"],
    cuisine: ["universal"],
    prepLevel: "minimal",
    nutrientFocus: "tryptophan, potassium, B6",
    emotionTags: ["sad", "low", "tired", "stressed"],
  },
  {
    id: "warm_water_lemon",
    name: "Warm Water with Lemon",
    nameHi: "गर्म नींबू पानी",
    description: "Simple warm water with lemon - hydration and gentle digestive reset.",
    descriptionHi: "गर्म पानी में नींबू - हाइड्रेशन और हल्का डाइजेस्टिव रीसेट।",
    type: "drink",
    diet: ["vegetarian", "vegan", "glutenFree"],
    cuisine: ["universal"],
    prepLevel: "none",
    nutrientFocus: "hydration, vitamin C",
    emotionTags: ["tired", "low", "disconnected", "numb"],
  },

  // ── Snacks ──
  {
    id: "trail_mix",
    name: "Trail Mix (nuts + seeds)",
    nameHi: "ट्रेल मिक्स (मेवे + बीज)",
    description: "Almonds, walnuts, pumpkin seeds, dark chocolate chips. Handful.",
    descriptionHi: "बादाम, अखरोट, कद्दू के बीज, डार्क चॉकलेट। मुट्ठी भर।",
    type: "snack",
    diet: ["vegetarian", "vegan", "glutenFree"],
    cuisine: ["universal"],
    prepLevel: "none",
    nutrientFocus: "omega-3, magnesium, zinc",
    emotionTags: ["stressed", "anxious", "low", "tired", "frustrated"],
  },
  {
    id: "dark_chocolate",
    name: "Dark Chocolate (70%+)",
    nameHi: "डार्क चॉकलेट (70%+)",
    description: "2-3 squares of dark chocolate. Flavonoids and magnesium.",
    descriptionHi: "2-3 टुकड़े डार्क चॉकलेट। फ्लेवोनॉइड्स और मैग्नीशियम।",
    type: "snack",
    diet: ["vegetarian", "glutenFree"],
    cuisine: ["universal"],
    prepLevel: "none",
    nutrientFocus: "magnesium, flavonoids, theobromine",
    emotionTags: ["sad", "low", "stressed", "frustrated"],
  },
  {
    id: "roasted_makhana",
    name: "Roasted Makhana",
    nameHi: "भुनी मखाना",
    description: "Fox nuts dry-roasted with ghee and a pinch of salt.",
    descriptionHi: "घी और नमक के साथ भुनी मखाना।",
    type: "snack",
    diet: ["vegetarian", "glutenFree"],
    cuisine: ["indian"],
    prepLevel: "minimal",
    nutrientFocus: "magnesium, low-glycemic, protein",
    emotionTags: ["anxious", "restless", "stressed"],
  },
  {
    id: "curd_rice",
    name: "Curd Rice",
    nameHi: "दही चावल",
    description: "Cool curd rice with curry leaves and mustard tempering.",
    descriptionHi: "करी पत्ते और राई के तड़के के साथ ठंडा दही चावल।",
    type: "snack",
    diet: ["vegetarian"],
    cuisine: ["indian"],
    prepLevel: "minimal",
    nutrientFocus: "probiotics, tryptophan, carbs",
    emotionTags: ["stressed", "overwhelmed", "anxious", "sad"],
  },

  // ── Full Meals ──
  {
    id: "dal_rice_sabzi",
    name: "Dal, Rice & Seasonal Sabzi",
    nameHi: "दाल, चावल और मौसमी सब्ज़ी",
    description: "Simple home-cooked dal with rice and a seasonal vegetable - complete nutrition.",
    descriptionHi: "सादी घर की दाल, चावल और मौसमी सब्ज़ी - संपूर्ण पोषण।",
    type: "meal",
    diet: ["vegetarian", "vegan"],
    cuisine: ["indian"],
    prepLevel: "moderate",
    nutrientFocus: "complete protein, B vitamins, fiber",
    emotionTags: ["sad", "low", "tired", "disconnected", "stressed"],
  },
  {
    id: "oats_porridge",
    name: "Oats Porridge with Fruit",
    nameHi: "फलों के साथ ओट्स दलिया",
    description: "Rolled oats cooked with milk, topped with banana and nuts.",
    descriptionHi: "दूध में पके ओट्स, ऊपर केला और मेवे।",
    type: "meal",
    diet: ["vegetarian"],
    cuisine: ["universal"],
    prepLevel: "minimal",
    nutrientFocus: "beta-glucan, B vitamins, tryptophan",
    emotionTags: ["anxious", "stressed", "low", "tired"],
  },
  {
    id: "grilled_fish_greens",
    name: "Grilled Fish with Greens",
    nameHi: "ग्रिल्ड फिश और हरी सब्ज़ियां",
    description: "Simple grilled fish with a side of steamed or sautéed greens.",
    descriptionHi: "सादी ग्रिल्ड मछली के साथ भाप या तली हरी सब्ज़ियां।",
    type: "meal",
    diet: ["nonVeg", "glutenFree"],
    cuisine: ["universal", "mediterranean"],
    prepLevel: "moderate",
    nutrientFocus: "omega-3, protein, iron, folate",
    emotionTags: ["sad", "low", "stressed", "anxious"],
  },
  {
    id: "khichdi",
    name: "Moong Dal Khichdi",
    nameHi: "मूंग दाल खिचड़ी",
    description: "Soft-cooked rice and moong dal with ghee and cumin tempering.",
    descriptionHi: "घी और जीरे के तड़के के साथ मूंग दाल खिचड़ी।",
    type: "meal",
    diet: ["vegetarian", "glutenFree"],
    cuisine: ["indian"],
    prepLevel: "moderate",
    nutrientFocus: "easily digestible protein, B vitamins",
    emotionTags: ["overwhelmed", "stressed", "tired", "sad"],
  },

  // ── Food Rituals ──
  {
    id: "mindful_eating",
    name: "Mindful Eating Practice",
    nameHi: "माइंडफुल ईटिंग",
    description: "Eat one meal without screens. Chew slowly, notice flavours and texture.",
    descriptionHi: "एक भोजन बिना स्क्रीन के। धीरे चबाएं, स्वाद और बनावट महसूस करें।",
    type: "ritual",
    diet: ["vegetarian", "vegan", "nonVeg", "glutenFree"],
    cuisine: ["universal"],
    prepLevel: "none",
    nutrientFocus: "parasympathetic activation",
    emotionTags: ["stressed", "overwhelmed", "disconnected", "anxious", "numb"],
  },
  {
    id: "chai_ritual",
    name: "Chai Making Ritual",
    nameHi: "चाय बनाने का रिचुअल",
    description: "Make chai from scratch - boil water, add ginger, tea, milk. Focus on the process.",
    descriptionHi: "शुरू से चाय बनाएं - पानी उबालें, अदरक, चाय, दूध डालें। प्रक्रिया पर ध्यान दें।",
    type: "ritual",
    diet: ["vegetarian"],
    cuisine: ["indian"],
    prepLevel: "minimal",
    nutrientFocus: "grounding, routine, warmth",
    emotionTags: ["sad", "lonely", "disconnected", "low", "anxious"],
  },
  {
    id: "cook_for_someone",
    name: "Cook for Someone",
    nameHi: "किसी के लिए खाना बनाएं",
    description: "Cook a simple meal for someone you care about. The act of giving nourishes too.",
    descriptionHi: "किसी अपने के लिए सादा खाना बनाएं। देने की क्रिया भी पोषित करती है।",
    type: "ritual",
    diet: ["vegetarian", "vegan", "nonVeg", "glutenFree"],
    cuisine: ["universal"],
    prepLevel: "moderate",
    nutrientFocus: "social bonding, purpose",
    emotionTags: ["lonely", "sad", "disconnected", "numb", "low"],
  },
];

/**
 * Filter nourishments matching criteria.
 */
export function filterNourishments({ types, diets, cuisines, prepLevel, emotions } = {}) {
  return NOURISHMENTS.filter((n) => {
    if (types?.length && !types.includes(n.type)) return false;
    if (diets?.length && !diets.some((d) => n.diet.includes(d))) return false;
    if (cuisines?.length && !cuisines.some((c) => n.cuisine.includes(c))) return false;
    if (prepLevel && n.prepLevel !== prepLevel) return false;
    if (emotions?.length && !emotions.some((e) => n.emotionTags.includes(e))) return false;
    return true;
  });
}

/**
 * Pick N non-repeating nourishments best matching the given emotional state.
 * Prioritises entries whose emotionTags overlap the most with the input emotions.
 * Excludes items in the `exclude` set (anti-repetition).
 */
export function pickNourishments(emotions, n = 2, { exclude = [], boost = [], diet, cuisine } = {}) {
  const pool = filterNourishments({ emotions, diets: diet ? [diet] : undefined, cuisines: cuisine ? [cuisine] : undefined });
  const excludeSet = new Set(exclude);
  const boostSet = new Set(boost);
  const candidates = pool.filter((item) => !excludeSet.has(item.id));
  if (candidates.length === 0) return pool.slice(0, n);

  // Score by overlap count, boost liked items, then shuffle ties
  const scored = candidates.map((item) => ({
    ...item,
    _score: emotions.filter((e) => item.emotionTags.includes(e)).length
      + (boostSet.has(item.id) ? 1.5 : 0)
      + Math.random() * 0.5,
  }));
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, n);
}
