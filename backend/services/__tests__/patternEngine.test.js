import { describe, it, expect } from "vitest";
import { generateWeeklyReport } from "../patternEngine.js";

// Helper: build a daily aggregate snapshot
function makeSnap(date, emotionCounts = {}, triggers = {}, pairs = {}, extra = {}) {
  const total = Object.values(emotionCounts).reduce((s, v) => s + v, 0);
  return {
    date,
    total,
    emotions: emotionCounts,
    triggers,
    pairs,
    timeOfDay: extra.timeOfDay || { morning: 0, afternoon: 0, evening: 0, night: 0 },
    tags: extra.tags || {},
    valenceSum: extra.valenceSum || 0,
    arousalSum: extra.arousalSum || 0,
    continuousCount: extra.continuousCount || 0,
  };
}

function makeDays(n, emotionCounts, triggers, pairs, startDate = "2025-01-01") {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    days.push(makeSnap(date, { ...emotionCounts }, { ...triggers }, { ...pairs }));
  }
  return days;
}

describe("generateWeeklyReport", () => {
  it("returns structured report for empty input", () => {
    const report = generateWeeklyReport({});
    expect(report).toHaveProperty("totalMoments", 0);
    expect(report).toHaveProperty("triggerFrequency");
    expect(report).toHaveProperty("emotionFrequency");
    expect(report).toHaveProperty("dataQuality");
    expect(report.dataQuality.confidence).toBe("too_early");
  });

  it("returns too_early confidence for < 3 moments", () => {
    const agg = [makeSnap("2025-01-01", { calm: 2 }, { work: 2 })];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.dataQuality.confidence).toBe("too_early");
  });

  it("returns low confidence for 3-4 moments", () => {
    const agg = [makeSnap("2025-01-01", { calm: 4 }, { work: 4 })];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.dataQuality.confidence).toBe("low");
  });

  it("returns stale confidence when silenceWindow is set", () => {
    const agg = [makeSnap("2025-01-01", { calm: 10 }, { work: 10 })];
    const report = generateWeeklyReport({ aggregates: agg, silenceWindow: true });
    expect(report.dataQuality.confidence).toBe("stale");
  });

  // --- Frequency counting ---

  it("counts trigger frequencies correctly", () => {
    const agg = [
      makeSnap("2025-01-01", { calm: 3 }, { work: 2, family: 1 }),
      makeSnap("2025-01-02", { calm: 2 }, { work: 1, family: 1 }),
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.triggerFrequency.work).toBe(3);
    expect(report.triggerFrequency.family).toBe(2);
  });

  it("counts emotion frequencies correctly", () => {
    const agg = [
      makeSnap("2025-01-01", { calm: 3, anxious: 1 }),
      makeSnap("2025-01-02", { calm: 1, frustrated: 2 }),
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.emotionFrequency.calm).toBe(4);
    expect(report.emotionFrequency.anxious).toBe(1);
    expect(report.emotionFrequency.frustrated).toBe(2);
  });

  it("sums total moments across all days", () => {
    const agg = [
      makeSnap("2025-01-01", { calm: 3 }),
      makeSnap("2025-01-02", { calm: 2 }),
      makeSnap("2025-01-03", { calm: 4 }),
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.totalMoments).toBe(9);
  });

  it("counts pair frequencies via topPair", () => {
    const agg = [
      makeSnap("2025-01-01", { calm: 2 }, { work: 2 }, { "work|calm": 2 }),
      makeSnap("2025-01-02", { calm: 1 }, { work: 1 }, { "work|calm": 1 }),
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    // pairFrequency is internal; topPair exposes the top pair with count
    expect(report.topPair.trigger).toBe("work");
    expect(report.topPair.emotion).toBe("calm");
    expect(report.topPair.count).toBe(3);
  });

  // --- Top trigger / emotion ---

  it("identifies dominant trigger", () => {
    const agg = makeDays(3, { calm: 3 }, { work: 2, family: 1 }, { "work|calm": 2, "family|calm": 1 });
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.topTrigger).toBe("work");
  });

  it("returns null topTrigger when tied", () => {
    const agg = makeDays(3, { calm: 2 }, { work: 2, family: 2 }, {});
    const report = generateWeeklyReport({ aggregates: agg });
    // When tied, topTrigger should be null and tiedTriggers has both
    expect(report.topTrigger).toBeNull();
    expect(report.tiedTriggers).toContain("work");
    expect(report.tiedTriggers).toContain("family");
  });

  // --- Regulators and friction ---

  it("detects regulators (high emotion score pairs)", () => {
    // calm has EMOTION_SCORE = 4 (high)
    const agg = makeDays(5, { calm: 3 }, { exercise: 3 }, { "exercise|calm": 3 });
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.regulators.length).toBeGreaterThan(0);
    expect(report.regulators[0].trigger).toBe("exercise");
    expect(report.regulators[0].emotion).toBe("calm");
  });

  it("detects friction zones (low emotion score pairs)", () => {
    // frustrated has EMOTION_SCORE = 2 (low)
    const agg = makeDays(5, { frustrated: 3 }, { work: 3 }, { "work|frustrated": 3 });
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.frictionZones.length).toBeGreaterThan(0);
    expect(report.frictionZones[0].trigger).toBe("work");
    expect(report.frictionZones[0].emotion).toBe("frustrated");
  });

  it("requires MIN_PAIR_REPEATS (2) for regulators/friction", () => {
    // Only 1 occurrence per day = 1 total per pair (if only 1 day)
    const agg = [makeSnap("2025-01-01", { calm: 5 }, { work: 5 }, { "work|calm": 1 })];
    const report = generateWeeklyReport({ aggregates: agg });
    // Pair appears only once total → should NOT be a regulator
    expect(report.regulators.length).toBe(0);
  });

  // --- Weekl Centroid ---

  it("computes weekly centroid from valence/arousal sums", () => {
    const agg = [
      makeSnap("2025-01-01", { calm: 1 }, {}, {}, { valenceSum: 0.5, arousalSum: -0.3, continuousCount: 1 }),
      makeSnap("2025-01-02", { calm: 1 }, {}, {}, { valenceSum: 0.7, arousalSum: -0.2, continuousCount: 1 }),
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.weeklyCentroid).not.toBeNull();
    expect(report.weeklyCentroid.count).toBe(2);
    expect(report.weeklyCentroid.valence).toBeGreaterThan(0);
    expect(report.weeklyCentroid.arousal).toBeLessThan(0);
  });

  it("centroid is null when no continuous data", () => {
    const agg = makeDays(3, { calm: 2 }, { work: 2 });
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.weeklyCentroid).toBeNull();
  });

  // --- Centroid drift ---

  it("computes centroid drift over the week", () => {
    const agg = [
      makeSnap("2025-01-01", { calm: 1 }, {}, {}, { valenceSum: -0.5, arousalSum: 0.3, continuousCount: 1 }),
      makeSnap("2025-01-02", { calm: 1 }, {}, {}, { valenceSum: 0.2, arousalSum: -0.1, continuousCount: 1 }),
      makeSnap("2025-01-03", { calm: 1 }, {}, {}, { valenceSum: 0.8, arousalSum: -0.5, continuousCount: 1 }),
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.centroidDrift).not.toBeNull();
    // Drift from day1 to day3: valence went up, arousal went down
    expect(report.centroidDrift.valence).toBeGreaterThan(0);
    expect(report.centroidDrift.arousal).toBeLessThan(0);
  });

  // --- Volatility ---

  it("computes volatility score", () => {
    const agg = makeDays(5, { calm: 2, frustrated: 2, anxious: 1 }, {});
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.volatilityScore).not.toBeNull();
    expect(typeof report.volatilityScore).toBe("number");
  });

  it("low volatility for uniform emotions", () => {
    const agg = makeDays(5, { calm: 5 }, {});
    const report = generateWeeklyReport({ aggregates: agg });
    // All same emotion → variance = 0
    expect(report.volatilityScore).toBe(0);
  });

  // --- Trajectory note ---

  it("generates trajectory note with enough data", () => {
    const agg = [
      makeSnap("2025-01-01", { frustrated: 5 }),
      makeSnap("2025-01-02", { frustrated: 3, neutral: 2 }),
      makeSnap("2025-01-03", { neutral: 5 }),
      makeSnap("2025-01-04", { neutral: 3, calm: 2 }),
      makeSnap("2025-01-05", { calm: 5 }),
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    // Score went from ~2 to ~4, so should have trajectory note
    expect(report.trajectoryNote).not.toBeNull();
  });

  // --- Weekly deltas ---

  it("computes weekly deltas when previous aggregates provided", () => {
    const current = makeDays(7, { calm: 3 }, { work: 3 });
    const previous = makeDays(7, { calm: 2 }, { work: 2 });
    const report = generateWeeklyReport({ aggregates: current, previousAggregates: previous });
    expect(report.weeklyDeltas).not.toBeNull();
    expect(report.weeklyDeltas.totalMomentsDelta).toBe(7); // 21 vs 14
  });

  it("returns null deltas when no previous aggregates", () => {
    const current = makeDays(5, { calm: 3 });
    const report = generateWeeklyReport({ aggregates: current });
    expect(report.weeklyDeltas).toBeNull();
  });

  // --- Tag frequency ---

  it("counts tag frequencies", () => {
    const agg = [
      makeSnap("2025-01-01", { calm: 2 }, {}, {}, { tags: { stress: 2, deadline: 1 } }),
      makeSnap("2025-01-02", { calm: 1 }, {}, {}, { tags: { stress: 1 } }),
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.tagFrequency.stress).toBe(3);
    expect(report.tagFrequency.deadline).toBe(1);
  });

  // --- Time of day ---

  it("counts time-of-day patterns", () => {
    const agg = [
      makeSnap("2025-01-01", { calm: 3 }, {}, {}, { timeOfDay: { morning: 2, afternoon: 1 } }),
      makeSnap("2025-01-02", { calm: 2 }, {}, {}, { timeOfDay: { morning: 1, evening: 1 } }),
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.timeOfDayPatterns.morning).toBe(3);
    expect(report.timeOfDayPatterns.evening).toBe(1);
  });

  // --- Days logged ---

  it("counts only days with actual moments for daysLogged", () => {
    const agg = [
      makeSnap("2025-01-01", { calm: 3 }),   // total = 3
      makeSnap("2025-01-02", {}),              // total = 0
      makeSnap("2025-01-03", { calm: 2 }),    // total = 2
    ];
    const report = generateWeeklyReport({ aggregates: agg });
    expect(report.dataQuality.daysLogged).toBe(2);
  });

  // --- Confidence progression ---

  it("reaches strong confidence with 15+ moments and 5+ days", () => {
    const agg = makeDays(7, { calm: 3, neutral: 1 });
    const report = generateWeeklyReport({ aggregates: agg });
    // 7 days × 4 = 28 moments, 7 days → strong
    expect(report.dataQuality.confidence).toBe("strong");
  });

  it("reaches moderate confidence with 8-14 moments on 3-4 days", () => {
    const agg = makeDays(4, { calm: 2, neutral: 1 });
    const report = generateWeeklyReport({ aggregates: agg });
    // 4 days × 3 = 12 moments, 4 days → moderate
    expect(report.dataQuality.confidence).toBe("moderate");
  });

  it("reaches emerging confidence with 5-7 moments on 2 days", () => {
    const agg = makeDays(2, { calm: 2, neutral: 1 });
    const report = generateWeeklyReport({ aggregates: agg });
    // 2 days × 3 = 6 moments, 2 days → emerging
    expect(report.dataQuality.confidence).toBe("emerging");
  });
});
