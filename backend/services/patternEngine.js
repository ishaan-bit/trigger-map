import { EMOTION_SCORE, ENERGY_MAP } from "@triggermap/shared/constants/emotions";

function topEntry(record, fallback = "none") {
  const entries = Object.entries(record).sort((left, right) => right[1] - left[1]);
  return entries[0]?.[0] || fallback;
}

function pairFromKey(pairKey) {
  const [trigger = "none", emotion = "none"] = pairKey.split("|");
  return { trigger, emotion };
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
}

function scoreDistribution(emotions) {
  let total = 0;
  let weighted = 0;

  for (const [emotion, count] of Object.entries(emotions)) {
    const numericCount = Number(count || 0);
    total += numericCount;
    weighted += (EMOTION_SCORE[emotion] || 3) * numericCount;
  }

  return total ? weighted / total : 0;
}

function varianceForDay(emotions) {
  const mean = scoreDistribution(emotions);
  const counts = Object.values(emotions).reduce((sum, count) => sum + Number(count || 0), 0);
  if (!counts) {
    return 0;
  }

  let totalVariance = 0;
  for (const [emotion, count] of Object.entries(emotions)) {
    const diff = (EMOTION_SCORE[emotion] || 3) - mean;
    totalVariance += diff * diff * Number(count || 0);
  }

  return totalVariance / counts;
}

function buildVolatilityChange(trajectory) {
  if (trajectory.length < 2) {
    return "Not enough data yet";
  }

  const first = trajectory[0].score;
  const last = trajectory[trajectory.length - 1].score;
  const delta = last - first;

  if (Math.abs(delta) < 0.25) {
    return "Mostly steady across the week";
  }

  return delta > 0 ? "Settled toward calmer energy" : "Tilted toward higher emotional strain";
}

export function generateWeeklyReport({ aggregates = [], aiInsight = null } = {}) {
  const filledAggregates = aggregates.filter((snapshot) => snapshot && snapshot.date);

  const triggerFrequency = {};
  const emotionFrequency = {};
  const correlations = {};
  const timeOfDayPatterns = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };
  const energyDistribution = {
    steady: 0,
    balanced: 0,
    tense: 0,
    drained: 0,
    uplifted: 0,
  };
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
      if (!correlations[trigger]) {
        correlations[trigger] = {};
      }
      correlations[trigger][emotion] = (correlations[trigger][emotion] || 0) + Number(count || 0);
    }

    weeklyEmotionTrajectory.push({
      date: snapshot.date,
      score: Number(scoreDistribution(snapshot.emotions).toFixed(2)),
      dominantEmotion: topEntry(snapshot.emotions, "neutral"),
    });

    stableDayCandidates.push({
      date: snapshot.date,
      variance: varianceForDay(snapshot.emotions),
      total: Number(snapshot.total || 0),
    });
  }

  const topTrigger = topEntry(triggerFrequency);
  const topEmotion = topEntry(emotionFrequency);
  const topPairKey = topEntry(pairFrequency, "none|none");
  const topPair = {
    ...pairFromKey(topPairKey),
    count: Number(pairFrequency[topPairKey] || 0),
  };
  const strongestCorrelationTrigger = topEntry(
    Object.fromEntries(
      Object.entries(correlations).map(([trigger, emotions]) => [
        trigger,
        Math.max(...Object.values(emotions)),
      ])
    )
  );
  const strongestCorrelationEmotion = strongestCorrelationTrigger === "none"
    ? "none"
    : topEntry(correlations[strongestCorrelationTrigger]);
  const busiestTime = topEntry(timeOfDayPatterns);
  const mostStableDay = stableDayCandidates
    .filter((entry) => entry.total > 0)
    .sort((left, right) => left.variance - right.variance)[0]?.date || "Not enough data yet";
  const volatilityScore = Number(
    (stableDayCandidates.filter((entry) => entry.total > 0).reduce((sum, entry) => sum + entry.variance, 0)
      / Math.max(stableDayCandidates.filter((entry) => entry.total > 0).length, 1)).toFixed(2)
  );
  const volatilityChange = buildVolatilityChange(weeklyEmotionTrajectory);

  const insights = [
    totalMoments
      ? `${topTrigger} showed up most often this week, usually leading to ${topEmotion} moments.`
      : "Log a few moments this week to unlock pattern insights.",
    strongestCorrelationTrigger !== "none"
      ? `${strongestCorrelationTrigger} most often paired with ${strongestCorrelationEmotion}.`
      : "Trigger and emotion correlation will appear after more logs.",
    `${busiestTime} carried the highest emotional activity in the last seven days.`,
    `${topEntry(energyDistribution)} was the dominant energy state across your entries.`,
    mostStableDay !== "Not enough data yet"
      ? `${mostStableDay} looked like your most stable day.`
      : "Your most stable day will appear after a fuller week of data.",
  ];

  return {
    topTrigger,
    topEmotion,
    topPair,
    triggerFrequency,
    emotionFrequency,
    correlations,
    timeOfDayPatterns,
    energyDistribution,
    weeklyEmotionTrajectory,
    volatilityScore,
    volatilityChange,
    mostStableDay,
    dailyAggregates: filledAggregates,
    aiInsight,
    insights,
    totalMoments,
  };
}