import { EMOTION_SCORE, ENERGY_MAP } from "@triggermap/shared/constants/emotions";

// --- Confidence thresholds ---
const MIN_LOGS_FOR_PATTERNS = 5;
const MIN_LOGS_FOR_PAIRINGS = 8;
const MIN_PAIR_REPEATS = 2;
const MIN_DAYS_FOR_RHYTHM = 3;
const MIN_LOGS_FOR_TRAJECTORY = 3;
const MIN_LOGS_FOR_STABILITY = 5;

// --- Helpers ---

function pairFromKey(pairKey) {
  const [trigger = "none", emotion = "none"] = pairKey.split("|");
  return { trigger, emotion };
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
}

function sortedEntries(record) {
  return Object.entries(record || {}).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
}

function topEntry(record, fallback = "none") {
  const entries = sortedEntries(record);
  return entries[0]?.[0] || fallback;
}

function topTied(record) {
  const entries = sortedEntries(record);
  if (!entries.length) return [];
  const maxVal = entries[0][1];
  return entries.filter(([, v]) => v === maxVal).map(([k]) => k);
}

function emotionAvgScore(emotions) {
  let total = 0;
  let weighted = 0;
  for (const [emotion, count] of Object.entries(emotions)) {
    const n = Number(count || 0);
    total += n;
    weighted += (EMOTION_SCORE[emotion] || 3) * n;
  }
  return total ? weighted / total : 0;
}

function varianceForDay(emotions) {
  const mean = emotionAvgScore(emotions);
  const counts = Object.values(emotions).reduce((sum, c) => sum + Number(c || 0), 0);
  if (!counts) return 0;
  let v = 0;
  for (const [emotion, count] of Object.entries(emotions)) {
    const diff = (EMOTION_SCORE[emotion] || 3) - mean;
    v += diff * diff * Number(count || 0);
  }
  return v / counts;
}

// --- Confidence model ---
// Returns: "too_early" | "low" | "emerging" | "moderate" | "strong"
function computeConfidence(totalMoments, daysLogged) {
  if (totalMoments < 3) return "too_early";
  if (totalMoments < MIN_LOGS_FOR_PATTERNS || daysLogged < 2) return "low";
  if (totalMoments < MIN_LOGS_FOR_PAIRINGS || daysLogged < MIN_DAYS_FOR_RHYTHM) return "emerging";
  if (totalMoments < 15 || daysLogged < 5) return "moderate";
  return "strong";
}

// --- Regulators & friction detection ---

function classifyPairings(correlations) {
  const regulators = [];
  const frictionZones = [];
  const pairings = [];

  for (const [trigger, emotions] of Object.entries(correlations)) {
    for (const [emotion, count] of Object.entries(emotions)) {
      if (count < MIN_PAIR_REPEATS) continue;
      const score = EMOTION_SCORE[emotion] || 3;
      const entry = { trigger, emotion, count };
      pairings.push(entry);
      if (score >= 4) regulators.push(entry);
      if (score <= 2) frictionZones.push(entry);
    }
  }

  regulators.sort((a, b) => b.count - a.count);
  frictionZones.sort((a, b) => b.count - a.count);
  pairings.sort((a, b) => b.count - a.count);

  return { regulators, frictionZones, pairings };
}

// --- Concentration / diversity (Herfindahl-style) ---

function concentrationIndex(record) {
  const entries = Object.values(record);
  const total = entries.reduce((s, v) => s + v, 0);
  if (!total) return 0;
  let sumSq = 0;
  for (const v of entries) { const share = v / total; sumSq += share * share; }
  return Number(sumSq.toFixed(3));
}

// --- Main generator ---

export function generateWeeklyReport({ aggregates = [], aiInsight = null } = {}) {
  const filledAggregates = aggregates.filter((s) => s && s.date);

  const triggerFrequency = {};
  const emotionFrequency = {};
  const correlations = {};
  const timeOfDayPatterns = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const energyDistribution = { steady: 0, balanced: 0, tense: 0, drained: 0, uplifted: 0 };
  const pairFrequency = {};
  const weeklyEmotionTrajectory = [];
  const stableDayCandidates = [];
  let totalMoments = 0;

  for (const snapshot of filledAggregates) {
    totalMoments += Number(snapshot.total || 0);
    mergeCounts(triggerFrequency, snapshot.triggers);
    mergeCounts(emotionFrequency, snapshot.emotions);
    mergeCounts(pairFrequency, snapshot.pairs);
    mergeCounts(timeOfDayPatterns, snapshot.timeOfDay);

    for (const [emotion, count] of Object.entries(snapshot.emotions || {})) {
      energyDistribution[ENERGY_MAP[emotion] || "balanced"] += Number(count || 0);
    }

    for (const [pairKey, count] of Object.entries(snapshot.pairs || {})) {
      const { trigger, emotion } = pairFromKey(pairKey);
      if (!correlations[trigger]) correlations[trigger] = {};
      correlations[trigger][emotion] = (correlations[trigger][emotion] || 0) + Number(count || 0);
    }

    weeklyEmotionTrajectory.push({
      date: snapshot.date,
      score: Number(emotionAvgScore(snapshot.emotions).toFixed(2)),
      dominantEmotion: topEntry(snapshot.emotions, "neutral"),
    });

    stableDayCandidates.push({
      date: snapshot.date,
      variance: varianceForDay(snapshot.emotions),
      total: Number(snapshot.total || 0),
    });
  }

  const daysLogged = filledAggregates.filter((s) => Number(s.total || 0) > 0).length;
  const uniqueTriggers = Object.keys(triggerFrequency).length;
  const uniqueEmotions = Object.keys(emotionFrequency).length;
  const confidence = computeConfidence(totalMoments, daysLogged);

  const tiedTriggers = topTied(triggerFrequency);
  const tiedEmotions = topTied(emotionFrequency);
  const hasDominantTrigger = tiedTriggers.length === 1;
  const hasDominantEmotion = tiedEmotions.length === 1;
  const topTrigger = hasDominantTrigger ? tiedTriggers[0] : null;
  const topEmotion = hasDominantEmotion ? tiedEmotions[0] : null;

  const topPairKey = topEntry(pairFrequency, "none|none");
  const topPair = { ...pairFromKey(topPairKey), count: Number(pairFrequency[topPairKey] || 0) };

  const { regulators, frictionZones, pairings } = classifyPairings(correlations);

  const busiestTime = daysLogged >= MIN_DAYS_FOR_RHYTHM ? topEntry(timeOfDayPatterns) : null;

  const triggerConcentration = concentrationIndex(triggerFrequency);
  const emotionConcentration = concentrationIndex(emotionFrequency);

  const validDays = stableDayCandidates.filter((e) => e.total > 0);
  const mostStableDay = validDays.length >= 2
    ? validDays.sort((a, b) => a.variance - b.variance)[0]?.date || null
    : null;
  const volatilityScore = validDays.length >= 2
    ? Number((validDays.reduce((sum, e) => sum + e.variance, 0) / validDays.length).toFixed(2))
    : null;

  let trajectoryNote = null;
  if (weeklyEmotionTrajectory.length >= MIN_LOGS_FOR_TRAJECTORY) {
    const first = weeklyEmotionTrajectory[0].score;
    const last = weeklyEmotionTrajectory[weeklyEmotionTrajectory.length - 1].score;
    const delta = last - first;
    if (Math.abs(delta) < 0.25) trajectoryNote = "Mostly steady across the days you logged.";
    else if (delta > 0) trajectoryNote = "Emotional tone shifted toward calmer energy over the week.";
    else trajectoryNote = "Emotional tone shifted toward more strain over the week.";
  }

  // --- Prediction accuracy ("gut check") ---
  let predictionAccuracy = null;
  const daysWithPrediction = filledAggregates.filter((s) => s.prediction && Number(s.total || 0) > 0);
  if (daysWithPrediction.length >= 2) {
    let correct = 0;
    for (const day of daysWithPrediction) {
      const dominantEmotion = topEntry(day.emotions, "neutral");
      if (day.prediction === dominantEmotion) correct++;
    }
    predictionAccuracy = {
      daysCompared: daysWithPrediction.length,
      correct,
      rate: Number((correct / daysWithPrediction.length).toFixed(2)),
    };
  }

  const dataQuality = {
    totalMoments,
    daysLogged,
    uniqueTriggers,
    uniqueEmotions,
    confidence,
    hasEnoughForPairings: totalMoments >= MIN_LOGS_FOR_PAIRINGS,
    hasEnoughForRhythm: daysLogged >= MIN_DAYS_FOR_RHYTHM,
    hasEnoughForTrajectory: weeklyEmotionTrajectory.length >= MIN_LOGS_FOR_TRAJECTORY,
    hasEnoughForStability: totalMoments >= MIN_LOGS_FOR_STABILITY && validDays.length >= 2,
  };

  return {
    topTrigger,
    topEmotion,
    tiedTriggers,
    tiedEmotions,
    hasDominantTrigger,
    hasDominantEmotion,
    topPair,
    triggerFrequency,
    emotionFrequency,
    correlations,
    timeOfDayPatterns,
    energyDistribution,
    regulators,
    frictionZones,
    pairings,
    triggerConcentration,
    emotionConcentration,
    mostStableDay,
    volatilityScore,
    trajectoryNote,
    predictionAccuracy,
    weeklyEmotionTrajectory,
    busiestTime,
    dataQuality,
    totalMoments,
    dailyAggregates: filledAggregates,
    aiInsight,
  };
}
