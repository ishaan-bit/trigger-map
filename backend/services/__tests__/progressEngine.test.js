import { describe, it, expect } from "vitest";
import { computeProgressMetrics, computePilotMetrics } from "../progressEngine.js";
import { EMOTION_SCORE } from "@triggermap/shared/constants/emotions";

// Helper: build a daily aggregate snapshot
function makeSnap(date, emotionCounts = {}, triggers = {}, pairs = {}) {
  const total = Object.values(emotionCounts).reduce((s, v) => s + v, 0);
  return { date, total, emotions: emotionCounts, triggers, pairs, timeOfDay: {}, tags: {} };
}

// Helper: build N days of aggregates with given emotion distribution
function makeDays(n, emotionCounts = { calm: 2, neutral: 1 }, startDate = "2025-01-01") {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    days.push(makeSnap(date, { ...emotionCounts }));
  }
  return days;
}

describe("computeProgressMetrics", () => {
  it("returns null for insufficient data (< 10 aggregates)", () => {
    const agg = makeDays(5);
    expect(computeProgressMetrics({ aggregates: agg, baselineScore: 3.5 })).toBeNull();
  });

  it("returns null when fewer than 2 active weekly snapshots", () => {
    // 10 days but only 1 has data, rest empty
    const agg = [];
    for (let i = 0; i < 10; i++) {
      agg.push(makeSnap(`2025-01-${String(i + 1).padStart(2, "0")}`, i === 0 ? { calm: 3 } : {}));
    }
    expect(computeProgressMetrics({ aggregates: agg, baselineScore: 3.5 })).toBeNull();
  });

  it("returns structured result for valid data (14 days)", () => {
    const agg = makeDays(14, { calm: 2, frustrated: 1 });
    const result = computeProgressMetrics({ aggregates: agg, baselineScore: 3.0 });
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("trajectory");
    expect(result).toHaveProperty("metrics");
    expect(result).toHaveProperty("patternShifts");
    expect(result).toHaveProperty("attributions");
    expect(result).toHaveProperty("weeklySnapshots");
    expect(result).toHaveProperty("dataQuality");
  });

  it("trajectory includes past, present, change, direction", () => {
    const agg = makeDays(14, { calm: 3 });
    const result = computeProgressMetrics({ aggregates: agg, baselineScore: 3.0 });
    expect(result.trajectory).toHaveProperty("past");
    expect(result.trajectory).toHaveProperty("present");
    expect(result.trajectory).toHaveProperty("change");
    expect(result.trajectory).toHaveProperty("direction");
    expect(result.trajectory).toHaveProperty("projected");
  });

  it("detects improving direction when scores rise over weeks", () => {
    // Week 1: low scores, Week 2: medium, Week 3: high
    const agg = [
      ...makeDays(7, { frustrated: 5 }, "2025-01-01"),       // avg ~2
      ...makeDays(7, { neutral: 5 }, "2025-01-08"),           // avg ~3
      ...makeDays(7, { energized: 5 }, "2025-01-15"),         // avg ~5
    ];
    const result = computeProgressMetrics({ aggregates: agg, baselineScore: 3.0 });
    expect(result).not.toBeNull();
    expect(result.trajectory.change).toBeGreaterThan(0);
  });

  it("detects declining direction when scores fall over weeks", () => {
    const agg = [
      ...makeDays(7, { energized: 5 }, "2025-01-01"),        // avg ~5
      ...makeDays(7, { neutral: 5 }, "2025-01-08"),           // avg ~3
      ...makeDays(7, { frustrated: 5 }, "2025-01-15"),        // avg ~2
    ];
    const result = computeProgressMetrics({ aggregates: agg, baselineScore: 3.0 });
    expect(result).not.toBeNull();
    expect(result.trajectory.change).toBeLessThan(0);
  });

  it("metrics include stability, volatility, drift, recoveryDays", () => {
    const agg = makeDays(14, { calm: 2, neutral: 1 });
    const result = computeProgressMetrics({ aggregates: agg, baselineScore: 3.0 });
    expect(result.metrics).toHaveProperty("stability");
    expect(result.metrics).toHaveProperty("volatility");
    expect(result.metrics).toHaveProperty("drift");
    expect(result.metrics).toHaveProperty("recoveryDays");
  });

  it("patternShifts has all four categories", () => {
    const agg = makeDays(14, { calm: 2 });
    const result = computeProgressMetrics({ aggregates: agg, baselineScore: 3.0 });
    expect(result.patternShifts).toHaveProperty("strengthening");
    expect(result.patternShifts).toHaveProperty("weakening");
    expect(result.patternShifts).toHaveProperty("unresolved");
    expect(result.patternShifts).toHaveProperty("emerging");
  });

  it("detects emerging patterns (new pairs with count ≥ 2)", () => {
    // Week 1: work|calm only
    const week1 = makeDays(7, { calm: 3 }, "2025-01-01");
    week1.forEach(s => { s.triggers = { work: 3 }; s.pairs = { "work|calm": 3 }; });
    // Week 2: work|calm + family|anxious appears
    const week2 = makeDays(7, { calm: 2, anxious: 2 }, "2025-01-08");
    week2.forEach(s => { s.triggers = { work: 2, family: 2 }; s.pairs = { "work|calm": 2, "family|anxious": 2 }; });

    const result = computeProgressMetrics({ aggregates: [...week1, ...week2], baselineScore: 3.0 });
    expect(result).not.toBeNull();
    // family|anxious is new (prev = 0, curr ≥ 2) → emerging
    const emerging = result.patternShifts.emerging;
    expect(emerging.some(e => e.trigger === "family" && e.emotion === "anxious")).toBe(true);
  });

  it("dataQuality includes weeksAvailable and confidence", () => {
    const agg = makeDays(28, { calm: 2 });
    const result = computeProgressMetrics({ aggregates: agg, baselineScore: 3.0 });
    expect(result.dataQuality.weeksAvailable).toBeGreaterThanOrEqual(2);
    expect(["emerging", "moderate", "strong"]).toContain(result.dataQuality.confidence);
  });

  it("attributions are returned (may be empty)", () => {
    const agg = makeDays(14, { calm: 2 });
    const result = computeProgressMetrics({ aggregates: agg, baselineScore: 3.0, actionFeedback: [] });
    expect(result.attributions).toHaveProperty("helped");
    expect(result.attributions).toHaveProperty("notWorking");
    expect(result.attributions).toHaveProperty("needsAttention");
  });
});

describe("computePilotMetrics", () => {
  it("handles empty user list", () => {
    const result = computePilotMetrics([]);
    expect(result.totalUsers).toBe(0);
    expect(result.usersWithProgress).toBe(0);
  });

  it("returns structured result", () => {
    const result = computePilotMetrics([]);
    expect(result).toHaveProperty("improvement");
    expect(result).toHaveProperty("stabilization");
    expect(result).toHaveProperty("recovery");
    expect(result).toHaveProperty("patternDetection");
    expect(result).toHaveProperty("funnel");
  });
});
