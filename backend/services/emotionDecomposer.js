/**
 * Emotion Decomposer — Evoked/Invoked Decomposition + Residue Dynamics
 *
 * Decomposes each logged emotion into:
 *   - Evoked component: attributable to the paired trigger (from historical correlations)
 *   - Invoked component: internally generated residual (evoked subtracted)
 *
 * Also computes emotional residue: carry-over from prior moments within the same day.
 */

import { EMOTION_SCORE } from "@triggermap/shared/constants/emotions";

// Temporal decay factor per hour for residue computation
const RESIDUE_DECAY_PER_HOUR = 0.7;
const RESIDUE_THRESHOLD = 0.5;

/**
 * Compute evoked emotion score for a given trigger, using historical correlations.
 * Evoked = expected emotion score when this trigger appears, based on user history.
 *
 * @param {string} trigger
 * @param {Object} correlations - { trigger: { emotion: count } } from patternEngine
 * @returns {number} expected score (1-5 range), or 3.0 (neutral) if no history
 */
export function computeEvokedScore(trigger, correlations) {
  const triggerCorr = correlations[trigger];
  if (!triggerCorr) return 3.0;

  let total = 0;
  let weighted = 0;
  for (const [emotion, count] of Object.entries(triggerCorr)) {
    const n = Number(count || 0);
    total += n;
    weighted += (EMOTION_SCORE[emotion] || 3) * n;
  }
  return total > 0 ? weighted / total : 3.0;
}

/**
 * Compute invoked (internal) emotion score for a single moment.
 * Invoked = actual score - evoked score.
 *
 * @param {Object} moment - { emotion, trigger }
 * @param {Object} correlations
 * @returns {number} invoked score (positive = feeling better than trigger typically causes)
 */
export function computeInvokedScore(moment, correlations) {
  const actual = EMOTION_SCORE[moment.emotion] || 3;
  const evoked = computeEvokedScore(moment.trigger, correlations);
  return Number((actual - evoked).toFixed(3));
}

/**
 * Compute daily invoked averages from a set of moments grouped by day.
 *
 * @param {Object[]} moments - raw moment objects with { emotion, trigger, timestamp }
 * @param {Object} correlations - from patternEngine report
 * @returns {Object[]} - [{ date, meanInvoked, momentCount }]
 */
export function computeDailyInvoked(moments, correlations) {
  const byDay = {};
  for (const m of moments) {
    const date = new Date(m.timestamp).toISOString().slice(0, 10);
    if (!byDay[date]) byDay[date] = [];
    byDay[date].push(m);
  }

  const result = [];
  for (const [date, dayMoments] of Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))) {
    let sum = 0;
    for (const m of dayMoments) {
      sum += computeInvokedScore(m, correlations);
    }
    result.push({
      date,
      meanInvoked: Number((sum / dayMoments.length).toFixed(3)),
      momentCount: dayMoments.length,
    });
  }
  return result;
}

/**
 * Compute emotional residue for a sequence of moments within a single day.
 * Residue at moment j = sum of (decay^hours * invoked_i) for all i < j.
 *
 * @param {Object[]} moments - sorted by timestamp within one day
 * @param {Object} correlations
 * @returns {Object[]} - [{ moment, residue }] in order
 */
export function computeResidue(moments, correlations) {
  if (moments.length < 2) return moments.map(m => ({ moment: m, residue: 0 }));

  const sorted = [...moments].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const results = [];
  for (let j = 0; j < sorted.length; j++) {
    let residue = 0;
    const tj = new Date(sorted[j].timestamp).getTime();
    for (let i = 0; i < j; i++) {
      const ti = new Date(sorted[i].timestamp).getTime();
      const hoursDiff = (tj - ti) / (1000 * 60 * 60);
      const decay = Math.pow(RESIDUE_DECAY_PER_HOUR, hoursDiff);
      residue += decay * computeInvokedScore(sorted[i], correlations);
    }
    results.push({ moment: sorted[j], residue: Number(residue.toFixed(3)) });
  }
  return results;
}

/**
 * Detect cross-context contamination: which trigger's residue bleeds into others.
 *
 * @param {Object[]} moments - all moments (multi-day)
 * @param {Object} correlations
 * @returns {Object[]} - [{ sourceTrigger, affectedTriggers, avgResidue }]
 */
export function detectContamination(moments, correlations) {
  // Group by day
  const byDay = {};
  for (const m of moments) {
    const date = new Date(m.timestamp).toISOString().slice(0, 10);
    if (!byDay[date]) byDay[date] = [];
    byDay[date].push(m);
  }

  // For each day, compute residue and track which trigger's invoked score leaks
  const contamMap = {}; // sourceTrigger -> { affectedTrigger -> [residueMagnitudes] }

  for (const dayMoments of Object.values(byDay)) {
    if (dayMoments.length < 2) continue;
    const sorted = [...dayMoments].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (let j = 1; j < sorted.length; j++) {
      const tj = new Date(sorted[j].timestamp).getTime();
      for (let i = 0; i < j; i++) {
        if (sorted[i].trigger === sorted[j].trigger) continue;
        const ti = new Date(sorted[i].timestamp).getTime();
        const hoursDiff = (tj - ti) / (1000 * 60 * 60);
        const decay = Math.pow(RESIDUE_DECAY_PER_HOUR, hoursDiff);
        const invoked = computeInvokedScore(sorted[i], correlations);
        const leakage = Math.abs(decay * invoked);

        if (leakage < 0.1) continue;
        const src = sorted[i].trigger;
        const tgt = sorted[j].trigger;
        if (!contamMap[src]) contamMap[src] = {};
        if (!contamMap[src][tgt]) contamMap[src][tgt] = [];
        contamMap[src][tgt].push(leakage);
      }
    }
  }

  const hotspots = [];
  for (const [src, targets] of Object.entries(contamMap)) {
    const affected = [];
    let totalRes = 0;
    let count = 0;
    for (const [tgt, values] of Object.entries(targets)) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      if (avg >= RESIDUE_THRESHOLD) {
        affected.push(tgt);
      }
      totalRes += values.reduce((a, b) => a + b, 0);
      count += values.length;
    }
    if (affected.length > 0) {
      hotspots.push({
        sourceTrigger: src,
        affectedTriggers: affected,
        avgResidue: Number((totalRes / count).toFixed(3)),
      });
    }
  }

  return hotspots.sort((a, b) => b.avgResidue - a.avgResidue);
}
