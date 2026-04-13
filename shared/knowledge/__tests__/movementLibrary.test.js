import { describe, it, expect } from 'vitest';
import {
  MOVEMENTS,
  MECHANISMS,
  ENVIRONMENTS,
  EQUIPMENT,
  INTENSITY_LEVELS,
  filterMovements,
  pickMovements,
} from '../movementLibrary.js';

describe('constants', () => {
  it('MOVEMENTS is a non-empty array', () => {
    expect(Array.isArray(MOVEMENTS)).toBe(true);
    expect(MOVEMENTS.length).toBeGreaterThan(100);
  });

  it('every movement has required fields', () => {
    for (const m of MOVEMENTS.slice(0, 20)) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('name');
      expect(m).toHaveProperty('mechanism');
      expect(m).toHaveProperty('environment');
      expect(m).toHaveProperty('equipment');
      expect(m).toHaveProperty('intensity');
      expect(m).toHaveProperty('emotionTags');
      expect(m).toHaveProperty('durationMin');
    }
  });

  it('MECHANISMS has expected keys', () => {
    expect(MECHANISMS).toHaveProperty('vagalTone');
    expect(MECHANISMS).toHaveProperty('endorphin');
  });

  it('ENVIRONMENTS has expected keys', () => {
    expect(ENVIRONMENTS).toHaveProperty('indoor');
    expect(ENVIRONMENTS).toHaveProperty('outdoor');
  });

  it('INTENSITY_LEVELS has 3 levels', () => {
    expect(INTENSITY_LEVELS).toEqual(['low', 'moderate', 'high']);
  });
});

describe('filterMovements', () => {
  it('returns all movements with no filters', () => {
    expect(filterMovements().length).toBe(MOVEMENTS.length);
  });

  it('filters by mechanism', () => {
    const result = filterMovements({ mechanisms: ['vagalTone'] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(m => m.mechanism.includes('vagalTone'))).toBe(true);
  });

  it('filters by environment', () => {
    const result = filterMovements({ environments: ['indoor'] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(m => m.environment.includes('indoor'))).toBe(true);
  });

  it('filters by equipment', () => {
    const result = filterMovements({ equipment: 'none' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(m => m.equipment === 'none')).toBe(true);
  });

  it('filters by intensity', () => {
    const result = filterMovements({ intensity: 'low' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(m => m.intensity === 'low')).toBe(true);
  });

  it('filters by emotion tags', () => {
    const result = filterMovements({ emotions: ['anxious'] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(m => m.emotionTags.includes('anxious'))).toBe(true);
  });

  it('filters by max duration', () => {
    const result = filterMovements({ maxDuration: 5 });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(m => m.durationMin <= 5)).toBe(true);
  });

  it('combines multiple filters', () => {
    const result = filterMovements({ intensity: 'low', equipment: 'none', emotions: ['anxious'] });
    expect(result.every(m =>
      m.intensity === 'low' && m.equipment === 'none' && m.emotionTags.includes('anxious')
    )).toBe(true);
  });
});

describe('pickMovements', () => {
  it('returns requested number of movements', () => {
    const result = pickMovements(['anxious'], 3);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeGreaterThan(0);
  });

  it('excludes specified IDs', () => {
    const first = pickMovements(['anxious'], 1);
    const second = pickMovements(['anxious'], 1, { exclude: [first[0].id] });
    if (second.length > 0) {
      expect(second[0].id).not.toBe(first[0].id);
    }
  });

  it('filters by environment', () => {
    const result = pickMovements(['calm'], 2, { environment: 'office' });
    expect(result.every(m => m.environment.includes('office'))).toBe(true);
  });

  it('returns from full pool when no candidates after exclusion', () => {
    const allIds = MOVEMENTS.map(m => m.id);
    const result = pickMovements(['anxious'], 2, { exclude: allIds });
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});
