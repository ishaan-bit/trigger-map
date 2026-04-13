import { describe, it, expect } from 'vitest';
import {
  computeVacuumState,
  computeVacuumTrajectory,
  computeBehavioralInstability,
  computeMaskingCoefficient,
  computeWeeklyMasking,
  detectFalseRecovery,
  detectCrashRisk,
} from '../../services/vacuumStateEngine.js';

// ── computeVacuumState ──────────────────────────────────────────────────────

describe('computeVacuumState', () => {
  it('returns baseline + invoked when no previous vacuum', () => {
    const result = computeVacuumState(3.0, 0.5, null);
    expect(result).toBe(3.5);
  });

  it('smooths toward invoked with alpha', () => {
    const result = computeVacuumState(3.0, 0.5, 3.2, 0.3);
    // smoothed = 0.3 * 0.5 + 0.7 * (3.2 - 3.0) = 0.15 + 0.14 = 0.29
    // vacuum = 3.0 + 0.29 = 3.29
    expect(result).toBeCloseTo(3.29, 2);
  });

  it('returns baseline when invoked is 0 and vacuum equals baseline', () => {
    const result = computeVacuumState(3.0, 0, 3.0);
    expect(result).toBe(3.0);
  });
});

// ── computeVacuumTrajectory ─────────────────────────────────────────────────

describe('computeVacuumTrajectory', () => {
  it('computes trajectory across multiple days', () => {
    const dailyInvoked = [
      { date: '2025-06-01', meanInvoked: 0.5 },
      { date: '2025-06-02', meanInvoked: -0.3 },
      { date: '2025-06-03', meanInvoked: 0.1 },
    ];
    const result = computeVacuumTrajectory(3.0, dailyInvoked);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2025-06-01');
    expect(result[0].vacuum).toBeCloseTo(3.5, 1);
  });

  it('returns empty for empty input', () => {
    expect(computeVacuumTrajectory(3.0, [])).toEqual([]);
  });
});

// ── computeBehavioralInstability ────────────────────────────────────────────

describe('computeBehavioralInstability', () => {
  it('returns 0 for empty snapshot', () => {
    expect(computeBehavioralInstability({ total: 0 }, 3, {})).toBe(0);
  });

  it('returns higher instability for frequency deviation', () => {
    const snapshot = { total: 6, emotions: { anxious: 3, calm: 3 }, timeOfDay: { morning: 3, evening: 3 } };
    const avgDist = { morning: 0.25, afternoon: 0.25, evening: 0.25, night: 0.25 };
    const normal = computeBehavioralInstability({ total: 3, emotions: { calm: 3 }, timeOfDay: { morning: 3 } }, 3, avgDist);
    const deviated = computeBehavioralInstability(snapshot, 3, avgDist);
    expect(deviated).toBeGreaterThan(normal);
  });
});

// ── computeMaskingCoefficient ───────────────────────────────────────────────

describe('computeMaskingCoefficient', () => {
  it('returns 0 when reported drift exceeds instability', () => {
    // beta = 0.2, reported drift = abs(4.0 - 3.0) = 1.0, mu = max(0, 0.2 - 1.0) = 0
    expect(computeMaskingCoefficient(0.2, 4.0, 3.0)).toBe(0);
  });

  it('returns positive when instability exceeds reported drift', () => {
    // beta = 0.5, reported drift = abs(3.1 - 3.0) = 0.1, mu = max(0, 0.5 - 0.1) = 0.4
    expect(computeMaskingCoefficient(0.5, 3.1, 3.0)).toBeCloseTo(0.4, 2);
  });

  it('never returns negative', () => {
    expect(computeMaskingCoefficient(0, 5, 1)).toBeGreaterThanOrEqual(0);
  });
});

// ── computeWeeklyMasking ────────────────────────────────────────────────────

describe('computeWeeklyMasking', () => {
  it('returns none for insufficient data', () => {
    const result = computeWeeklyMasking([{ total: 2, emotions: { calm: 2 } }], 3.0);
    expect(result.level).toBe('none');
  });

  it('returns structured result with coefficient and level', () => {
    const aggregates = Array.from({ length: 7 }, (_, i) => ({
      date: `2025-06-0${i + 1}`,
      total: 3,
      emotions: { calm: 1, neutral: 1, anxious: 1 },
      timeOfDay: { morning: 1, afternoon: 1, evening: 1 },
    }));
    const result = computeWeeklyMasking(aggregates, 3.0);
    expect(result).toHaveProperty('coefficient');
    expect(result).toHaveProperty('alert');
    expect(result).toHaveProperty('level');
    expect(['none', 'low', 'moderate', 'high']).toContain(result.level);
  });
});

// ── detectFalseRecovery ─────────────────────────────────────────────────────

describe('detectFalseRecovery', () => {
  it('detects false recovery: surface near baseline but vacuum depressed', () => {
    expect(detectFalseRecovery(3.0, 3.0, 2.3, 0.2)).toBe(true);
  });

  it('returns false when vacuum is near baseline', () => {
    expect(detectFalseRecovery(3.0, 3.0, 2.8, 0.2)).toBe(false);
  });

  it('returns false when stability is high', () => {
    expect(detectFalseRecovery(3.0, 3.0, 2.3, 0.8)).toBe(false);
  });

  it('returns false when surface far from baseline', () => {
    expect(detectFalseRecovery(1.5, 3.0, 2.3, 0.2)).toBe(false);
  });

  it('returns false for null stability', () => {
    expect(detectFalseRecovery(3.0, 3.0, 2.3, null)).toBe(false);
  });
});

// ── detectCrashRisk ─────────────────────────────────────────────────────────

describe('detectCrashRisk', () => {
  it('detects crash risk: positive surface + declining vacuum + masking', () => {
    const days = [
      { score: 4.0, vacuum: 2.5, masking: 0.4 },
      { score: 4.2, vacuum: 2.3, masking: 0.3 },
      { score: 3.8, vacuum: 2.1, masking: 0.5 },
    ];
    expect(detectCrashRisk(days, 3.0)).toBe(true);
  });

  it('returns false with insufficient days', () => {
    expect(detectCrashRisk([{ score: 4.0, vacuum: 2.5, masking: 0.4 }], 3.0)).toBe(false);
  });

  it('returns false when surface is low', () => {
    const days = [
      { score: 2.0, vacuum: 2.5, masking: 0.4 },
      { score: 2.2, vacuum: 2.3, masking: 0.3 },
      { score: 2.1, vacuum: 2.1, masking: 0.5 },
    ];
    expect(detectCrashRisk(days, 3.0)).toBe(false);
  });

  it('returns false when masking is low', () => {
    const days = [
      { score: 4.0, vacuum: 2.5, masking: 0.05 },
      { score: 4.2, vacuum: 2.3, masking: 0.05 },
      { score: 3.8, vacuum: 2.1, masking: 0.05 },
    ];
    expect(detectCrashRisk(days, 3.0)).toBe(false);
  });
});
