import { describe, it, expect } from 'vitest';
import {
  EMOTIONS,
  EMOTION_SCORE,
  ENERGY_MAP,
  EMOTION_AXIS_STEPS,
  createEmotionCoordinates,
  emotionRegionKey,
  derivedEmotionLabel,
  EMOTION_COORDINATES,
  legacyToCoordinates,
} from '../emotions.js';

// ── Constants ────────────────────────────────────────────────────────────────

describe('EMOTIONS', () => {
  it('contains the 5 core emotions', () => {
    expect(EMOTIONS).toEqual(['calm', 'neutral', 'anxious', 'frustrated', 'energized']);
  });
});

describe('EMOTION_SCORE', () => {
  it('maps every core emotion to a numeric score', () => {
    for (const e of EMOTIONS) {
      expect(EMOTION_SCORE[e]).toBeTypeOf('number');
    }
  });

  it('scores range from 1 (worst) to 5 (best)', () => {
    expect(EMOTION_SCORE.frustrated).toBe(1);
    expect(EMOTION_SCORE.energized).toBe(5);
  });

  it('includes derived-label safety-net mappings', () => {
    expect(EMOTION_SCORE.overwhelmed).toBe(1);
    expect(EMOTION_SCORE.peaceful).toBe(5);
    expect(EMOTION_SCORE.flat).toBe(2);
  });
});

describe('ENERGY_MAP', () => {
  it('maps every core emotion to an energy string', () => {
    for (const e of EMOTIONS) {
      expect(ENERGY_MAP[e]).toBeTypeOf('string');
    }
  });

  it('maps derived labels as well', () => {
    expect(ENERGY_MAP.overwhelmed).toBe('tense');
    expect(ENERGY_MAP.content).toBe('steady');
    expect(ENERGY_MAP.excited).toBe('uplifted');
  });
});

// ── EMOTION_AXIS_STEPS ──────────────────────────────────────────────────────

describe('EMOTION_AXIS_STEPS', () => {
  it('has 9 compatible steps from -1 to 1', () => {
    expect(EMOTION_AXIS_STEPS).toEqual([-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);
  });
});

// ── createEmotionCoordinates ────────────────────────────────────────────────

describe('createEmotionCoordinates', () => {
  it('snaps feel and energy to nearest axis steps', () => {
    const result = createEmotionCoordinates(0.3, -0.7);
    expect(result.valence).toBe(0.25);
    expect(result.arousal).toBe(-0.75);
  });

  it('returns exact steps when input is already on a step', () => {
    const result = createEmotionCoordinates(0, 1);
    expect(result.valence).toBe(0);
    expect(result.arousal).toBe(1);
  });

  it('computes intensity as normalized magnitude (0-1)', () => {
    const result = createEmotionCoordinates(1, 1);
    expect(result.intensity).toBe(1);
  });

  it('returns intensity 0 at origin', () => {
    const result = createEmotionCoordinates(0, 0);
    expect(result.intensity).toBe(0);
  });

  it('snaps extreme out-of-range values to nearest step', () => {
    const result = createEmotionCoordinates(5, -5);
    expect(result.valence).toBe(1);
    expect(result.arousal).toBe(-1);
  });

  it('returns intensity ≤ 1 for all axis-aligned inputs', () => {
    for (const f of EMOTION_AXIS_STEPS) {
      for (const e of EMOTION_AXIS_STEPS) {
        const { intensity } = createEmotionCoordinates(f, e);
        expect(intensity).toBeLessThanOrEqual(1);
        expect(intensity).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── emotionRegionKey ────────────────────────────────────────────────────────

describe('emotionRegionKey', () => {
  it('returns correct region for strong positive valence + high arousal', () => {
    expect(emotionRegionKey(0.8, 0.8)).toBe('good_high');
  });

  it('returns correct region for strong negative valence + low arousal', () => {
    expect(emotionRegionKey(-0.8, -0.8)).toBe('bad_low');
  });

  it('returns neutral_mid for center of the circumplex', () => {
    expect(emotionRegionKey(0, 0)).toBe('neutral_mid');
  });

  it('treats values in the dead zone (-0.15 to 0.15) as neutral/mid', () => {
    expect(emotionRegionKey(0.1, -0.1)).toBe('neutral_mid');
  });

  it('covers all 9 regions', () => {
    const regions = new Set();
    const vals = [-1, 0, 1];
    for (const v of vals) {
      for (const a of vals) {
        regions.add(emotionRegionKey(v, a));
      }
    }
    expect(regions.size).toBe(9);
  });
});

// ── derivedEmotionLabel ─────────────────────────────────────────────────────

describe('derivedEmotionLabel', () => {
  it('returns "neutral" for near-zero magnitude', () => {
    expect(derivedEmotionLabel(0, 0)).toBe('neutral');
    expect(derivedEmotionLabel(0.05, 0.05)).toBe('neutral');
  });

  it('returns "overwhelmed" for strong negative + high arousal', () => {
    expect(derivedEmotionLabel(-0.8, 0.8)).toBe('overwhelmed');
  });

  it('returns "anxious" for moderate negative + high arousal', () => {
    expect(derivedEmotionLabel(-0.3, 0.3)).toBe('anxious');
  });

  it('returns "excited" for strong positive + high arousal', () => {
    expect(derivedEmotionLabel(0.8, 0.8)).toBe('excited');
  });

  it('returns "peaceful" for strong positive + low arousal', () => {
    expect(derivedEmotionLabel(0.8, -0.8)).toBe('peaceful');
  });

  it('returns "heavy" for strong negative + low arousal', () => {
    expect(derivedEmotionLabel(-0.8, -0.8)).toBe('heavy');
  });

  it('returns "calm" for moderate positive + low arousal', () => {
    expect(derivedEmotionLabel(0.3, -0.3)).toBe('calm');
  });

  it('returns "low" for moderate negative + low arousal', () => {
    expect(derivedEmotionLabel(-0.3, -0.3)).toBe('low');
  });

  it('returns "restless" for strong neutral-valence + high arousal', () => {
    expect(derivedEmotionLabel(0, 0.8)).toBe('restless');
  });

  it('returns "disconnected" for strong neutral-valence + low arousal', () => {
    expect(derivedEmotionLabel(0, -0.8)).toBe('disconnected');
  });
});

// ── legacyToCoordinates ─────────────────────────────────────────────────────

describe('legacyToCoordinates', () => {
  it('maps all 5 core emotions to coordinates', () => {
    for (const e of EMOTIONS) {
      const coords = legacyToCoordinates(e);
      expect(coords).toHaveProperty('valence');
      expect(coords).toHaveProperty('arousal');
    }
  });

  it('returns neutral coordinates for unknown emotion', () => {
    const coords = legacyToCoordinates('nonexistent');
    expect(coords).toEqual(EMOTION_COORDINATES.neutral);
  });

  it('returns specific coordinates for calm', () => {
    expect(legacyToCoordinates('calm')).toEqual({ valence: 0.6, arousal: -0.5 });
  });
});
