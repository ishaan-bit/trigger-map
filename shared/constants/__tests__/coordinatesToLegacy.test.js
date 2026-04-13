import { describe, it, expect } from "vitest";
import { coordinatesToLegacy, emotionSignalKeywords, emotionRegionKey } from "../../constants/emotions.js";

describe("coordinatesToLegacy", () => {
  // --- Neutral center ---
  it("maps (0, 0) to neutral", () => {
    expect(coordinatesToLegacy(0, 0)).toBe("neutral");
  });

  it("maps small magnitude (<0.25) to neutral", () => {
    expect(coordinatesToLegacy(0.1, 0.1)).toBe("neutral");
    expect(coordinatesToLegacy(-0.1, -0.1)).toBe("neutral");
    expect(coordinatesToLegacy(0.15, -0.15)).toBe("neutral");
  });

  // --- Clearly negative valence ---
  it("maps negative valence + high arousal (≥0.7) to anxious", () => {
    expect(coordinatesToLegacy(-0.5, 0.8)).toBe("anxious");
    expect(coordinatesToLegacy(-0.8, 0.9)).toBe("anxious");
    expect(coordinatesToLegacy(-0.3, 0.7)).toBe("anxious");
  });

  it("maps negative valence + low arousal (<0.7) to frustrated", () => {
    expect(coordinatesToLegacy(-0.5, 0.3)).toBe("frustrated");
    expect(coordinatesToLegacy(-0.8, -0.5)).toBe("frustrated");
    expect(coordinatesToLegacy(-0.3, 0.0)).toBe("frustrated");
    expect(coordinatesToLegacy(-0.5, 0.69)).toBe("frustrated");
  });

  // --- Clearly positive valence ---
  it("maps positive valence + non-negative arousal to energized", () => {
    expect(coordinatesToLegacy(0.5, 0.5)).toBe("energized");
    expect(coordinatesToLegacy(0.8, 0.0)).toBe("energized");
    expect(coordinatesToLegacy(0.3, 0.9)).toBe("energized");
  });

  it("maps positive valence + negative arousal to calm", () => {
    expect(coordinatesToLegacy(0.5, -0.5)).toBe("calm");
    expect(coordinatesToLegacy(0.8, -0.1)).toBe("calm");
    expect(coordinatesToLegacy(0.3, -0.8)).toBe("calm");
  });

  // --- Boundary cases ---
  it("maps exact boundary valence=-0.2 to anxious/frustrated zone", () => {
    // valence exactly -0.2 is NOT < -0.2, so falls to ambiguous band
    const result = coordinatesToLegacy(-0.2, 0.5);
    expect(["anxious", "frustrated", "neutral"]).toContain(result);
  });

  it("maps exact boundary valence=0.2 to positive zone", () => {
    // valence exactly 0.2 is NOT > 0.2, so falls to ambiguous band
    const result = coordinatesToLegacy(0.2, 0.5);
    expect(["energized", "anxious", "neutral"]).toContain(result);
  });

  // --- Ambiguous valence band ---
  it("maps valence ~0.15 to energized/calm based on arousal", () => {
    // valence > 0.1 → maps to energized (arousal >= 0) or calm (arousal < 0)
    expect(coordinatesToLegacy(0.15, 0.5)).toBe("energized");
    expect(coordinatesToLegacy(0.15, -0.5)).toBe("calm");
  });

  it("maps near-zero valence + positive arousal to anxious", () => {
    // valence <= 0.1, arousal > 0 → anxious
    expect(coordinatesToLegacy(0.05, 0.5)).toBe("anxious");
  });

  it("maps near-zero valence + negative arousal to frustrated", () => {
    // valence <= 0.1, arousal < 0 → frustrated
    expect(coordinatesToLegacy(0.05, -0.5)).toBe("frustrated");
  });

  // --- Extreme values ---
  it("handles extreme coordinates", () => {
    expect(coordinatesToLegacy(-1, 1)).toBe("anxious");
    expect(coordinatesToLegacy(-1, -1)).toBe("frustrated");
    expect(coordinatesToLegacy(1, 1)).toBe("energized");
    expect(coordinatesToLegacy(1, -1)).toBe("calm");
  });

  // --- Coverage: all 5 emotions are reachable ---
  it("can produce all 5 legacy emotions", () => {
    const emotions = new Set();
    const testPoints = [
      [0, 0],        // neutral
      [-0.5, 0.8],   // anxious
      [-0.5, -0.5],  // frustrated
      [0.5, 0.5],    // energized
      [0.5, -0.5],   // calm
    ];
    for (const [v, a] of testPoints) {
      emotions.add(coordinatesToLegacy(v, a));
    }
    expect(emotions).toEqual(new Set(["neutral", "anxious", "frustrated", "energized", "calm"]));
  });

  it("always returns one of the 5 valid emotions", () => {
    const valid = ["neutral", "anxious", "frustrated", "energized", "calm"];
    // Sample grid across the space
    for (let v = -1; v <= 1; v += 0.25) {
      for (let a = -1; a <= 1; a += 0.25) {
        const result = coordinatesToLegacy(v, a);
        expect(valid).toContain(result);
      }
    }
  });
});

describe("emotionSignalKeywords", () => {
  it("returns array of keywords", () => {
    const keywords = emotionSignalKeywords(-0.5, 0.8);
    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.length).toBeGreaterThan(0);
  });

  it("returns anxious-related keywords for bad+high", () => {
    const keywords = emotionSignalKeywords(-0.5, 0.8);
    expect(keywords).toContain("anxious");
  });

  it("returns calm-related keywords for good+low", () => {
    const keywords = emotionSignalKeywords(0.5, -0.5);
    expect(keywords).toContain("calm");
  });

  it("returns neutral keywords for center", () => {
    const keywords = emotionSignalKeywords(0, 0);
    expect(keywords).toContain("neutral");
  });

  it("returns different keywords for different regions", () => {
    const badHigh = emotionSignalKeywords(-0.5, 0.8);
    const goodLow = emotionSignalKeywords(0.5, -0.5);
    // Should not be identical
    expect(badHigh).not.toEqual(goodLow);
  });
});

describe("emotionRegionKey", () => {
  it("maps to 9 distinct regions", () => {
    const regions = new Set();
    const testPoints = [
      [-0.5, 0.8],   // bad_high
      [-0.5, -0.5],  // bad_low
      [-0.5, 0.0],   // bad_mid
      [0.5, 0.8],    // good_high
      [0.5, -0.5],   // good_low
      [0.5, 0.0],    // good_mid
      [0.0, 0.8],    // neutral_high
      [0.0, -0.5],   // neutral_low
      [0.0, 0.0],    // neutral_mid
    ];
    for (const [v, a] of testPoints) {
      regions.add(emotionRegionKey(v, a));
    }
    expect(regions.size).toBe(9);
  });
});
