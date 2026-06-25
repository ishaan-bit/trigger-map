import { describe, it, expect } from "vitest";
import { generateMicroInsights } from "../microInsights.js";

/* Minimal translator: resolves emotions/triggers, interpolates {vars}. */
function makeT() {
  const dict = {
    "triggers.family": "Family",
    "emotions.frustrated": "Frustrated",
    "emotions.calm": "Calm",
    "microInsight.triggerEmotion": "{trigger} brought up {emotion} {count} times",
    "microInsight.dominantEmotion": "{emotion} made up {pct}% of your week",
  };
  return (key, vars) => {
    const v = dict[key];
    if (typeof v !== "string") return key;
    return vars ? v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`)) : v;
  };
}

/** Coordinate-only moments (new emotion model) — no legacy `emotion` string. */
function coordMoments() {
  const base = { trigger: "family", timestamp: "2026-06-25T08:00:00Z" };
  return [
    { ...base, valence: -0.6, arousal: 0.5 }, // frustrated
    { ...base, valence: -0.6, arousal: 0.5 },
    { ...base, valence: -0.6, arousal: 0.5 },
    { ...base, valence: 0.5, arousal: -0.4 }, // calm
    { ...base, valence: 0.5, arousal: -0.4 },
  ];
}

describe("generateMicroInsights — emotion resolution", () => {
  it("never emits 'undefined'/'Undefined' for coordinate-only moments", () => {
    const lines = generateMicroInsights(coordMoments(), makeT());
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.toLowerCase()).not.toContain("undefined");
    }
  });

  it("resolves the dominant feeling from coordinates (Frustrated, not Undefined)", () => {
    const lines = generateMicroInsights(coordMoments(), makeT());
    expect(lines.join(" ")).toContain("Frustrated");
  });
});
