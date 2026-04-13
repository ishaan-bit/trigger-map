import { describe, it, expect } from 'vitest';
import { MAX_TAGS_PER_MOMENT, REGION_TAGS } from '../tags.js';
import { emotionRegionKey } from '../emotions.js';

describe('MAX_TAGS_PER_MOMENT', () => {
  it('is 3', () => {
    expect(MAX_TAGS_PER_MOMENT).toBe(3);
  });
});

describe('REGION_TAGS', () => {
  const EXPECTED_REGIONS = [
    'bad_high', 'bad_mid', 'bad_low',
    'neutral_high', 'neutral_mid', 'neutral_low',
    'good_high', 'good_mid', 'good_low',
  ];

  it('covers all 9 emotion regions', () => {
    for (const region of EXPECTED_REGIONS) {
      expect(REGION_TAGS).toHaveProperty(region);
    }
  });

  it('has no extra unexpected regions', () => {
    expect(Object.keys(REGION_TAGS).sort()).toEqual(EXPECTED_REGIONS.sort());
  });

  it('every region has at least 5 tags', () => {
    for (const [region, tags] of Object.entries(REGION_TAGS)) {
      expect(tags.length, `${region} should have ≥5 tags`).toBeGreaterThanOrEqual(5);
    }
  });

  it('all tags are non-empty strings', () => {
    for (const tags of Object.values(REGION_TAGS)) {
      for (const tag of tags) {
        expect(tag).toBeTypeOf('string');
        expect(tag.length).toBeGreaterThan(0);
      }
    }
  });

  it('region keys match emotionRegionKey output format', () => {
    // Every possible emotionRegionKey output should have a REGION_TAGS entry
    const valenceVals = [-1, 0, 1];
    const arousalVals = [-1, 0, 1];
    for (const v of valenceVals) {
      for (const a of arousalVals) {
        const key = emotionRegionKey(v, a);
        expect(REGION_TAGS[key], `Missing REGION_TAGS for "${key}"`).toBeDefined();
      }
    }
  });
});
