import { describe, it, expect } from 'vitest';
import { extractFirstName, phraseText, phraseTexts } from '../../utils/phrasingLayer.js';

describe('extractFirstName', () => {
  it('extracts first name from full name', () => {
    expect(extractFirstName('Kumar Singh')).toBe('Kumar');
  });

  it('handles single name', () => {
    expect(extractFirstName('Ishaan')).toBe('Ishaan');
  });

  it('returns null for null/undefined/empty', () => {
    expect(extractFirstName(null)).toBe(null);
    expect(extractFirstName(undefined)).toBe(null);
    expect(extractFirstName('')).toBe(null);
  });

  it('returns null for system placeholder names', () => {
    expect(extractFirstName('quietden user123')).toBe(null);
  });

  it('returns null for single-char names', () => {
    expect(extractFirstName('A')).toBe(null);
  });

  it('trims whitespace', () => {
    expect(extractFirstName('  Ishaan  Singh  ')).toBe('Ishaan');
  });
});

describe('phraseText', () => {
  it('returns empty string for null input', async () => {
    expect(await phraseText(null)).toBe('');
  });

  it('returns empty string for empty input', async () => {
    expect(await phraseText('')).toBe('');
  });

  it('applies grammar lint (banned vocab)', async () => {
    const result = await phraseText('Emotional equilibrium was disrupted.');
    expect(result).toContain('balance');
    expect(result).not.toContain('equilibrium');
  });

  it('normalizes unicode dashes', async () => {
    const result = await phraseText('This\u2014that');
    expect(result).toContain(' - ');
  });

  it('removes markdown bold markers', async () => {
    const result = await phraseText('You felt **anxious** today.');
    expect(result).not.toContain('**');
  });

  it('removes zero-width characters', async () => {
    const result = await phraseText('Hello\u200bWorld');
    expect(result).toBe('HelloWorld');
  });

  it('collapses multiple spaces', async () => {
    const result = await phraseText('too   many   spaces');
    expect(result).toBe('too many spaces');
  });

  it('personalizes with firstName', async () => {
    const result = await phraseText('Your week was steady.', { firstName: 'Kumar' });
    expect(result).toBe("Kumar's week was steady.");
  });

  it('does not personalize without firstName', async () => {
    const result = await phraseText('Your week was fine.');
    expect(result).toContain('Your');
  });
});

describe('phraseTexts', () => {
  it('processes array of texts', async () => {
    const result = await phraseTexts(['Hello **world**.', 'Emotional equilibrium.']);
    expect(result).toHaveLength(2);
    expect(result[0]).not.toContain('**');
    expect(result[1]).toContain('balance');
  });
});
