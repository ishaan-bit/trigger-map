import { describe, it, expect } from 'vitest';
import { TRIGGERS, TRIGGER_KEYWORDS } from '../triggers.js';

describe('TRIGGERS', () => {
  it('contains 9 trigger categories', () => {
    expect(TRIGGERS).toHaveLength(9);
  });

  it('includes known triggers', () => {
    expect(TRIGGERS).toContain('work');
    expect(TRIGGERS).toContain('family');
    expect(TRIGGERS).toContain('alone');
    expect(TRIGGERS).toContain('money');
  });

  it('all entries are non-empty strings', () => {
    for (const t of TRIGGERS) {
      expect(t).toBeTypeOf('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });
});

describe('TRIGGER_KEYWORDS', () => {
  it('has a keyword list for every trigger', () => {
    for (const t of TRIGGERS) {
      expect(TRIGGER_KEYWORDS).toHaveProperty(t);
      expect(Array.isArray(TRIGGER_KEYWORDS[t])).toBe(true);
      expect(TRIGGER_KEYWORDS[t].length).toBeGreaterThan(0);
    }
  });

  it('has no extra keys beyond TRIGGERS', () => {
    const extraKeys = Object.keys(TRIGGER_KEYWORDS).filter(k => !TRIGGERS.includes(k));
    expect(extraKeys).toEqual([]);
  });

  it('all keywords are non-empty strings', () => {
    for (const keywords of Object.values(TRIGGER_KEYWORDS)) {
      for (const kw of keywords) {
        expect(kw).toBeTypeOf('string');
        expect(kw.length).toBeGreaterThan(0);
      }
    }
  });

  it('each trigger has its own name in its keywords', () => {
    for (const t of TRIGGERS) {
      const keywords = TRIGGER_KEYWORDS[t].map(k => k.toLowerCase());
      expect(
        keywords.some(k => k.includes(t) || t.includes(k)),
        `${t} keywords should include a variant of itself`
      ).toBe(true);
    }
  });
});
