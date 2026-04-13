import { describe, it, expect } from 'vitest';
import { sanitizeDeep } from '../../utils/sanitizeOutput.js';

describe('sanitizeDeep', () => {
  it('replaces em dashes with spaced hyphens', () => {
    expect(sanitizeDeep('hello\u2014world')).toBe('hello - world');
  });

  it('replaces en dashes with spaced hyphens', () => {
    expect(sanitizeDeep('hello\u2013world')).toBe('hello - world');
  });

  it('normalizes smart quotes', () => {
    expect(sanitizeDeep('\u201cHello\u201d')).toBe('"Hello"');
    expect(sanitizeDeep('\u2018Hello\u2019')).toBe("'Hello'");
  });

  it('removes zero-width characters', () => {
    expect(sanitizeDeep('Hello\u200bWorld')).toBe('HelloWorld');
  });

  it('removes control characters', () => {
    expect(sanitizeDeep('Hello\x01World')).toBe('HelloWorld');
  });

  it('removes markdown bold markers', () => {
    expect(sanitizeDeep('**bold** text')).toBe('bold text');
  });

  it('removes markdown headers', () => {
    expect(sanitizeDeep('## Header\nContent')).toBe('Header\nContent');
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeDeep('too   many   spaces')).toBe('too many spaces');
  });

  it('collapses excess newlines', () => {
    expect(sanitizeDeep('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims whitespace', () => {
    expect(sanitizeDeep('  hello  ')).toBe('hello');
  });

  // Recursive
  it('sanitizes nested objects', () => {
    const input = { a: 'hello\u200bworld', b: { c: '**bold**' } };
    const result = sanitizeDeep(input);
    expect(result.a).toBe('helloworld');
    expect(result.b.c).toBe('bold');
  });

  it('sanitizes arrays', () => {
    const result = sanitizeDeep(['hello\u200bworld', '**bold**']);
    expect(result[0]).toBe('helloworld');
    expect(result[1]).toBe('bold');
  });

  it('passes through numbers and booleans', () => {
    expect(sanitizeDeep(42)).toBe(42);
    expect(sanitizeDeep(true)).toBe(true);
    expect(sanitizeDeep(null)).toBe(null);
  });
});
