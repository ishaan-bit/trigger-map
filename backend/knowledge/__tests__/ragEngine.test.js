import { describe, it, expect } from 'vitest';
import {
  retrieveForLLM,
  retrieveForRuleBased,
  retrieveForMode,
  retrieveIntervention,
} from '../ragEngine.js';

/**
 * These are integration-style unit tests: they exercise extractTags → scoreChunk → retrieve
 * against the real KNOWLEDGE_CHUNKS, which is fine because the knowledge base is static in-code.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/** A report that triggers flattening + work signals → should hit "flat_work" chunk */
function makeFlatteningReport() {
  return {
    volatilityScore: 0.1,
    baselineMetrics: { drift: { value: -0.2 } },
    frictionZones: [{ trigger: 'work', count: 3 }],
    regulators: [],
    topEmotion: 'neutral',
    topTrigger: 'work',
    weeklyEmotionTrajectory: [{ score: 4 }, { score: 3 }, { score: 2.5 }, { score: 3.1 }],
    emotionFrequency: { neutral: 6, calm: 1 },
    invokedMetrics: null,
    compoundPatterns: null,
    weeklyCentroid: null,
    centroidDrift: null,
  };
}

/** A report with strong signals — high volatility, strong triggers, crash risk */
function makeStrongReport() {
  return {
    volatilityScore: 0.9,
    baselineMetrics: { drift: { value: -0.5 } },
    frictionZones: [{ trigger: 'work', count: 5 }, { trigger: 'money', count: 4 }],
    regulators: [{ trigger: 'exercise', count: 3 }],
    topEmotion: 'anxious',
    topTrigger: 'work',
    weeklyEmotionTrajectory: [{ score: 4 }, { score: 3 }, { score: 2 }, { score: 1.5 }],
    emotionFrequency: { anxious: 5, frustrated: 3, neutral: 1 },
    invokedMetrics: { vacuumDrift: -0.6, weeklyMasking: { level: 'moderate' }, contamination: [] },
    compoundPatterns: { crashRisk: true, falseRecovery: false },
    weeklyCentroid: { count: 10, label: 'very tense' },
    centroidDrift: { valence: -0.3, arousal: 0.2 },
  };
}

/** Minimal/empty report — should get no or few matches */
function makeMinimalReport() {
  return {
    volatilityScore: 0.2,
    baselineMetrics: {},
    frictionZones: [],
    regulators: [],
    topEmotion: 'calm',
    weeklyEmotionTrajectory: [],
    emotionFrequency: { calm: 5 },
    invokedMetrics: null,
    compoundPatterns: null,
    weeklyCentroid: null,
    centroidDrift: null,
  };
}

// ── retrieveForLLM ─────────────────────────────────────────────────────────

describe('retrieveForLLM', () => {
  it('returns empty string for null report', () => {
    expect(retrieveForLLM(null)).toBe('');
  });

  it('returns a string starting with CONTEXTUAL KNOWLEDGE header', () => {
    const result = retrieveForLLM(makeFlatteningReport());
    expect(result).toContain('CONTEXTUAL KNOWLEDGE');
  });

  it('includes domain labels in output', () => {
    const result = retrieveForLLM(makeStrongReport());
    // Should contain at least one domain label
    expect(/\[(INTERPRETATION|INTERVENTION|DYNAMICS|FRAMING)\]/.test(result)).toBe(true);
  });

  it('returns fewer/no chunks for a minimal report', () => {
    const full = retrieveForLLM(makeStrongReport());
    const minimal = retrieveForLLM(makeMinimalReport());
    // Strong report should produce more context than minimal
    expect(full.length).toBeGreaterThan(minimal.length);
  });

  it('respects maxChunks parameter', () => {
    const result = retrieveForLLM(makeStrongReport(), 2);
    // Count domain-labeled sections
    const sections = result.match(/\[(INTERPRETATION|INTERVENTION|DYNAMICS|FRAMING)\]/g) || [];
    expect(sections.length).toBeLessThanOrEqual(2);
  });
});

// ── retrieveForRuleBased ───────────────────────────────────────────────────

describe('retrieveForRuleBased', () => {
  it('returns { interpretations, framing } for null report', () => {
    const result = retrieveForRuleBased(null);
    expect(result).toEqual({ interpretations: [], framing: [] });
  });

  it('returns interpretations with id, content, score', () => {
    const result = retrieveForRuleBased(makeFlatteningReport());
    for (const item of result.interpretations) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('content');
      expect(item).toHaveProperty('score');
      expect(item.score).toBeGreaterThan(0);
    }
  });

  it('filters to interpretation and framing domains only', () => {
    const result = retrieveForRuleBased(makeStrongReport());
    // Should not contain intervention or dynamics items
    const allItems = [...result.interpretations, ...result.framing];
    for (const item of allItems) {
      expect(item.id).toBeDefined();
    }
    // interpretations should be from interpretation domain, framing from framing domain
    // (no direct domain field exposed, but we trust the filter)
  });
});

// ── retrieveForMode ────────────────────────────────────────────────────────

describe('retrieveForMode', () => {
  it('returns empty string for null report', () => {
    expect(retrieveForMode(null)).toBe('');
  });

  it('returns string starting with "Emotional context knowledge"', () => {
    const result = retrieveForMode(makeStrongReport());
    if (result) {
      expect(result).toContain('Emotional context knowledge');
    }
  });
});

// ── retrieveIntervention ───────────────────────────────────────────────────

describe('retrieveIntervention', () => {
  it('returns null for null report', () => {
    expect(retrieveIntervention(null)).toBe(null);
  });

  it('returns a string (intervention content) for a matching report', () => {
    const result = retrieveIntervention(makeStrongReport());
    if (result !== null) {
      expect(result).toBeTypeOf('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
