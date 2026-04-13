import { describe, it, expect } from 'vitest';
import { STYLE_IDS, STYLE_OPTIONS, getStylePrompt, validateStyle } from '../styleProfiles.js';

describe('STYLE_IDS', () => {
  it('contains all 11 style profiles', () => {
    expect(STYLE_IDS.length).toBe(11);
  });

  it('includes expected styles', () => {
    expect(STYLE_IDS).toContain('dostoevsky');
    expect(STYLE_IDS).toContain('camus');
    expect(STYLE_IDS).toContain('fleabag');
    expect(STYLE_IDS).toContain('seinfeld');
    expect(STYLE_IDS).toContain('kenny');
  });
});

describe('STYLE_OPTIONS', () => {
  it('includes default as first option', () => {
    expect(STYLE_OPTIONS[0]).toEqual({ id: 'default', label: 'Default (System Voice)' });
  });

  it('has 12 total options (default + 11 styles)', () => {
    expect(STYLE_OPTIONS.length).toBe(12);
  });

  it('every option has id and label', () => {
    for (const opt of STYLE_OPTIONS) {
      expect(opt).toHaveProperty('id');
      expect(opt).toHaveProperty('label');
    }
  });
});

describe('getStylePrompt', () => {
  it('returns empty string for default style', () => {
    expect(getStylePrompt('default')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(getStylePrompt(null)).toBe('');
    expect(getStylePrompt(undefined)).toBe('');
  });

  it('returns empty string for unknown style', () => {
    expect(getStylePrompt('nonexistent')).toBe('');
  });

  it('returns non-empty prompt for valid style', () => {
    const prompt = getStylePrompt('camus');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('includes VOICE STYLE header', () => {
    expect(getStylePrompt('dostoevsky')).toContain('VOICE STYLE');
  });

  it('includes vocabulary section', () => {
    expect(getStylePrompt('fleabag')).toContain('Characteristic vocabulary');
  });

  it('includes anti-patterns section', () => {
    expect(getStylePrompt('seinfeld')).toContain('AVOID');
  });

  it('includes examples', () => {
    expect(getStylePrompt('kenny')).toContain('Example outputs');
  });
});

describe('validateStyle', () => {
  it('returns passthrough for default style', () => {
    const result = validateStyle('Hello world', 'default');
    expect(result.text).toBe('Hello world');
    expect(result.styleScore).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('returns passthrough for null style', () => {
    const result = validateStyle('Hello world', null);
    expect(result.styleScore).toBe(1);
  });

  it('strips anti-pattern words', () => {
    const result = validateStyle(
      'The gentle light within you is beautiful today.',
      'dostoevsky'
    );
    expect(result.text).not.toContain('gentle');
    expect(result.text).not.toContain('beautiful');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('scores style adherence based on vocabulary', () => {
    const highMatch = validateStyle(
      'The absurd thing is it makes no difference. Nothing changed. That is all.',
      'camus'
    );
    const lowMatch = validateStyle(
      'You had a wonderful amazing week full of beautiful moments.',
      'camus'
    );
    expect(highMatch.styleScore).toBeGreaterThan(lowMatch.styleScore);
  });

  it('warns on low style adherence', () => {
    const result = validateStyle(
      'The flowers bloomed in the garden today.',
      'carlin'
    );
    expect(result.warnings.some(w => w.includes('Low style adherence'))).toBe(true);
  });
});
