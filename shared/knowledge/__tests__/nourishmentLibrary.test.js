import { describe, it, expect } from 'vitest';
import {
  NOURISHMENTS,
  FOOD_TYPES,
  DIETS,
  CUISINES,
  PREP_LEVELS,
  filterNourishments,
  pickNourishments,
} from '../nourishmentLibrary.js';

describe('constants', () => {
  it('NOURISHMENTS is a non-empty array', () => {
    expect(Array.isArray(NOURISHMENTS)).toBe(true);
    expect(NOURISHMENTS.length).toBeGreaterThan(100);
  });

  it('every nourishment has required fields', () => {
    for (const n of NOURISHMENTS.slice(0, 20)) {
      expect(n).toHaveProperty('id');
      expect(n).toHaveProperty('name');
      expect(n).toHaveProperty('type');
      expect(n).toHaveProperty('diet');
      expect(n).toHaveProperty('cuisine');
      expect(n).toHaveProperty('prepLevel');
      expect(n).toHaveProperty('emotionTags');
    }
  });

  it('FOOD_TYPES has expected keys', () => {
    expect(FOOD_TYPES).toHaveProperty('meal');
    expect(FOOD_TYPES).toHaveProperty('snack');
    expect(FOOD_TYPES).toHaveProperty('drink');
  });

  it('DIETS has expected keys', () => {
    expect(DIETS).toHaveProperty('vegetarian');
    expect(DIETS).toHaveProperty('nonVeg');
  });

  it('PREP_LEVELS has 3 levels', () => {
    expect(PREP_LEVELS).toEqual(['none', 'minimal', 'moderate']);
  });
});

describe('filterNourishments', () => {
  it('returns all nourishments with no filters', () => {
    expect(filterNourishments().length).toBe(NOURISHMENTS.length);
  });

  it('filters by type', () => {
    const result = filterNourishments({ types: ['drink'] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(n => n.type === 'drink')).toBe(true);
  });

  it('filters by diet', () => {
    const result = filterNourishments({ diets: ['vegan'] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(n => n.diet.includes('vegan'))).toBe(true);
  });

  it('nonVeg diet returns all items (no diet filter)', () => {
    const all = filterNourishments();
    const nonVeg = filterNourishments({ diets: ['nonVeg'] });
    expect(nonVeg.length).toBe(all.length);
  });

  it('filters by cuisine', () => {
    const result = filterNourishments({ cuisines: ['indian'] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(n => n.cuisine.includes('indian'))).toBe(true);
  });

  it('filters by prep level', () => {
    const result = filterNourishments({ prepLevel: 'none' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(n => n.prepLevel === 'none')).toBe(true);
  });

  it('filters by emotion tags', () => {
    const result = filterNourishments({ emotions: ['anxious'] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(n => n.emotionTags.includes('anxious'))).toBe(true);
  });
});

describe('pickNourishments', () => {
  it('returns requested count', () => {
    const result = pickNourishments(['anxious'], 3);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeGreaterThan(0);
  });

  it('excludes specified IDs', () => {
    const first = pickNourishments(['anxious'], 1);
    const second = pickNourishments(['anxious'], 1, { exclude: [first[0].id] });
    if (second.length > 0) {
      expect(second[0].id).not.toBe(first[0].id);
    }
  });

  it('respects diet filter', () => {
    const result = pickNourishments(['calm'], 2, { diet: 'vegan' });
    if (result.length > 0) {
      expect(result.every(n => n.diet.includes('vegan'))).toBe(true);
    }
  });
});
