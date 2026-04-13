import { describe, it, expect } from "vitest";
import { generateInsight } from "../generateInsight.js";

// Helper: build a minimal report matching patternEngine output shape
function makeReport(overrides = {}) {
  return {
    totalMoments: 20,
    topTrigger: "work",
    topEmotion: "calm",
    tiedTriggers: [],
    tiedEmotions: [],
    regulators: [{ trigger: "exercise", emotion: "calm", count: 4 }],
    frictionZones: [{ trigger: "work", emotion: "frustrated", count: 3 }],
    triggerFrequency: { work: 8, exercise: 5, family: 4 },
    emotionFrequency: { calm: 8, frustrated: 5, neutral: 4, anxious: 2, energized: 1 },
    pairFrequency: { "work|frustrated": 3, "exercise|calm": 4 },
    topPair: { trigger: "work", emotion: "frustrated", count: 3 },
    volatilityScore: 0.5,
    weeklyEmotionTrajectory: [
      { date: "2025-01-01", score: 3.2, tone: "mixed" },
      { date: "2025-01-07", score: 3.5, tone: "mixed" },
    ],
    dataQuality: {
      totalMoments: 20,
      daysLogged: 7,
      uniqueTriggers: 3,
      uniqueEmotions: 5,
      confidence: "strong",
    },
    baselineMetrics: {
      baseline: { score: 3.2, label: "mixed", reliable: true },
      drift: { direction: "stable", label: "stable" },
      stability: { score: 0.7 },
      stateOfMind: "mostly steady",
    },
    recurrence: [],
    mirror: null,
    weeklyDeltas: null,
    trajectoryNote: null,
    tagFrequency: {},
    weeklyCentroid: null,
    centroidDrift: null,
    baselineContext: {},
    ...overrides,
  };
}

describe("generateInsight", () => {
  // --- Confidence-based routing ---

  it("returns too_early summary for too_early confidence", async () => {
    const report = makeReport({
      dataQuality: { totalMoments: 1, daysLogged: 1, confidence: "too_early" },
    });
    const result = await generateInsight(report);
    expect(result.summary).toContain("getting started");
    expect(result.confidence).toBe("too_early");
    expect(result.microExperiment).toBeNull();
  });

  it("returns stale summary for stale confidence", async () => {
    const report = makeReport({
      dataQuality: { totalMoments: 10, daysLogged: 5, confidence: "stale", daysSinceLastLog: 5 },
    });
    const result = await generateInsight(report, { firstName: "Ishaan" });
    expect(result.summary).toContain("days since");
    expect(result.confidence).toBe("stale");
  });

  it("returns low summary for low confidence", async () => {
    const report = makeReport({
      dataQuality: { totalMoments: 4, daysLogged: 1, confidence: "low" },
    });
    const result = await generateInsight(report, { firstName: "Ishaan" });
    expect(result.summary.toLowerCase()).toContain("logged");
    expect(result.confidence).toBe("low");
  });

  it("returns emerging summary for emerging confidence", async () => {
    const report = makeReport({
      dataQuality: { totalMoments: 7, daysLogged: 2, confidence: "emerging" },
    });
    const result = await generateInsight(report);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(20);
    expect(result.confidence).toBe("emerging");
  });

  it("returns moderate summary for moderate confidence", async () => {
    const report = makeReport({
      dataQuality: { totalMoments: 12, daysLogged: 4, confidence: "moderate" },
    });
    const result = await generateInsight(report, { firstName: "Ishaan" });
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(30);
    expect(result.confidence).toBe("moderate");
  });

  it("returns strong summary for strong confidence", async () => {
    const report = makeReport();
    const result = await generateInsight(report, { firstName: "Ishaan" });
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(50);
    expect(result.confidence).toBe("strong");
  });

  // --- Output structure ---

  it("returns all expected fields", async () => {
    const result = await generateInsight(makeReport());
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("microExperiment");
    expect(result).toHaveProperty("whatWorking");
    expect(result).toHaveProperty("whereToFocus");
    expect(result).toHaveProperty("stateOfMind");
    expect(result).toHaveProperty("baselineSummary");
    expect(result).toHaveProperty("drivers");
    expect(result).toHaveProperty("behavioralLoop");
    expect(result).toHaveProperty("actionableDirection");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("model");
    expect(result).toHaveProperty("generatedAt");
  });

  it("model is rule-based-v4", async () => {
    const result = await generateInsight(makeReport());
    expect(result.model).toBe("rule-based-v4");
  });

  it("generatedAt is a valid ISO timestamp", async () => {
    const result = await generateInsight(makeReport());
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  // --- Micro experiments ---

  it("returns a micro experiment for non-too_early confidence", async () => {
    const result = await generateInsight(makeReport());
    expect(result.microExperiment).not.toBeNull();
    expect(typeof result.microExperiment).toBe("string");
    expect(result.microExperiment.length).toBeGreaterThan(10);
  });

  // --- What's Working ---

  it("whatWorking includes regulators", async () => {
    const report = makeReport();
    const result = await generateInsight(report);
    if (result.whatWorking) {
      expect(result.whatWorking.length).toBeGreaterThan(0);
      const texts = result.whatWorking.map(w => w.text.toLowerCase());
      const hasExercise = texts.some(t => t.includes("exercise"));
      expect(hasExercise).toBe(true);
    }
  });

  // --- Where to Focus ---

  it("whereToFocus includes friction zones", async () => {
    const report = makeReport();
    const result = await generateInsight(report);
    if (result.whereToFocus) {
      const texts = result.whereToFocus.map(w => w.text.toLowerCase());
      const hasWork = texts.some(t => t.includes("work"));
      expect(hasWork).toBe(true);
    }
  });

  // --- Drivers ---

  it("drivers lists top triggers with effects", async () => {
    const result = await generateInsight(makeReport());
    expect(result.drivers).not.toBeNull();
    expect(result.drivers.length).toBeGreaterThan(0);
    expect(result.drivers[0]).toHaveProperty("trigger");
    expect(result.drivers[0]).toHaveProperty("effect");
    expect(["friction", "regulator", "neutral"]).toContain(result.drivers[0].effect);
  });

  // --- Behavioral loop ---

  it("behavioral loop includes friction and/or regulator", async () => {
    const result = await generateInsight(makeReport());
    expect(result.behavioralLoop).not.toBeNull();
    expect(result.behavioralLoop.length).toBeGreaterThan(0);
    expect(["friction", "regulator"]).toContain(result.behavioralLoop[0].type);
  });

  // --- Hindi language ---

  it("returns Hindi summary when lang=hi", async () => {
    const report = makeReport();
    const result = await generateInsight(report, { lang: "hi", firstName: "इशान" });
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(20);
    // Hindi output should not go through lintText (English grammar rules)
  });

  // --- Baseline summary ---

  it("includes baseline summary when baseline is reliable", async () => {
    const result = await generateInsight(makeReport());
    expect(result.baselineSummary).not.toBeNull();
    expect(result.baselineSummary).toContain("baseline");
  });

  it("baseline summary is null when baseline is unreliable", async () => {
    const report = makeReport({
      baselineMetrics: { baseline: { reliable: false }, drift: null, stability: null },
    });
    const result = await generateInsight(report);
    expect(result.baselineSummary).toBeNull();
  });

  // --- Tag context ---

  it("appends tag context when tags have count ≥ 2", async () => {
    const report = makeReport({ tagFrequency: { "overwhelmed": 3, "rush": 1 } });
    const result = await generateInsight(report);
    expect(result.summary).toContain("overwhelmed");
  });

  it("does not append tag context when tag count < 2", async () => {
    const report = makeReport({ tagFrequency: { "rush": 1 } });
    const result = await generateInsight(report);
    expect(result.summary).not.toContain("rush");
  });

  // --- Summary mentions trigger ---

  it("strong summary mentions top trigger", async () => {
    const report = makeReport();
    const result = await generateInsight(report);
    // The summary should reference "work" (the top trigger)
    expect(result.summary.toLowerCase()).toContain("work");
  });

  // --- Edge case: no regulators or friction ---

  it("handles report with no regulators or friction", async () => {
    const report = makeReport({ regulators: [], frictionZones: [] });
    const result = await generateInsight(report);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(20);
  });

  // --- Edge case: empty emotion frequency ---

  it("handles empty emotion frequency", async () => {
    const report = makeReport({
      emotionFrequency: {},
      dataQuality: { totalMoments: 0, daysLogged: 0, confidence: "too_early" },
    });
    const result = await generateInsight(report);
    expect(result.confidence).toBe("too_early");
  });

  // --- Actionable direction ---

  it("actionableDirection is a string or null", async () => {
    const result = await generateInsight(makeReport());
    if (result.actionableDirection !== null) {
      expect(typeof result.actionableDirection).toBe("string");
    }
  });
});
