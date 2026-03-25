/**
 * Progress & Drift Intelligence Engine
 * ─────────────────────────────────────
 * Longitudinal behavioral measurement system.
 *
 * Computes:
 *   - Trajectory:       Where user was → where they are → where they're heading
 *   - Stability trend:  Is emotional stability improving, declining, or flat?
 *   - Recovery trend:   Is recovery after dips getting faster?
 *   - Drift velocity:   Rate of emotional drift change
 *   - Pattern shifts:   Strengthening, weakening, unresolved, new patterns
 *   - Attributions:     What helped, what didn't, what needs attention
 *   - Pilot metrics:    Aggregate validation stats across all users
 *
 * All computations derive from existing daily aggregates (up to 45 days).
 * No new Redis keys — everything is computed at request time.
 */

import { EMOTION_SCORE } from "@triggermap/shared/constants/emotions";

// ── Helpers ──

function dayScore(snapshot) {
  const emotions = snapshot.emotions || {};
  let total = 0;
  let weighted = 0;
  for (const [emotion, count] of Object.entries(emotions)) {
    const n = Number(count || 0);
    total += n;
    weighted += (EMOTION_SCORE[emotion] || 3) * n;
  }
  return total > 0 ? Number((weighted / total).toFixed(2)) : null;
}

function dayVariance(snapshot) {
  const emotions = snapshot.emotions || {};
  const mean = dayScore(snapshot);
  if (mean === null) return null;
  const counts = Object.values(emotions).reduce((s, c) => s + Number(c || 0), 0);
  if (!counts) return null;
  let v = 0;
  for (const [emotion, count] of Object.entries(emotions)) {
    const diff = (EMOTION_SCORE[emotion] || 3) - mean;
    v += diff * diff * Number(count || 0);
  }
  return v / counts;
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
}

function topKey(record) {
  const entries = Object.entries(record || {});
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function scoreToneLabel(score) {
  if (score === null) return null;
  if (score >= 4.2) return "great";
  if (score >= 3.5) return "good";
  if (score >= 2.8) return "mixed";
  if (score >= 2) return "uneasy";
  return "tough";
}

function trendDirection(delta, threshold = 0.05) {
  if (delta > threshold) return "improving";
  if (delta < -threshold) return "declining";
  return "stable";
}

// ── Weekly Binning ──

function splitIntoWeeklyBins(aggregates) {
  const bins = [];
  // Group into 7-day bins from the end (newest)
  for (let end = aggregates.length; end > 0; end -= 7) {
    const start = Math.max(0, end - 7);
    bins.unshift(aggregates.slice(start, end));
  }
  return bins;
}

function computeBinMetrics(bin, baselineScore) {
  const logged = bin.filter((s) => Number(s.total || 0) > 0);
  const moments = bin.reduce((s, a) => s + Number(a.total || 0), 0);
  const triggers = {};
  const emotions = {};
  const pairs = {};

  for (const snap of bin) {
    mergeCounts(triggers, snap.triggers);
    mergeCounts(emotions, snap.emotions);
    mergeCounts(pairs, snap.pairs);
  }

  // Average emotion score for the week
  let totalCount = 0;
  let weightedSum = 0;
  for (const [emotion, count] of Object.entries(emotions)) {
    const n = Number(count || 0);
    totalCount += n;
    weightedSum += (EMOTION_SCORE[emotion] || 3) * n;
  }
  const score = totalCount > 0 ? Number((weightedSum / totalCount).toFixed(2)) : null;

  // Stability: fraction of logged days within ±0.5 of baseline
  let withinBand = 0;
  let scored = 0;
  for (const snap of logged) {
    const s = dayScore(snap);
    if (s === null) continue;
    scored++;
    if (Math.abs(s - baselineScore) <= 0.5) withinBand++;
  }
  const stability = scored >= 2 ? Number((withinBand / scored).toFixed(2)) : null;

  // Volatility: average variance
  const variances = [];
  for (const snap of logged) {
    const v = dayVariance(snap);
    if (v !== null) variances.push(v);
  }
  const volatility =
    variances.length >= 2
      ? Number((variances.reduce((a, b) => a + b, 0) / variances.length).toFixed(2))
      : null;

  // Recovery: count days below baseline-0.4, then days to return within ±0.5
  let recoveryDays = null;
  let inDip = false;
  let dipLen = 0;
  const episodes = [];
  for (const snap of logged) {
    const s = dayScore(snap);
    if (s === null) continue;
    if (s < baselineScore - 0.4) {
      if (!inDip) inDip = true;
      dipLen++;
    } else if (inDip && Math.abs(s - baselineScore) <= 0.5) {
      episodes.push(dipLen);
      inDip = false;
      dipLen = 0;
    } else if (inDip) {
      dipLen++;
    }
  }
  if (episodes.length > 0) {
    recoveryDays = Number(
      (episodes.reduce((a, b) => a + b, 0) / episodes.length).toFixed(1)
    );
  }

  return {
    startDate: bin[0]?.date || null,
    endDate: bin[bin.length - 1]?.date || null,
    score,
    tone: scoreToneLabel(score),
    stability,
    volatility,
    recoveryDays,
    drift: score !== null ? Number((score - baselineScore).toFixed(2)) : null,
    moments,
    daysLogged: logged.length,
    topTrigger: topKey(triggers),
    topEmotion: topKey(emotions),
    triggers,
    emotions,
    pairs,
  };
}

// ── Pattern Shift Detection ──

function computePatternShifts(current, previous) {
  if (!current || !previous) return { strengthening: [], weakening: [], unresolved: [], emerging: [] };

  const currPairs = current.pairs || {};
  const prevPairs = previous.pairs || {};
  const allKeys = new Set([...Object.keys(currPairs), ...Object.keys(prevPairs)]);

  const strengthening = [];
  const weakening = [];
  const unresolved = [];
  const emerging = [];

  for (const key of allKeys) {
    const [trigger, emotion] = key.split("|");
    const currCount = currPairs[key] || 0;
    const prevCount = prevPairs[key] || 0;
    const delta = currCount - prevCount;
    const emotionScore = EMOTION_SCORE[emotion] || 3;
    const isNegative = emotionScore <= 2;

    if (prevCount === 0 && currCount >= 2) {
      emerging.push({ trigger, emotion, count: currCount, isNegative });
    } else if (delta >= 2) {
      (isNegative ? unresolved : strengthening).push({
        trigger,
        emotion,
        count: currCount,
        prevCount,
        delta,
      });
    } else if (delta <= -2) {
      (isNegative ? weakening : weakening).push({
        trigger,
        emotion,
        count: currCount,
        prevCount,
        delta,
      });
    } else if (currCount >= 2 && prevCount >= 2 && Math.abs(delta) <= 1 && isNegative) {
      unresolved.push({
        trigger,
        emotion,
        count: currCount,
        prevCount,
        delta,
      });
    }
  }

  const byDelta = (a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0);
  return {
    strengthening: strengthening.sort(byDelta).slice(0, 3),
    weakening: weakening.sort(byDelta).slice(0, 3),
    unresolved: unresolved.sort((a, b) => b.count - a.count).slice(0, 3),
    emerging: emerging.sort((a, b) => b.count - a.count).slice(0, 3),
  };
}

// ── Attribution ──

function computeAttributions(actionFeedback, currentWeek, previousWeek) {
  const helped = [];
  const notWorking = [];
  const needsAttention = [];

  // From HiTL feedback
  const helpedTriggers = new Set();
  const skippedTriggers = new Set();
  for (const f of actionFeedback) {
    const trigger = f.trigger || f.category || "";
    if (f.response === "tried" || f.response === "helped") helpedTriggers.add(trigger.toLowerCase());
    if (f.response === "skipped" || f.response === "not_helpful") skippedTriggers.add(trigger.toLowerCase());
  }

  // Check if helped triggers correlated with improvement
  if (currentWeek && previousWeek) {
    for (const trigger of helpedTriggers) {
      const currEmotions = {};
      const prevEmotions = {};
      for (const [key, count] of Object.entries(currentWeek.pairs || {})) {
        const [t, e] = key.split("|");
        if (t.toLowerCase() === trigger) currEmotions[e] = (currEmotions[e] || 0) + count;
      }
      for (const [key, count] of Object.entries(previousWeek.pairs || {})) {
        const [t, e] = key.split("|");
        if (t.toLowerCase() === trigger) prevEmotions[e] = (prevEmotions[e] || 0) + count;
      }

      // If trigger's dominant emotion score improved, it helped
      let currScore = 0, currN = 0, prevScore = 0, prevN = 0;
      for (const [e, c] of Object.entries(currEmotions)) { currScore += (EMOTION_SCORE[e] || 3) * c; currN += c; }
      for (const [e, c] of Object.entries(prevEmotions)) { prevScore += (EMOTION_SCORE[e] || 3) * c; prevN += c; }
      const currAvg = currN > 0 ? currScore / currN : null;
      const prevAvg = prevN > 0 ? prevScore / prevN : null;

      if (currAvg !== null && prevAvg !== null && currAvg > prevAvg) {
        helped.push({ trigger, improvement: Number((currAvg - prevAvg).toFixed(1)) });
      }
    }

    // Friction zones that persist
    const currTriggers = currentWeek.triggers || {};
    const prevTriggers = previousWeek.triggers || {};
    for (const [trigger, count] of Object.entries(currTriggers)) {
      if (count < 2) continue;
      // Check if this trigger's paired emotions are negative
      let negCount = 0, totalCount = 0;
      for (const [key, c] of Object.entries(currentWeek.pairs || {})) {
        const [t, e] = key.split("|");
        if (t !== trigger) continue;
        totalCount += c;
        if ((EMOTION_SCORE[e] || 3) <= 2) negCount += c;
      }
      if (totalCount > 0 && negCount / totalCount > 0.6) {
        const prevCount = prevTriggers[trigger] || 0;
        if (skippedTriggers.has(trigger.toLowerCase())) {
          notWorking.push({ trigger, count, note: "feedback indicates current approach not working" });
        } else if (prevCount >= 2) {
          needsAttention.push({ trigger, count, prevCount, note: "recurring negative pattern" });
        }
      }
    }
  }

  return {
    helped: helped.slice(0, 3),
    notWorking: notWorking.slice(0, 3),
    needsAttention: needsAttention.slice(0, 3),
  };
}

// ── Main: Per-User Progress Metrics ──

export function computeProgressMetrics({
  aggregates,
  baselineScore,
  actionFeedback = [],
}) {
  if (!aggregates || aggregates.length < 14) return null; // Need 2+ weeks

  const bins = splitIntoWeeklyBins(aggregates);
  const snapshots = bins.map((bin) => computeBinMetrics(bin, baselineScore));

  // Filter to weeks with actual data
  const activeSnapshots = snapshots.filter((s) => s.moments > 0);
  if (activeSnapshots.length < 2) return null;

  // Label weeks
  activeSnapshots.forEach((s, i) => {
    s.weekLabel = `W${i + 1}`;
    s.weekIndex = i;
  });

  const current = activeSnapshots[activeSnapshots.length - 1];
  const previous = activeSnapshots[activeSnapshots.length - 2];
  const earliest = activeSnapshots[0];

  // Trajectory: past → present → projected
  const change =
    earliest.score !== null && current.score !== null
      ? Number((current.score - earliest.score).toFixed(2))
      : null;

  // Compute linear trend for projection
  const scoredWeeks = activeSnapshots.filter((s) => s.score !== null);
  let projectedDirection = "stable";
  if (scoredWeeks.length >= 3) {
    // Simple least-squares slope on weekly scores
    const n = scoredWeeks.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += scoredWeeks[i].score;
      sumXY += i * scoredWeeks[i].score;
      sumXX += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    projectedDirection = slope > 0.1 ? "improving" : slope < -0.1 ? "declining" : "holding";
  }

  const trajectory = {
    past: {
      score: earliest.score,
      tone: earliest.tone,
      weekLabel: earliest.weekLabel,
      date: earliest.startDate,
    },
    present: {
      score: current.score,
      tone: current.tone,
      weekLabel: current.weekLabel,
      date: current.startDate,
    },
    change,
    direction: change !== null ? trendDirection(change, 0.3) : null,
    projected: projectedDirection,
    weeksTracked: activeSnapshots.length,
  };

  // Core metrics with then→now comparison
  function metricTrend(currVal, prevVal, invertBetter = false) {
    if (currVal === null || prevVal === null) return null;
    const delta = Number((currVal - prevVal).toFixed(2));
    const dir = invertBetter
      ? trendDirection(-delta, 0.05) // lower is better (volatility, recovery)
      : trendDirection(delta, 0.05);
    return { current: currVal, previous: prevVal, delta, trend: dir };
  }

  const metrics = {
    stability: metricTrend(current.stability, previous.stability),
    volatility: metricTrend(current.volatility, previous.volatility, true),
    drift: metricTrend(current.drift, previous.drift),
    recoveryDays: metricTrend(current.recoveryDays, previous.recoveryDays, true),
  };

  // Pattern shifts
  const patternShifts = computePatternShifts(current, previous);

  // Attributions
  const attributions = computeAttributions(actionFeedback, current, previous);

  return {
    trajectory,
    metrics,
    patternShifts,
    attributions,
    weeklySnapshots: activeSnapshots,
    dataQuality: {
      weeksAvailable: activeSnapshots.length,
      totalMoments: activeSnapshots.reduce((s, w) => s + w.moments, 0),
      hasEnoughForProgress: activeSnapshots.filter((s) => s.moments >= 3).length >= 2,
      confidence:
        activeSnapshots.length >= 5
          ? "strong"
          : activeSnapshots.length >= 3
          ? "moderate"
          : "emerging",
    },
  };
}

// ── Pilot Metrics: Aggregate across all users ──

export function computePilotMetrics(userProgressList) {
  const total = userProgressList.length;
  if (!total) {
    return {
      totalUsers: 0,
      usersWithProgress: 0,
      improvement: {},
      stabilization: {},
      recovery: {},
      patternDetection: {},
      funnel: {},
    };
  }

  let improving = 0;
  let declining = 0;
  let stable = 0;
  let stabilizing = 0;
  let fasterRecovery = 0;
  let patternsDetected = 0;
  let strongPatterns = 0;
  let actionsUsed = 0;
  let stabilizedAfterAction = 0;
  let totalStabilityDelta = 0;
  let totalRecoveryDelta = 0;
  let totalDriftDelta = 0;
  let usersWithMetrics = 0;

  for (const up of userProgressList) {
    if (!up.progress) continue;
    const p = up.progress;

    // Trajectory direction
    if (p.trajectory?.direction === "improving") improving++;
    else if (p.trajectory?.direction === "declining") declining++;
    else stable++;

    // Stability trend
    if (p.metrics?.stability?.trend === "improving") stabilizing++;

    // Recovery trend
    if (p.metrics?.recoveryDays?.trend === "improving") fasterRecovery++;

    // Pattern detection
    const shifts = p.patternShifts;
    const hasPatterns =
      (shifts?.strengthening?.length || 0) +
      (shifts?.weakening?.length || 0) +
      (shifts?.unresolved?.length || 0) +
      (shifts?.emerging?.length || 0);
    if (hasPatterns > 0) patternsDetected++;
    if (hasPatterns >= 3) strongPatterns++;

    // Attribution funnel
    if (p.attributions?.helped?.length) actionsUsed++;
    if (p.attributions?.helped?.length && p.metrics?.stability?.trend === "improving") {
      stabilizedAfterAction++;
    }

    // Deltas for averages
    if (p.metrics?.stability?.delta != null) {
      totalStabilityDelta += p.metrics.stability.delta;
      usersWithMetrics++;
    }
    if (p.metrics?.recoveryDays?.delta != null) {
      totalRecoveryDelta += p.metrics.recoveryDays.delta;
    }
    if (p.metrics?.drift?.delta != null) {
      totalDriftDelta += p.metrics.drift.delta;
    }
  }

  const pct = (n) => (total > 0 ? Number(((n / total) * 100).toFixed(1)) : 0);
  const avg = (n) => (usersWithMetrics > 0 ? Number((n / usersWithMetrics).toFixed(2)) : null);

  return {
    totalUsers: total,
    usersWithProgress: userProgressList.filter((u) => u.progress).length,

    improvement: {
      improving: improving,
      declining: declining,
      stable: stable,
      improvingPct: pct(improving),
      decliningPct: pct(declining),
      stablePct: pct(stable),
    },

    stabilization: {
      stabilizing: stabilizing,
      stabilizingPct: pct(stabilizing),
      avgStabilityDelta: avg(totalStabilityDelta),
    },

    recovery: {
      fasterRecovery: fasterRecovery,
      fasterRecoveryPct: pct(fasterRecovery),
      avgRecoveryDelta: avg(totalRecoveryDelta),
    },

    patternDetection: {
      usersWithPatterns: patternsDetected,
      usersWithStrongPatterns: strongPatterns,
      patternDetectionPct: pct(patternsDetected),
      strongPatternPct: pct(strongPatterns),
    },

    funnel: {
      driftDetected: total,
      patternsIdentified: patternsDetected,
      actionsTaken: actionsUsed,
      stabilizedAfterAction: stabilizedAfterAction,
      conversionRate: actionsUsed > 0
        ? Number(((stabilizedAfterAction / actionsUsed) * 100).toFixed(1))
        : 0,
    },

    avgDeltas: {
      stability: avg(totalStabilityDelta),
      recovery: avg(totalRecoveryDelta),
      drift: avg(totalDriftDelta),
    },
  };
}
