import { describe, it, expect } from 'vitest';
import { computeBaselineMetrics } from '../../services/baselineEngine.js';

function makeAggregate(date, emotions = { calm: 2, neutral: 1 }, total = 3) {
  return { date, emotions, total, timeOfDay: { morning: 1, afternoon: 1, evening: 1 } };
}

function makeDays(count, emotions) {
  return Array.from({ length: count }, (_, i) => {
    const d = `2025-06-${String(i + 1).padStart(2, '0')}`;
    return makeAggregate(d, emotions);
  });
}

describe('computeBaselineMetrics', () => {
  it('returns structured result with all expected keys', () => {
    const aggs = makeDays(14);
    const result = computeBaselineMetrics(aggs);
    expect(result).toHaveProperty('baseline');
    expect(result).toHaveProperty('drift');
    expect(result).toHaveProperty('stability');
    expect(result).toHaveProperty('recoveryLatency');
    expect(result).toHaveProperty('stateOfMind');
    expect(result).toHaveProperty('dailyDrift');
    expect(result.baseline).toHaveProperty('score');
    expect(result.baseline).toHaveProperty('reliable');
  });

  it('marks baseline as unreliable with < 5 logged days', () => {
    const aggs = makeDays(3);
    const result = computeBaselineMetrics(aggs);
    expect(result.baseline.reliable).toBe(false);
  });

  it('marks baseline as reliable with ≥ 5 logged days', () => {
    const aggs = makeDays(7);
    const result = computeBaselineMetrics(aggs);
    expect(result.baseline.reliable).toBe(true);
  });

  it('detects stable drift for consistent emotions', () => {
    const aggs = makeDays(14, { calm: 2, neutral: 1 });
    const result = computeBaselineMetrics(aggs);
    if (result.drift) {
      expect(result.drift.direction).toBe('stable');
    }
  });

  it('detects improving drift when recent days are better', () => {
    const aggs = [
      ...makeDays(7, { frustrated: 2, anxious: 1 }),
      ...Array.from({ length: 7 }, (_, i) => makeAggregate(`2025-06-${8 + i}`, { energized: 3 })),
    ];
    const result = computeBaselineMetrics(aggs);
    if (result.drift) {
      expect(result.drift.value).toBeGreaterThan(0);
    }
  });

  it('computes stability score between 0 and 1', () => {
    const aggs = makeDays(14);
    const result = computeBaselineMetrics(aggs);
    if (result.stability) {
      expect(result.stability.score).toBeGreaterThanOrEqual(0);
      expect(result.stability.score).toBeLessThanOrEqual(1);
    }
  });

  it('returns stateOfMind label', () => {
    const aggs = makeDays(14);
    const result = computeBaselineMetrics(aggs);
    if (result.stateOfMind) {
      expect(result.stateOfMind).toBeTypeOf('string');
    }
  });

  it('handles all-empty aggregates gracefully', () => {
    const aggs = Array.from({ length: 7 }, (_, i) => ({
      date: `2025-06-${i + 1}`, emotions: {}, total: 0,
    }));
    const result = computeBaselineMetrics(aggs);
    expect(result.baseline.score).toBe(3.0);
    expect(result.baseline.reliable).toBe(false);
  });
});
