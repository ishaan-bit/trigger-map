import { describe, it, expect } from 'vitest';
import { emotionNoun, triggerLabel, cap, lintText } from '../textGrammar.js';

// ── emotionNoun ─────────────────────────────────────────────────────────────

describe('emotionNoun', () => {
  it('converts "anxious" → "anxiety"', () => {
    expect(emotionNoun('anxious')).toBe('anxiety');
  });

  it('converts "frustrated" → "frustration"', () => {
    expect(emotionNoun('frustrated')).toBe('frustration');
  });

  it('converts "calm" → "calmness"', () => {
    expect(emotionNoun('calm')).toBe('calmness');
  });

  it('converts "energized" → "energy"', () => {
    expect(emotionNoun('energized')).toBe('energy');
  });

  it('converts "neutral" → "a neutral state"', () => {
    expect(emotionNoun('neutral')).toBe('a neutral state');
  });

  it('is case-insensitive', () => {
    expect(emotionNoun('ANXIOUS')).toBe('anxiety');
  });

  it('returns unknown emotion as-is', () => {
    expect(emotionNoun('happy')).toBe('happy');
  });

  it('handles null/undefined gracefully', () => {
    expect(emotionNoun(null)).toBe(null);
    expect(emotionNoun(undefined)).toBe(undefined);
  });
});

// ── triggerLabel ────────────────────────────────────────────────────────────

describe('triggerLabel', () => {
  it('converts "alone" → "time alone"', () => {
    expect(triggerLabel('alone')).toBe('time alone');
  });

  it('converts "social" → "social life"', () => {
    expect(triggerLabel('social')).toBe('social life');
  });

  it('returns unknown trigger as-is', () => {
    expect(triggerLabel('work')).toBe('work');
  });

  it('handles null gracefully', () => {
    expect(triggerLabel(null)).toBe(null);
  });
});

// ── cap ─────────────────────────────────────────────────────────────────────

describe('cap', () => {
  it('capitalizes first letter', () => {
    expect(cap('hello')).toBe('Hello');
  });

  it('handles single character', () => {
    expect(cap('a')).toBe('A');
  });

  it('returns falsy values as-is', () => {
    expect(cap('')).toBe('');
    expect(cap(null)).toBe(null);
    expect(cap(undefined)).toBe(undefined);
  });

  it('does not change already-capitalized strings', () => {
    expect(cap('Hello')).toBe('Hello');
  });
});

// ── lintText ────────────────────────────────────────────────────────────────

describe('lintText', () => {
  // Rule 1: "leads to {emotion}"
  it('fixes "leads to anxious" → "leads to feeling anxious"', () => {
    expect(lintText('This leads to anxious states.')).toBe('This leads to feeling anxious states.');
  });

  it('does not double-fix "leads to feeling anxious"', () => {
    const input = 'This leads to feeling anxious.';
    expect(lintText(input)).toBe(input);
  });

  // Rule 2: "brings {emotion}"
  it('fixes "brings frustrated" → "leads to feeling frustrated"', () => {
    expect(lintText('Work brings frustrated moods.')).toBe('Work leads to feeling frustrated moods.');
  });

  // Rule 3: "bringing {emotion}"
  it('fixes "bringing anxious" → "leaving you feeling anxious"', () => {
    expect(lintText('bringing anxious feelings')).toBe('leaving you feeling anxious feelings');
  });

  // Rule 4: "source of {emotion}"
  it('fixes "source of anxious" → "source of anxiety"', () => {
    expect(lintText('a source of anxious moments')).toBe('a source of anxiety moments');
  });

  it('fixes "source of frustrated" → "source of frustration"', () => {
    expect(lintText('the source of frustrated')).toBe('the source of frustration');
  });

  // Rule 8: bare "alone"
  it('replaces bare "alone" with "time alone"', () => {
    expect(lintText('When alone, you feel different.')).toBe('When time alone, you feel different.');
  });

  it('capitalizes "time alone" at sentence start', () => {
    const result = lintText('Alone is a common trigger.');
    expect(result).toContain('Time alone');
  });

  // Rule 9: verb agreement
  it('fixes "tend to bounces" → "tend to bounce"', () => {
    expect(lintText('You tend to bounces back.')).toBe('You tend to bounce back.');
  });

  it('fixes "tend to recovers" → "tend to recover"', () => {
    expect(lintText('They tend to recovers quickly.')).toBe('They tend to recover quickly.');
  });

  // Rule 10: "You's" → "Your"
  it('fixes "You\'s" → "Your"', () => {
    expect(lintText("You's week was steady.")).toBe("Your week was steady.");
  });

  it('fixes lowercase "you\'s" → "your"', () => {
    expect(lintText("and you's mood shifted.")).toBe("and your mood shifted.");
  });

  // Rule 11: garbled tokens
  it('removes garbled tokens like "exer0376fing"', () => {
    const result = lintText('Your exer0376fing routine helped.');
    expect(result).not.toContain('exer0376fing');
  });

  // Rule 12: banned vocabulary
  it('replaces "exergy" with "energy"', () => {
    expect(lintText('Your exergy levels were high.')).toBe('Your energy levels were high.');
  });

  it('replaces "entropy" with "variation"', () => {
    expect(lintText('Emotional entropy increased.')).toBe('Emotional variation increased.');
  });

  it('replaces "equilibrium" with "balance"', () => {
    expect(lintText('Seeking equilibrium here.')).toBe('Seeking balance here.');
  });

  it('replaces "catalyst" with "trigger"', () => {
    expect(lintText('Work is the catalyst.')).toBe('Work is the trigger.');
  });

  it('replaces conjugated forms: "amplifies" → "increases"', () => {
    expect(lintText('Stress amplifies anxiety.')).toBe('Stress increases anxiety.');
  });

  it('replaces conjugated forms: "optimized" → "improved"', () => {
    expect(lintText('You optimized your routine.')).toBe('You improved your routine.');
  });

  it('replaces "exacerbated" → "worsened"', () => {
    expect(lintText('Conflict exacerbated the issue.')).toBe('Conflict worsened the issue.');
  });

  // Edge cases
  it('returns null/undefined as-is', () => {
    expect(lintText(null)).toBe(null);
    expect(lintText(undefined)).toBe(undefined);
  });

  it('returns non-string as-is', () => {
    expect(lintText(42)).toBe(42);
  });

  it('handles empty string', () => {
    expect(lintText('')).toBe('');
  });
});
