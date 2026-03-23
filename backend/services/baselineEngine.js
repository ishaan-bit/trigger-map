/**
 * Baseline & Emotional Drift Engine
 * ──────────────────────────────────
 * Longitudinal emotional state modeling system.
 *
 * Core concepts:
 *   - Personal Baseline:  Rolling weighted average of emotion scores over a
 *                         configurable window (default 30 days). This is the
 *                         user's "normal" emotional center of gravity.
 *
 *   - Emotional Drift:    Deviation of the recent window (7 days) from the
 *                         personal baseline. Positive = trending calmer/
 *                         energized, negative = trending more anxious/frustrated.
 *
 *   - Recovery Latency:   Average number of days to return to baseline after
 *                         a negative deviation episode (score drops below
 *                         baseline by a threshold for 1+ days).
 *
 *   - Stability Score:    Ratio of days within ±0.5 of baseline out of total
 *                         logged days. 1.0 = rock-steady, 0 = never near baseline.
 *
 *   - State of Mind:      Composite function of current drift, recent volatility,
 *                         and recovery trend — mapped to a human-readable label.
 *
 * All computations use the existing daily aggregate snapshots (up to 45 days).
 * No new Redis keys required — everything is derived at report time.
 */

import { EMOTION_SCORE } from "@triggermap/shared/constants/emotions";

// ── Configuration ──

const BASELINE_WINDOW_DAYS = 30;
const RECENT_WINDOW_DAYS = 7;
const DRIFT_THRESHOLD = 0.4; // deviation from baseline to count as "drifting"
const RECOVERY_BAND = 0.5;   // within ±this of baseline = "recovered"
const MIN_BASELINE_DAYS = 5; // need at least this many logged days for a reliable baseline

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
  return total > 0 ? weighted / total : null;
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

// ── Core computations ──

/**
 * Compute the personal emotional baseline from daily aggregates.
 * Uses recency-weighted averaging: more recent days count more.
 *
 * @param {Array} aggregates - daily aggregate snapshots (oldest first)
 * @returns {{ score: number, daysUsed: number, reliable: boolean }}
 */
function computeBaseline(aggregates) {
  const scored = [];
  for (const snap of aggregates) {
    if (Number(snap.total || 0) === 0) continue;
    const s = dayScore(snap);
    if (s !== null) scored.push(s);
  }

  if (scored.length === 0) return { score: 3.0, daysUsed: 0, reliable: false };

  // Recency weighting: index 0 = oldest = weight 1, last = newest = weight N
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < scored.length; i++) {
    const weight = i + 1; // linear recency weight
    weightedSum += scored[i] * weight;
    weightTotal += weight;
  }

  const score = Number((weightedSum / weightTotal).toFixed(3));
  return {
    score,
    daysUsed: scored.length,
    reliable: scored.length >= MIN_BASELINE_DAYS,
  };
}

/**
 * Compute the recent average (last 7 days) for drift comparison.
 */
function computeRecentAverage(aggregates) {
  const recent = aggregates.slice(-RECENT_WINDOW_DAYS);
  const scores = [];
  for (const snap of recent) {
    if (Number(snap.total || 0) === 0) continue;
    const s = dayScore(snap);
    if (s !== null) scores.push(s);
  }
  if (scores.length === 0) return null;
  return Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3));
}

/**
 * Emotional drift: difference between recent average and baseline.
 *   drift > 0  → improving (trending calmer/more energized)
 *   drift < 0  → declining (trending more anxious/frustrated)
 *   drift ≈ 0  → stable
 */
function computeDrift(baseline, recentAvg) {
  if (recentAvg === null || !baseline.reliable) return null;
  return Number((recentAvg - baseline.score).toFixed(3));
}

function driftLabel(drift) {
  if (drift === null) return null;
  if (drift > 0.8) return "significantly improving";
  if (drift > DRIFT_THRESHOLD) return "improving";
  if (drift > 0.15) return "slightly improving";
  if (drift > -0.15) return "stable";
  if (drift > -DRIFT_THRESHOLD) return "slightly declining";
  if (drift > -0.8) return "declining";
  return "significantly declining";
}

/**
 * Stability score: fraction of logged days within RECOVERY_BAND of baseline.
 */
function computeStability(aggregates, baselineScore) {
  let withinBand = 0;
  let totalLogged = 0;
  for (const snap of aggregates) {
    if (Number(snap.total || 0) === 0) continue;
    const s = dayScore(snap);
    if (s === null) continue;
    totalLogged++;
    if (Math.abs(s - baselineScore) <= RECOVERY_BAND) withinBand++;
  }
  if (totalLogged < 3) return null;
  return Number((withinBand / totalLogged).toFixed(2));
}

function stabilityLabel(score) {
  if (score === null) return null;
  if (score >= 0.8) return "very steady";
  if (score >= 0.6) return "mostly steady";
  if (score >= 0.4) return "moderate fluctuation";
  if (score >= 0.2) return "frequent shifts";
  return "highly variable";
}

/**
 * Recovery latency: average days to return to within RECOVERY_BAND after
 * dropping below (baselineScore - DRIFT_THRESHOLD).
 */
function computeRecoveryLatency(aggregates, baselineScore) {
  const episodes = []; // each entry is number of days to recover
  let inDip = false;
  let dipDays = 0;

  for (const snap of aggregates) {
    if (Number(snap.total || 0) === 0) continue;
    const s = dayScore(snap);
    if (s === null) continue;

    if (s < baselineScore - DRIFT_THRESHOLD) {
      // Below baseline threshold — start or continue dip
      if (!inDip) inDip = true;
      dipDays++;
    } else if (inDip && Math.abs(s - baselineScore) <= RECOVERY_BAND) {
      // Recovered — record episode
      episodes.push(dipDays);
      inDip = false;
      dipDays = 0;
    } else if (inDip) {
      dipDays++; // still recovering but not below threshold
    }
  }
  // Don't count unclosed episodes (user hasn't recovered yet)

  if (episodes.length === 0) return null;
  const avg = episodes.reduce((a, b) => a + b, 0) / episodes.length;
  return Number(avg.toFixed(1));
}

function recoveryLabel(latency) {
  if (latency === null) return null;
  if (latency <= 1) return "bounce back quickly";
  if (latency <= 2) return "recover within a couple of days";
  if (latency <= 4) return "take a few days to settle";
  return "take longer to return to baseline";
}

/**
 * State of mind — composite label from drift, stability, and context.
 */
function computeStateOfMind(drift, stability, volatility) {
  if (drift === null) return null;

  // Priority-ordered mapping
  if (drift > DRIFT_THRESHOLD && stability >= 0.6) return "grounded and improving";
  if (drift > DRIFT_THRESHOLD) return "improving with some ups and downs";
  if (drift < -DRIFT_THRESHOLD && stability < 0.4) return "unsettled, worth paying attention";
  if (drift < -DRIFT_THRESHOLD) return "below your usual, a temporary dip";
  if (stability >= 0.7) return "steady, close to your normal";
  if (volatility != null && volatility > 1.2) return "emotionally active, more range than usual";
  return "holding steady with some variation";
}

/**
 * Day-by-day drift timeline: each day's score relative to baseline.
 */
function computeDailyDrift(aggregates, baselineScore) {
  const timeline = [];
  for (const snap of aggregates) {
    if (Number(snap.total || 0) === 0) continue;
    const s = dayScore(snap);
    if (s === null) continue;
    timeline.push({
      date: snap.date,
      score: Number(s.toFixed(2)),
      deviation: Number((s - baselineScore).toFixed(2)),
    });
  }
  return timeline;
}

// ── Public API ──

/**
 * Compute all baseline-derived metrics from daily aggregates.
 *
 * @param {Array} aggregates - daily aggregate snapshots (up to 45 days), oldest first
 * @param {number|null} volatilityScore - from patternEngine (optional, enriches state-of-mind)
 * @returns {Object} baseline metrics
 */
export function computeBaselineMetrics(aggregates, volatilityScore = null) {
  const baseline = computeBaseline(aggregates);
  const recentAverage = computeRecentAverage(aggregates);
  const drift = computeDrift(baseline, recentAverage);
  const stability = computeStability(aggregates, baseline.score);
  const recoveryLatency = computeRecoveryLatency(aggregates, baseline.score);
  const stateOfMind = computeStateOfMind(drift, stability, volatilityScore);
  const dailyDrift = computeDailyDrift(aggregates.slice(-RECENT_WINDOW_DAYS), baseline.score);

  // Previous week comparison (days 8-14 ago)
  let baselineDeltas = null;
  if (aggregates.length >= 14 && drift !== null) {
    const prevWeekSlice = aggregates.slice(-14, -7);
    const prevScores = [];
    for (const snap of prevWeekSlice) {
      if (Number(snap.total || 0) === 0) continue;
      const s = dayScore(snap);
      if (s !== null) prevScores.push(s);
    }
    if (prevScores.length) {
      const prevRecentAvg = prevScores.reduce((a, b) => a + b, 0) / prevScores.length;
      const prevDrift = Number((prevRecentAvg - baseline.score).toFixed(3));
      const prevStab = computeStability(prevWeekSlice, baseline.score);
      baselineDeltas = {
        deltaDrift: Number((drift - prevDrift).toFixed(3)),
        deltaStability: prevStab !== null && stability !== null
          ? Number((stability - prevStab).toFixed(2))
          : null,
        previousDrift: prevDrift,
        previousStability: prevStab,
        previousRecentAverage: Number(prevRecentAvg.toFixed(2)),
      };
    }
  }

  return {
    baseline: {
      score: baseline.score,
      daysUsed: baseline.daysUsed,
      reliable: baseline.reliable,
      label: baseline.score >= 4 ? "generally calm/energized"
        : baseline.score >= 3 ? "balanced"
        : baseline.score >= 2 ? "tends toward tense"
        : "emotionally strained",
    },
    recentAverage: recentAverage !== null ? Number(recentAverage.toFixed(2)) : null,
    drift: drift !== null ? {
      value: drift,
      label: driftLabel(drift),
      direction: drift > 0.15 ? "improving" : drift < -0.15 ? "declining" : "stable",
    } : null,
    stability: stability !== null ? {
      score: stability,
      label: stabilityLabel(stability),
    } : null,
    recoveryLatency: recoveryLatency !== null ? {
      days: recoveryLatency,
      label: recoveryLabel(recoveryLatency),
    } : null,
    stateOfMind,
    dailyDrift,
    baselineDeltas,
  };
}
