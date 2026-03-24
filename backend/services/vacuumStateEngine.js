/**
 * Vacuum State Engine — Emotional Ground Truth + Masking Detection
 *
 * Core concepts:
 *   - Vacuum State: The user's emotional ground truth when trigger influence
 *     is analytically removed. V(d) = B + smoothed(invoked_avg).
 *
 *   - Masking Coefficient: Divergence between reported emotional stability
 *     and behavioral instability signals (logging frequency, intra-day variance,
 *     time-of-day shifts).
 *
 *   - False Recovery: Surface scores return to baseline but vacuum state
 *     remains depressed and stability is low.
 *
 *   - Crash Risk: Sustained positive surface with declining vacuum + masking.
 *
 * All computations use existing daily aggregate snapshots + moment data.
 */

import { EMOTION_SCORE } from "@triggermap/shared/constants/emotions";

// ── Configuration ──

const VACUUM_SMOOTHING = 0.3;        // alpha: how fast vacuum tracks invoked changes
const MASKING_FREQ_WEIGHT = 0.4;     // w1: logging frequency deviation weight
const MASKING_VARIANCE_WEIGHT = 0.4; // w2: intra-day variance weight
const MASKING_TIME_WEIGHT = 0.2;     // w3: time-of-day shift weight
const MASKING_SENSITIVITY = 1.0;     // lambda: reported-drift scaling
const MASKING_THRESHOLD = 0.3;       // mu threshold for alert
const MASKING_ALERT_DAYS = 2;        // consecutive days above threshold for alert
const FALSE_RECOVERY_DRIFT = 0.3;    // surface within this of baseline
const FALSE_RECOVERY_VACUUM = 0.4;   // vacuum must be this far below baseline
const FALSE_RECOVERY_STABILITY = 0.4;// stability must be below this
const CRASH_RISK_SURFACE = 3.5;      // surface must be above this
const CRASH_RISK_MASKING = 0.2;      // avg masking must exceed this
const CRASH_RISK_DAYS = 3;           // minimum consecutive days

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
  if (mean === null) return 0;
  const counts = Object.values(emotions).reduce((s, c) => s + Number(c || 0), 0);
  if (!counts) return 0;
  let v = 0;
  for (const [emotion, count] of Object.entries(emotions)) {
    const diff = (EMOTION_SCORE[emotion] || 3) - mean;
    v += diff * diff * Number(count || 0);
  }
  return v / counts;
}

function timeDistribution(snapshot) {
  const times = snapshot.timeOfDay || {};
  const total = Object.values(times).reduce((s, v) => s + Number(v || 0), 0);
  if (!total) return { morning: 0.25, afternoon: 0.25, evening: 0.25, night: 0.25 };
  return {
    morning: Number(times.morning || 0) / total,
    afternoon: Number(times.afternoon || 0) / total,
    evening: Number(times.evening || 0) / total,
    night: Number(times.night || 0) / total,
  };
}

function klDivergence(p, q) {
  let kl = 0;
  for (const key of Object.keys(p)) {
    const pk = Math.max(p[key], 0.01);
    const qk = Math.max(q[key] || 0.01, 0.01);
    kl += pk * Math.log(pk / qk);
  }
  return Math.max(0, kl);
}

// ── Vacuum State Computation ──

/**
 * Compute vacuum state: B + alpha * invoked_avg + (1 - alpha) * (prevVacuum - B)
 *
 * @param {number} baseline - personalized baseline score
 * @param {number} invokedAvg - mean invoked score for current period
 * @param {number|null} prevVacuum - previous vacuum state (null if first computation)
 * @param {number} [alpha] - smoothing parameter
 * @returns {number} vacuum state score
 */
export function computeVacuumState(baseline, invokedAvg, prevVacuum, alpha = VACUUM_SMOOTHING) {
  if (prevVacuum === null || prevVacuum === undefined) {
    return Number((baseline + invokedAvg).toFixed(3));
  }
  const smoothed = alpha * invokedAvg + (1 - alpha) * (prevVacuum - baseline);
  return Number((baseline + smoothed).toFixed(3));
}

/**
 * Compute vacuum trajectory from daily invoked averages.
 *
 * @param {number} baseline
 * @param {Object[]} dailyInvoked - [{ date, meanInvoked }] sorted by date
 * @returns {Object[]} - [{ date, vacuum }]
 */
export function computeVacuumTrajectory(baseline, dailyInvoked) {
  const trajectory = [];
  let prevVacuum = null;

  for (const day of dailyInvoked) {
    const vacuum = computeVacuumState(baseline, day.meanInvoked, prevVacuum);
    trajectory.push({ date: day.date, vacuum });
    prevVacuum = vacuum;
  }
  return trajectory;
}

// ── Masking Coefficient ──

/**
 * Compute behavioral instability index for a single day.
 *
 * @param {Object} snapshot - daily aggregate
 * @param {number} avgDailyMoments - user's average daily logging count
 * @param {Object} avgTimeDist - user's average time-of-day distribution
 * @returns {number} behavioral instability beta(d)
 */
export function computeBehavioralInstability(snapshot, avgDailyMoments, avgTimeDist) {
  const total = Number(snapshot.total || 0);
  if (total === 0) return 0;

  // Logging frequency deviation (normalized)
  const freqDev = avgDailyMoments > 0
    ? Math.abs(total - avgDailyMoments) / avgDailyMoments
    : 0;
  const normFreq = Math.min(freqDev, 2.0); // cap at 2x deviation

  // Intra-day variance (already 0-based, normalize to ~0-1 range)
  const variance = dayVariance(snapshot);
  const normVariance = Math.min(variance / 2.0, 1.0);

  // Time-of-day shift (KL divergence from user's average distribution)
  const todayDist = timeDistribution(snapshot);
  const timeShift = klDivergence(todayDist, avgTimeDist);
  const normTimeShift = Math.min(timeShift / 1.0, 1.0);

  return Number((
    MASKING_FREQ_WEIGHT * normFreq +
    MASKING_VARIANCE_WEIGHT * normVariance +
    MASKING_TIME_WEIGHT * normTimeShift
  ).toFixed(3));
}

/**
 * Compute masking coefficient for a single day.
 * mu(d) = max(0, beta(d) - lambda * |s(d) - B|)
 *
 * @param {number} beta - behavioral instability
 * @param {number} score - daily emotion score
 * @param {number} baseline - personalized baseline
 * @returns {number} masking coefficient (>= 0)
 */
export function computeMaskingCoefficient(beta, score, baseline) {
  const reportedDrift = Math.abs(score - baseline);
  return Number(Math.max(0, beta - MASKING_SENSITIVITY * reportedDrift).toFixed(3));
}

/**
 * Compute masking metrics for a weekly period.
 *
 * @param {Object[]} aggregates - daily aggregate snapshots (7 days)
 * @param {number} baseline - personalized baseline score
 * @returns {{ coefficient: number, alert: boolean, dailyMasking: Object[] }}
 */
export function computeWeeklyMasking(aggregates, baseline) {
  const logged = aggregates.filter(s => Number(s.total || 0) > 0);
  if (logged.length < 2) return { coefficient: 0, alert: false, level: "none", dailyMasking: [] };

  // Compute user averages for normalization
  const avgDailyMoments = logged.reduce((s, snap) => s + Number(snap.total || 0), 0) / logged.length;

  // Average time distribution across all days
  const avgTimeDist = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const snap of logged) {
    const dist = timeDistribution(snap);
    for (const k of Object.keys(avgTimeDist)) {
      avgTimeDist[k] += dist[k] / logged.length;
    }
  }

  const dailyMasking = [];
  for (const snap of logged) {
    const score = dayScore(snap);
    if (score === null) continue;
    const beta = computeBehavioralInstability(snap, avgDailyMoments, avgTimeDist);
    const mu = computeMaskingCoefficient(beta, score, baseline);
    dailyMasking.push({ date: snap.date, beta, mu, score });
  }

  // Average masking coefficient
  const avgMu = dailyMasking.length > 0
    ? dailyMasking.reduce((s, d) => s + d.mu, 0) / dailyMasking.length
    : 0;

  // Alert: consecutive days above threshold
  let maxConsec = 0;
  let consec = 0;
  for (const d of dailyMasking) {
    if (d.mu > MASKING_THRESHOLD) {
      consec++;
      maxConsec = Math.max(maxConsec, consec);
    } else {
      consec = 0;
    }
  }
  const alert = maxConsec >= MASKING_ALERT_DAYS;

  // Level classification
  let level;
  if (avgMu < 0.05) level = "none";
  else if (avgMu < 0.15) level = "low";
  else if (avgMu < 0.3) level = "moderate";
  else level = "high";

  return {
    coefficient: Number(avgMu.toFixed(3)),
    alert,
    level,
    dailyMasking,
  };
}

// ── Compound Pattern Detectors ──

/**
 * Detect false recovery: surface scores near baseline but vacuum depressed + low stability.
 *
 * @param {number} surfaceScore - recent average emotion score
 * @param {number} baseline
 * @param {number} vacuumState
 * @param {number} stability - stability score (0-1)
 * @returns {boolean}
 */
export function detectFalseRecovery(surfaceScore, baseline, vacuumState, stability) {
  if (stability === null || stability === undefined) return false;
  return (
    Math.abs(surfaceScore - baseline) < FALSE_RECOVERY_DRIFT &&
    vacuumState < baseline - FALSE_RECOVERY_VACUUM &&
    stability < FALSE_RECOVERY_STABILITY
  );
}

/**
 * Detect crash risk: sustained positive surface + declining vacuum + elevated masking.
 *
 * @param {Object[]} recentDays - [{ score, vacuum, masking }] for last N days
 * @param {number} baseline
 * @returns {boolean}
 */
export function detectCrashRisk(recentDays, baseline) {
  if (recentDays.length < CRASH_RISK_DAYS) return false;
  const tail = recentDays.slice(-CRASH_RISK_DAYS);

  const allPositive = tail.every(d => d.score > CRASH_RISK_SURFACE);
  const vacuumDeclining = tail.every(d => d.vacuum < baseline);
  const avgMasking = tail.reduce((s, d) => s + (d.masking || 0), 0) / tail.length;

  return allPositive && vacuumDeclining && avgMasking > CRASH_RISK_MASKING;
}
