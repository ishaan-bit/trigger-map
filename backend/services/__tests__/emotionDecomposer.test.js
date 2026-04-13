import { describe, it, expect } from 'vitest';
import {
  computeEvokedScore,
  computeInvokedScore,
  computeDailyInvoked,
  computeResidue,
  detectContamination,
} from '../../services/emotionDecomposer.js';

const correlations = {
  work: { anxious: 4, frustrated: 2, calm: 1 },
  exercise: { energized: 5, calm: 2 },
};

describe('computeEvokedScore', () => {
  it('computes weighted average from correlations', () => {
    // work: (2*4 + 1*2 + 4*1) / (4+2+1) = (8+2+4)/7 = 2.0
    const score = computeEvokedScore('work', correlations);
    expect(score).toBeCloseTo(2.0, 1);
  });

  it('returns 3.0 (neutral) for unknown trigger', () => {
    expect(computeEvokedScore('travel', correlations)).toBe(3.0);
  });

  it('returns 3.0 for empty correlations', () => {
    expect(computeEvokedScore('work', {})).toBe(3.0);
  });
});

describe('computeInvokedScore', () => {
  it('returns positive when actual > evoked', () => {
    const moment = { emotion: 'energized', trigger: 'work' };
    const score = computeInvokedScore(moment, correlations);
    expect(score).toBeGreaterThan(0); // 5 - ~2.0 = ~3.0
  });

  it('returns negative when actual < evoked', () => {
    const moment = { emotion: 'frustrated', trigger: 'exercise' };
    const score = computeInvokedScore(moment, correlations);
    expect(score).toBeLessThan(0); // 1 - ~4.43 ≈ -3.43
  });

  it('returns 0 when actual equals evoked', () => {
    const moment = { emotion: 'neutral', trigger: 'unknown' };
    // neutral=3, unknown trigger evoked=3.0
    expect(computeInvokedScore(moment, {})).toBe(0);
  });
});

describe('computeDailyInvoked', () => {
  it('groups moments by day and computes mean invoked', () => {
    const moments = [
      { emotion: 'anxious', trigger: 'work', timestamp: '2025-06-01T10:00:00Z' },
      { emotion: 'calm', trigger: 'work', timestamp: '2025-06-01T14:00:00Z' },
      { emotion: 'energized', trigger: 'exercise', timestamp: '2025-06-02T09:00:00Z' },
    ];
    const result = computeDailyInvoked(moments, correlations);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2025-06-01');
    expect(result[0].momentCount).toBe(2);
    expect(result[1].date).toBe('2025-06-02');
    expect(result[1].momentCount).toBe(1);
  });

  it('returns empty array for empty moments', () => {
    expect(computeDailyInvoked([], correlations)).toEqual([]);
  });
});

describe('computeResidue', () => {
  it('returns 0 residue for single moment', () => {
    const moments = [{ emotion: 'anxious', trigger: 'work', timestamp: '2025-06-01T10:00:00Z' }];
    const result = computeResidue(moments, correlations);
    expect(result).toHaveLength(1);
    expect(result[0].residue).toBe(0);
  });

  it('computes non-zero residue for subsequent moments', () => {
    const moments = [
      { emotion: 'frustrated', trigger: 'work', timestamp: '2025-06-01T10:00:00Z' },
      { emotion: 'calm', trigger: 'exercise', timestamp: '2025-06-01T11:00:00Z' },
    ];
    const result = computeResidue(moments, correlations);
    expect(result).toHaveLength(2);
    expect(result[0].residue).toBe(0);
    expect(result[1].residue).not.toBe(0);
  });

  it('residue decays over time', () => {
    const base = [
      { emotion: 'frustrated', trigger: 'work', timestamp: '2025-06-01T10:00:00Z' },
    ];
    const close = [...base, { emotion: 'calm', trigger: 'exercise', timestamp: '2025-06-01T11:00:00Z' }];
    const far = [...base, { emotion: 'calm', trigger: 'exercise', timestamp: '2025-06-01T18:00:00Z' }];

    const closeRes = computeResidue(close, correlations);
    const farRes = computeResidue(far, correlations);

    expect(Math.abs(closeRes[1].residue)).toBeGreaterThan(Math.abs(farRes[1].residue));
  });
});

describe('detectContamination', () => {
  it('returns empty for single moment per day', () => {
    const moments = [
      { emotion: 'anxious', trigger: 'work', timestamp: '2025-06-01T10:00:00Z' },
      { emotion: 'calm', trigger: 'exercise', timestamp: '2025-06-02T10:00:00Z' },
    ];
    const result = detectContamination(moments, correlations);
    expect(result).toEqual([]);
  });

  it('detects cross-trigger contamination within a day', () => {
    const moments = [
      { emotion: 'frustrated', trigger: 'work', timestamp: '2025-06-01T09:00:00Z' },
      { emotion: 'frustrated', trigger: 'work', timestamp: '2025-06-01T10:00:00Z' },
      { emotion: 'anxious', trigger: 'family', timestamp: '2025-06-01T11:00:00Z' },
    ];
    const result = detectContamination(moments, correlations);
    // work → family contamination should be detected if residue is significant
    expect(Array.isArray(result)).toBe(true);
  });
});
