import { EMOTION_SCORE, ENERGY_MAP, derivedEmotionLabel } from "@triggermap/shared/constants/emotions";
import { FEATURE_FLAGS } from "@triggermap/shared/constants/flags";
import { computeBaselineMetrics } from "./baselineEngine.js";
import { computeDailyInvoked, computeResidue, detectContamination } from "./emotionDecomposer.js";
import { computeVacuumTrajectory, computeWeeklyMasking, detectFalseRecovery, detectCrashRisk } from "./vacuumStateEngine.js";
import { lintText, triggerLabel, cap } from "../utils/textGrammar.js";

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
// Returns: "too_early" | "low" | "emerging" | "moderate" | "strong" | "stale"
function computeConfidence(totalMoments, daysLogged, { isSilent } = {}) {
  if (isSilent) return "stale";
  if (totalMoments < 3) return "too_early";
  if (totalMoments < MIN_LOGS_FOR_PATTERNS || daysLogged < 2) return "low";
  if (totalMoments < MIN_LOGS_FOR_PAIRINGS || daysLogged < MIN_DAYS_FOR_RHYTHM) return "emerging";
  if (totalMoments < 15 || daysLogged < 5) return "moderate";
  return "strong";
}

// --- Mirror data: compute longitudinal (45d) frequency/classification ---

function computeMirrorData(allAggregates) {
  if (!allAggregates || !allAggregates.length) return null;
  const filled = allAggregates.filter(s => s && s.date && Number(s.total || 0) > 0);
  if (filled.length < 2) return null;

  const triggerFrequency = {};
  const emotionFrequency = {};
  const correlations = {};
  const pairFrequency = {};
  let totalMoments = 0;

  for (const snapshot of filled) {
    totalMoments += Number(snapshot.total || 0);
    mergeCounts(triggerFrequency, snapshot.triggers);
    mergeCounts(emotionFrequency, snapshot.emotions);
    mergeCounts(pairFrequency, snapshot.pairs);
    for (const [pairKey, count] of Object.entries(snapshot.pairs || {})) {
      const { trigger, emotion } = pairFromKey(pairKey);
      if (!correlations[trigger]) correlations[trigger] = {};
      correlations[trigger][emotion] = (correlations[trigger][emotion] || 0) + Number(count || 0);
    }
  }

  const { regulators, frictionZones, pairings } = classifyPairings(correlations);
  const daysLogged = filled.length;

  return {
    triggerFrequency,
    emotionFrequency,
    correlations,
    pairFrequency,
    regulators,
    frictionZones,
    pairings,
    totalMoments,
    daysLogged,
  };
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

// --- Weekly Deltas ---

function computeFrequencyDeltas(current, previous) {
  const allKeys = new Set([...Object.keys(current), ...Object.keys(previous)]);
  const deltas = {};
  for (const key of allKeys) {
    const curr = current[key] || 0;
    const prev = previous[key] || 0;
    if (curr !== prev) {
      deltas[key] = { current: curr, previous: prev, delta: curr - prev };
    }
  }
  return deltas;
}

function computeWeeklyDeltas(currentFreqs, previousAggregates) {
  const prevTriggers = {};
  const prevEmotions = {};
  let prevTotal = 0;

  for (const snap of (previousAggregates || []).filter(s => s && s.date)) {
    prevTotal += Number(snap.total || 0);
    mergeCounts(prevTriggers, snap.triggers);
    mergeCounts(prevEmotions, snap.emotions);
  }

  if (prevTotal === 0) return null;

  return {
    totalMomentsDelta: currentFreqs.totalMoments - prevTotal,
    previousTotal: prevTotal,
    triggerDeltas: computeFrequencyDeltas(currentFreqs.triggerFrequency, prevTriggers),
    emotionDeltas: computeFrequencyDeltas(currentFreqs.emotionFrequency, prevEmotions),
  };
}

function buildChangeHighlights(deltas, report) {
  if (!deltas) return [];
  const highlights = [];

  if (deltas.totalMomentsDelta > 0) {
    highlights.push(`You logged ${deltas.totalMomentsDelta} more moment${deltas.totalMomentsDelta !== 1 ? "s" : ""} than last week.`);
  } else if (deltas.totalMomentsDelta < 0) {
    highlights.push(`You logged ${Math.abs(deltas.totalMomentsDelta)} fewer moment${Math.abs(deltas.totalMomentsDelta) !== 1 ? "s" : ""} than last week.`);
  }

  const triggerDeltas = Object.entries(deltas.triggerDeltas || {}).sort((a, b) => Math.abs(b[1].delta) - Math.abs(a[1].delta));
  if (triggerDeltas.length) {
    const [trigger, d] = triggerDeltas[0];
    if (d.delta > 0) highlights.push(`${cap(triggerLabel(trigger))} appeared ${d.delta} more time${d.delta !== 1 ? "s" : ""} this week.`);
    else if (d.delta < 0) highlights.push(`${cap(triggerLabel(trigger))} dropped by ${Math.abs(d.delta)} compared to last week.`);
  }

  const emotionDeltas = Object.entries(deltas.emotionDeltas || {}).sort((a, b) => Math.abs(b[1].delta) - Math.abs(a[1].delta));
  if (emotionDeltas.length) {
    const [emotion, d] = emotionDeltas[0];
    if (d.delta > 0) highlights.push(`You felt ${emotion} ${d.delta} more time${d.delta !== 1 ? "s" : ""} than last week.`);
    else if (d.delta < 0) highlights.push(`You felt ${emotion} ${Math.abs(d.delta)} fewer time${Math.abs(d.delta) !== 1 ? "s" : ""} than last week.`);
  }

  return highlights.slice(0, 3).map(lintText);
}

// --- Main generator ---

export function generateWeeklyReport({ aggregates = [], allAggregates = null, previousAggregates = null, aiInsight = null, moments = null, silenceWindow = null } = {}) {
  const filledAggregates = aggregates.filter((s) => s && s.date);

  const triggerFrequency = {};
  const emotionFrequency = {};
  const correlations = {};
  const timeOfDayPatterns = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const energyDistribution = { steady: 0, balanced: 0, tense: 0, drained: 0, uplifted: 0 };
  const pairFrequency = {};
  const tagFrequency = {};
  const weeklyEmotionTrajectory = [];
  const stableDayCandidates = [];
  let totalMoments = 0;

  for (const snapshot of filledAggregates) {
    totalMoments += Number(snapshot.total || 0);
    mergeCounts(triggerFrequency, snapshot.triggers);
    mergeCounts(emotionFrequency, snapshot.emotions);
    mergeCounts(pairFrequency, snapshot.pairs);
    mergeCounts(timeOfDayPatterns, snapshot.timeOfDay);
    mergeCounts(tagFrequency, snapshot.tags);

    for (const [emotion, count] of Object.entries(snapshot.emotions || {})) {
      energyDistribution[ENERGY_MAP[emotion] || "balanced"] += Number(count || 0);
    }

    for (const [pairKey, count] of Object.entries(snapshot.pairs || {})) {
      const { trigger, emotion } = pairFromKey(pairKey);
      if (!correlations[trigger]) correlations[trigger] = {};
      correlations[trigger][emotion] = (correlations[trigger][emotion] || 0) + Number(count || 0);
    }

    // Only include days that have actual logged moments in trajectory
    if (Number(snapshot.total || 0) > 0) {
      const score = Number(emotionAvgScore(snapshot.emotions).toFixed(2));
      const tone = score >= 4 ? "positive" : score >= 2.5 ? "mixed" : "negative";
      weeklyEmotionTrajectory.push({
        date: snapshot.date,
        score,
        dominantEmotion: topEntry(snapshot.emotions, "neutral"),
        tone,
      });
    }

    stableDayCandidates.push({
      date: snapshot.date,
      variance: varianceForDay(snapshot.emotions),
      total: Number(snapshot.total || 0),
    });
  }

  // ── Valence/Arousal centroid computation ──
  let vSum = 0, aSum = 0, cCount = 0;
  const dailyCentroids = [];
  for (const snapshot of filledAggregates) {
    const sv = Number(snapshot.valenceSum || 0);
    const sa = Number(snapshot.arousalSum || 0);
    const sc = Number(snapshot.continuousCount || 0);
    if (sc > 0) {
      vSum += sv;
      aSum += sa;
      cCount += sc;
      dailyCentroids.push({
        date: snapshot.date,
        valence: Number((sv / sc).toFixed(3)),
        arousal: Number((sa / sc).toFixed(3)),
        count: sc,
      });
    }
  }
  const weeklyCentroid = cCount > 0
    ? { valence: Number((vSum / cCount).toFixed(3)), arousal: Number((aSum / cCount).toFixed(3)), count: cCount, label: derivedEmotionLabel(vSum / cCount, aSum / cCount) }
    : null;

  // Valence/arousal drift over the week
  let centroidDrift = null;
  if (dailyCentroids.length >= 2) {
    const first = dailyCentroids[0];
    const last = dailyCentroids[dailyCentroids.length - 1];
    centroidDrift = {
      valence: Number((last.valence - first.valence).toFixed(3)),
      arousal: Number((last.arousal - first.arousal).toFixed(3)),
    };
  }

  const daysLogged = filledAggregates.filter((s) => Number(s.total || 0) > 0).length;
  const uniqueTriggers = Object.keys(triggerFrequency).length;
  const uniqueEmotions = Object.keys(emotionFrequency).length;
  const confidence = computeConfidence(totalMoments, daysLogged, { isSilent: !!silenceWindow });

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
  const rawVolatility = validDays.length >= 2
    ? Number((validDays.reduce((sum, e) => sum + e.variance, 0) / validDays.length).toFixed(2))
    : null;
  const volatilityScore = rawVolatility;
  const volatilityLabel = rawVolatility === null ? null
    : rawVolatility < 0.3 ? "steady"
    : rawVolatility < 0.8 ? "mild shifts"
    : rawVolatility < 1.5 ? "moderate swings"
    : "high variability";

  let trajectoryNote = null;
  if (weeklyEmotionTrajectory.length >= MIN_LOGS_FOR_TRAJECTORY) {
    const first = weeklyEmotionTrajectory[0].score;
    const last = weeklyEmotionTrajectory[weeklyEmotionTrajectory.length - 1].score;
    const best = Math.max(...weeklyEmotionTrajectory.map((d) => d.score));
    const worst = Math.min(...weeklyEmotionTrajectory.map((d) => d.score));
    const delta = last - first;
    if (Math.abs(delta) < 0.25 && (best - worst) < 0.5) trajectoryNote = "Emotional tone stayed fairly consistent across the days you logged.";
    else if (Math.abs(delta) < 0.25) trajectoryNote = "Ended the week where you started, but the middle had some shifts.";
    else if (delta > 0.5) trajectoryNote = "Emotional tone improved as the week went on.";
    else if (delta > 0) trajectoryNote = "Slight upward shift in emotional tone over the week.";
    else if (delta < -0.5) trajectoryNote = "Emotional tone dipped as the week progressed.";
    else trajectoryNote = "Slight downward shift in emotional tone over the week.";
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
    ...(silenceWindow && {
      isSilent: true,
      daysSinceLastLog: silenceWindow.daysSinceLastLog,
      lastLogDate: silenceWindow.lastLogDate,
    }),
  };

  // Baseline & drift — uses the extended window if available, else falls back to weekly
  const baselineInput = allAggregates || filledAggregates;
  const baselineMetrics = computeBaselineMetrics(baselineInput, rawVolatility);

  // Weekly deltas — compare this week vs previous week
  const weeklyDeltas = previousAggregates
    ? computeWeeklyDeltas({ totalMoments, triggerFrequency, emotionFrequency }, previousAggregates)
    : null;
  const changeHighlights = buildChangeHighlights(weeklyDeltas, { topTrigger, topEmotion });

  // --- Invoked Metrics (computational behavioral model) ---
  let invokedMetrics = null;
  let compoundPatterns = null;
  const hasCorrelations = Object.keys(correlations).length > 0;
  if (FEATURE_FLAGS.computeInvokedMetrics && moments?.length && hasCorrelations) {
    try {
    const dailyInvoked = computeDailyInvoked(moments, correlations);
    const baselineScore = baselineMetrics?.baseline?.score ?? 3.0;

    // Vacuum trajectory
    const vacuumTrajectory = computeVacuumTrajectory(baselineScore, dailyInvoked);
    const lastVacuum = vacuumTrajectory.length
      ? vacuumTrajectory[vacuumTrajectory.length - 1].vacuum
      : baselineScore;

    // Masking
    const masking = computeWeeklyMasking(filledAggregates, baselineScore);

    // Residue (per-day)
    const byDay = {};
    for (const m of moments) {
      const date = new Date(m.timestamp).toISOString().slice(0, 10);
      if (!byDay[date]) byDay[date] = [];
      byDay[date].push(m);
    }
    const residueHotspots = [];
    for (const [, dayMoments] of Object.entries(byDay)) {
      const res = computeResidue(dayMoments, correlations);
      for (const r of res) {
        if (Math.abs(r.residue) >= 0.5) {
          residueHotspots.push(r);
        }
      }
    }

    // Cross-context contamination
    const contamination = detectContamination(moments, correlations);

    const weeklyInvokedAvg = dailyInvoked.length > 0
      ? Number((dailyInvoked.reduce((s, d) => s + d.meanInvoked, 0) / dailyInvoked.length).toFixed(3))
      : 0;

    invokedMetrics = {
      dailyInvoked,
      weeklyInvokedAvg,
      vacuumTrajectory,
      currentVacuum: lastVacuum,
      vacuumDrift: Number((lastVacuum - baselineScore).toFixed(3)),
      weeklyMasking: masking,
      residueHotspots: residueHotspots.slice(0, 5),
      contamination: contamination.slice(0, 3),
    };

    // Compound pattern detection
    const avgScore = emotionAvgScore(emotionFrequency);
    const stabilityScore = baselineMetrics?.stability?.score ?? null;

    const dayScoresWithVacuum = vacuumTrajectory.map(v => {
      const dayAgg = filledAggregates.find(a => a.date === v.date);
      const score = dayAgg ? emotionAvgScore(dayAgg.emotions || {}) : 3.0;
      return { date: v.date, score, vacuum: v.vacuum, masking: masking.dailyMasking.find(d => d.date === v.date)?.mu || 0 };
    });

    const falseRecovery = detectFalseRecovery(avgScore, baselineScore, lastVacuum, stabilityScore);
    const crashRisk = detectCrashRisk(dayScoresWithVacuum, baselineScore);

    compoundPatterns = {
      falseRecovery,
      crashRisk,
      maskingAlert: masking.alert,
      maskingLevel: masking.level,
      hasContamination: contamination.length > 0,
    };
    } catch (err) {
      console.error("[patternEngine] invokedMetrics computation failed:", err?.message);
    }
  }

  // --- Recurrence detection (v81) ---
  const recurrence = [];
  for (const [pairKey, count] of Object.entries(pairFrequency)) {
    if (count >= 2) {
      const { trigger, emotion } = pairFromKey(pairKey);
      recurrence.push({ trigger, emotion, count, label: count >= 3 ? "recurring" : "emerging" });
    }
  }
  recurrence.sort((a, b) => b.count - a.count);
  const topRecurrence = recurrence.slice(0, 3);

  // --- Streak detection from trajectory (v81) ---
  let positiveStreak = null;
  let negativeStreak = null;
  if (weeklyEmotionTrajectory.length >= 2) {
    let bestPos = { len: 0, start: 0 };
    let bestNeg = { len: 0, start: 0 };
    let curPos = 0, curNeg = 0, posStart = 0, negStart = 0;
    for (let i = 0; i < weeklyEmotionTrajectory.length; i++) {
      const s = weeklyEmotionTrajectory[i].score;
      if (s > 3.5) {
        if (curPos === 0) posStart = i;
        curPos++;
        if (curPos > bestPos.len) bestPos = { len: curPos, start: posStart };
      } else { curPos = 0; }
      if (s < 2.5) {
        if (curNeg === 0) negStart = i;
        curNeg++;
        if (curNeg > bestNeg.len) bestNeg = { len: curNeg, start: negStart };
      } else { curNeg = 0; }
    }
    if (bestPos.len >= 2) positiveStreak = { days: bestPos.len, startDate: weeklyEmotionTrajectory[bestPos.start].date };
    if (bestNeg.len >= 2) negativeStreak = { days: bestNeg.len, startDate: weeklyEmotionTrajectory[bestNeg.start].date };
  }

  // --- Baseline context flags (v81) ---
  const baselineContext = baselineMetrics ? {
    driftDirection: baselineMetrics.drift?.direction || "stable",
    stabilityLevel: baselineMetrics.stability?.label || null,
    recoveryLabel: baselineMetrics.recoveryLatency?.label || null,
  } : null;

  return {
    topTrigger,
    topEmotion,
    tiedTriggers,
    tiedEmotions,
    weeklyCentroid,
    dailyCentroids,
    centroidDrift,
    hasDominantTrigger,
    hasDominantEmotion,
    topPair,
    triggerFrequency,
    emotionFrequency,
    correlations,
    timeOfDayPatterns,
    energyDistribution,
    tagFrequency,
    regulators,
    frictionZones,
    pairings,
    triggerConcentration,
    emotionConcentration,
    mostStableDay,
    volatilityScore,
    volatilityLabel,
    trajectoryNote,
    weeklyEmotionTrajectory,
    busiestTime,
    dataQuality,
    totalMoments,
    dailyAggregates: filledAggregates,
    baselineMetrics,
    weeklyDeltas,
    changeHighlights,
    recurrence: topRecurrence,
    positiveStreak,
    negativeStreak,
    baselineContext,
    invokedMetrics,
    compoundPatterns,
    mirror: computeMirrorData(allAggregates),
    aiInsight,
  };
}
