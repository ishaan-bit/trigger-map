import { describe, it, expect } from 'vitest';
import { buildSignalProfile, buildSignalConstraints } from '../signalProfile.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal report with defaults to make individual field testing easy */
function makeReport(overrides = {}) {
  return {
    volatilityScore: 0.2,
    baselineMetrics: { drift: { value: 0 } },
    frictionZones: [],
    regulators: [],
    topEmotion: 'neutral',
    weeklyEmotionTrajectory: [],
    emotionFrequency: { neutral: 3, calm: 2, anxious: 1 },
    invokedMetrics: null,
    compoundPatterns: null,
    weeklyCentroid: null,
    centroidDrift: null,
    ...overrides,
  };
}

// ── buildSignalProfile ──────────────────────────────────────────────────────

describe('buildSignalProfile', () => {
  // Volatility classification
  describe('volatility', () => {
    it('classifies low volatility (< 0.3)', () => {
      expect(buildSignalProfile(makeReport({ volatilityScore: 0.1 })).volatility).toBe('low');
    });

    it('classifies moderate volatility (0.3 – 0.8)', () => {
      expect(buildSignalProfile(makeReport({ volatilityScore: 0.5 })).volatility).toBe('moderate');
    });

    it('classifies high volatility (≥ 0.8)', () => {
      expect(buildSignalProfile(makeReport({ volatilityScore: 0.9 })).volatility).toBe('high');
    });

    it('classifies null volatility as low', () => {
      expect(buildSignalProfile(makeReport({ volatilityScore: null })).volatility).toBe('low');
    });
  });

  // Drift classification
  describe('drift', () => {
    it('classifies positive drift', () => {
      const r = makeReport({ baselineMetrics: { drift: { value: 0.3 } } });
      expect(buildSignalProfile(r).drift).toBe('positive');
    });

    it('classifies neutral drift', () => {
      const r = makeReport({ baselineMetrics: { drift: { value: 0 } } });
      expect(buildSignalProfile(r).drift).toBe('neutral');
    });

    it('classifies slight negative drift', () => {
      const r = makeReport({ baselineMetrics: { drift: { value: -0.3 } } });
      expect(buildSignalProfile(r).drift).toBe('slight_negative');
    });

    it('classifies strong negative drift', () => {
      const r = makeReport({ baselineMetrics: { drift: { value: -0.5 } } });
      expect(buildSignalProfile(r).drift).toBe('strong_negative');
    });

    it('classifies missing drift as neutral', () => {
      const r = makeReport({ baselineMetrics: {} });
      expect(buildSignalProfile(r).drift).toBe('neutral');
    });
  });

  // Trigger strength
  describe('triggerStrength', () => {
    it('returns "none" when no friction/regulators', () => {
      expect(buildSignalProfile(makeReport()).triggerStrength).toBe('none');
    });

    it('returns "weak" for 1 pairing with low count', () => {
      const r = makeReport({ frictionZones: [{ count: 2 }] });
      expect(buildSignalProfile(r).triggerStrength).toBe('weak');
    });

    it('returns "strong" for ≥3 pairings with max count ≥4', () => {
      const r = makeReport({
        frictionZones: [{ count: 5 }, { count: 3 }],
        regulators: [{ count: 2 }],
      });
      expect(buildSignalProfile(r).triggerStrength).toBe('strong');
    });

    it('returns "moderate" for in-between cases', () => {
      const r = makeReport({
        frictionZones: [{ count: 3 }, { count: 2 }],
      });
      expect(buildSignalProfile(r).triggerStrength).toBe('moderate');
    });
  });

  // Overall intensity
  describe('intensity', () => {
    it('returns "subtle" for low volatility + neutral drift + non-strong triggers', () => {
      const p = buildSignalProfile(makeReport());
      expect(p.intensity).toBe('subtle');
    });

    it('returns "strong" for high volatility', () => {
      const p = buildSignalProfile(makeReport({ volatilityScore: 0.9 }));
      expect(p.intensity).toBe('strong');
    });

    it('returns "strong" for strong negative drift', () => {
      const r = makeReport({ baselineMetrics: { drift: { value: -0.5 } } });
      expect(buildSignalProfile(r).intensity).toBe('strong');
    });

    it('returns "moderate" for moderate volatility + neutral drift', () => {
      const p = buildSignalProfile(makeReport({ volatilityScore: 0.5 }));
      expect(p.intensity).toBe('moderate');
    });
  });

  // Weekly slope
  describe('weeklySlope', () => {
    it('returns "flat" when trajectory has < 3 entries', () => {
      const r = makeReport({ weeklyEmotionTrajectory: [{ score: 3 }, { score: 1 }] });
      expect(buildSignalProfile(r).weeklySlope).toBe('flat');
    });

    it('returns "declining" for large drop', () => {
      const traj = [{ score: 4 }, { score: 3 }, { score: 2.5 }, { score: 3.1 }];
      const r = makeReport({ weeklyEmotionTrajectory: traj });
      expect(buildSignalProfile(r).weeklySlope).toBe('declining');
    });

    it('returns "rising" for large increase', () => {
      const traj = [{ score: 1 }, { score: 2 }, { score: 2.5 }, { score: 1.9 }];
      const r = makeReport({ weeklyEmotionTrajectory: traj });
      expect(buildSignalProfile(r).weeklySlope).toBe('rising');
    });

    it('returns "flat" for stable trajectory', () => {
      const traj = [{ score: 3 }, { score: 3.1 }, { score: 2.9 }, { score: 3 }];
      const r = makeReport({ weeklyEmotionTrajectory: traj });
      expect(buildSignalProfile(r).weeklySlope).toBe('flat');
    });
  });

  // Flattening detection
  describe('isFlattening', () => {
    it('detects flattening: low volatility + high neutral ratio + decline', () => {
      const r = makeReport({
        volatilityScore: 0.1,
        emotionFrequency: { neutral: 5, calm: 1 },
        weeklyEmotionTrajectory: [{ score: 4 }, { score: 3 }, { score: 2.5 }, { score: 3.1 }],
      });
      expect(buildSignalProfile(r).isFlattening).toBe(true);
    });

    it('not flattening with moderate volatility', () => {
      const r = makeReport({
        volatilityScore: 0.5,
        emotionFrequency: { neutral: 5, calm: 1 },
      });
      expect(buildSignalProfile(r).isFlattening).toBe(false);
    });
  });

  // Invoked metrics
  describe('invoked metrics', () => {
    it('classifies strong negative vacuum drift', () => {
      const r = makeReport({ invokedMetrics: { vacuumDrift: -0.6 } });
      expect(buildSignalProfile(r).vacuumDrift).toBe('strong_negative');
    });

    it('classifies positive vacuum drift', () => {
      const r = makeReport({ invokedMetrics: { vacuumDrift: 0.3 } });
      expect(buildSignalProfile(r).vacuumDrift).toBe('positive');
    });

    it('detects masking level', () => {
      const r = makeReport({ invokedMetrics: { vacuumDrift: 0, weeklyMasking: { level: 'high' } } });
      expect(buildSignalProfile(r).maskingLevel).toBe('high');
    });

    it('detects residue contamination', () => {
      const r = makeReport({ invokedMetrics: { vacuumDrift: 0, contamination: ['work→social'] } });
      expect(buildSignalProfile(r).residueContamination).toBe(true);
    });
  });

  // Compound patterns
  describe('compound patterns', () => {
    it('reports falseRecovery from compound patterns', () => {
      const r = makeReport({ compoundPatterns: { falseRecovery: true, crashRisk: false } });
      expect(buildSignalProfile(r).falseRecovery).toBe(true);
    });

    it('reports crashRisk from compound patterns', () => {
      const r = makeReport({ compoundPatterns: { falseRecovery: false, crashRisk: true } });
      expect(buildSignalProfile(r).crashRisk).toBe(true);
    });
  });

  // Output shape
  it('returns all expected keys', () => {
    const p = buildSignalProfile(makeReport());
    const expectedKeys = [
      'volatility', 'drift', 'dominantEmotion', 'triggerStrength',
      'intensity', 'weeklySlope', 'isFlattening',
      'vacuumDrift', 'maskingLevel', 'residueContamination',
      'falseRecovery', 'crashRisk',
      'centroidLabel', 'centroidValenceShift', 'centroidArousalShift',
    ];
    for (const key of expectedKeys) {
      expect(p).toHaveProperty(key);
    }
  });
});

// ── buildSignalConstraints ──────────────────────────────────────────────────

describe('buildSignalConstraints', () => {
  it('returns a non-empty string', () => {
    const profile = buildSignalProfile(makeReport());
    const constraints = buildSignalConstraints(profile);
    expect(constraints).toBeTypeOf('string');
    expect(constraints.length).toBeGreaterThan(0);
  });

  it('includes signal profile intensity line', () => {
    const profile = buildSignalProfile(makeReport());
    const constraints = buildSignalConstraints(profile);
    expect(constraints).toContain('SIGNAL PROFILE');
  });

  it('adds low volatility constraint', () => {
    const profile = buildSignalProfile(makeReport({ volatilityScore: 0.1 }));
    const constraints = buildSignalConstraints(profile);
    expect(constraints).toContain('Volatility: low');
  });

  it('adds flattening constraint when detected', () => {
    const r = makeReport({
      volatilityScore: 0.1,
      emotionFrequency: { neutral: 5, calm: 1 },
      weeklyEmotionTrajectory: [{ score: 4 }, { score: 3 }, { score: 2.5 }, { score: 3.1 }],
    });
    const profile = buildSignalProfile(r);
    const constraints = buildSignalConstraints(profile);
    expect(constraints).toContain('FLATTENING DETECTED');
  });

  it('adds vacuum state constraint for strong negative vacuum drift', () => {
    const r = makeReport({ invokedMetrics: { vacuumDrift: -0.6 } });
    const profile = buildSignalProfile(r);
    const constraints = buildSignalConstraints(profile);
    expect(constraints).toContain('VACUUM STATE');
  });

  it('adds crash risk constraint', () => {
    const r = makeReport({ compoundPatterns: { crashRisk: true } });
    const profile = buildSignalProfile(r);
    const constraints = buildSignalConstraints(profile);
    expect(constraints).toContain('CRASH RISK');
  });
});
