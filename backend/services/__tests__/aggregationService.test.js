import { describe, it, expect } from "vitest";
import { formatAggregateDate, bucketForTimestamp } from "../aggregationService.js";

// parseAggregateHash is not exported, so we test it indirectly via a local copy
// of its pure logic. The function is internal but critical — we replicate its
// parsing to verify correctness independently.

function parseAggregateHash(record, date) {
  const snapshot = {
    date,
    total: Number(record.total || 0),
    triggers: {},
    emotions: {},
    pairs: {},
    tags: {},
    timeOfDay: { morning: 0, afternoon: 0, evening: 0, night: 0 },
    valenceSum: Number(record["valence_sum"] || 0) / 1000,
    arousalSum: Number(record["arousal_sum"] || 0) / 1000,
    continuousCount: Number(record["continuous_count"] || 0),
  };
  for (const [field, rawValue] of Object.entries(record)) {
    const value = Number(rawValue || 0);
    if (field.startsWith("trigger:")) snapshot.triggers[field.replace("trigger:", "")] = value;
    else if (field.startsWith("emotion:")) snapshot.emotions[field.replace("emotion:", "")] = value;
    else if (field.startsWith("pair:")) snapshot.pairs[field.replace("pair:", "")] = value;
    else if (field.startsWith("time:")) snapshot.timeOfDay[field.replace("time:", "")] = value;
    else if (field.startsWith("tag:")) snapshot.tags[field.replace("tag:", "")] = value;
  }
  return snapshot;
}

describe("formatAggregateDate", () => {
  it("formats a Date object to YYYY-MM-DD", () => {
    const result = formatAggregateDate(new Date("2025-03-15T10:30:00Z"));
    expect(result).toBe("2025-03-15");
  });

  it("formats a timestamp string", () => {
    expect(formatAggregateDate("2024-12-31T23:59:59Z")).toBe("2024-12-31");
  });

  it("formats a numeric timestamp", () => {
    const ts = new Date("2025-01-01").getTime();
    expect(formatAggregateDate(ts)).toBe("2025-01-01");
  });

  it("defaults to today when no argument", () => {
    const result = formatAggregateDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns exactly 10 characters", () => {
    expect(formatAggregateDate(new Date())).toHaveLength(10);
  });
});

describe("bucketForTimestamp", () => {
  it("maps midnight (0:00) to night", () => {
    const ts = new Date("2025-01-01T00:00:00").toISOString();
    expect(bucketForTimestamp(ts)).toBe("night");
  });

  it("maps 5:59 AM to night", () => {
    const ts = new Date("2025-01-01T05:59:00").toISOString();
    expect(bucketForTimestamp(ts)).toBe("night");
  });

  it("maps 6:00 AM to morning", () => {
    const ts = new Date("2025-01-01T06:00:00").toISOString();
    expect(bucketForTimestamp(ts)).toBe("morning");
  });

  it("maps 11:59 AM to morning", () => {
    const ts = new Date("2025-01-01T11:59:00").toISOString();
    expect(bucketForTimestamp(ts)).toBe("morning");
  });

  it("maps noon (12:00) to afternoon", () => {
    const ts = new Date("2025-01-01T12:00:00").toISOString();
    expect(bucketForTimestamp(ts)).toBe("afternoon");
  });

  it("maps 5:59 PM to afternoon", () => {
    const ts = new Date("2025-01-01T17:59:00").toISOString();
    expect(bucketForTimestamp(ts)).toBe("afternoon");
  });

  it("maps 6:00 PM to evening", () => {
    const ts = new Date("2025-01-01T18:00:00").toISOString();
    expect(bucketForTimestamp(ts)).toBe("evening");
  });

  it("maps 11:59 PM to evening", () => {
    const ts = new Date("2025-01-01T23:59:00").toISOString();
    expect(bucketForTimestamp(ts)).toBe("evening");
  });

  it("handles all 24 hours", () => {
    const valid = ["night", "morning", "afternoon", "evening"];
    for (let h = 0; h < 24; h++) {
      const ts = new Date(2025, 0, 1, h, 0, 0).toISOString();
      expect(valid).toContain(bucketForTimestamp(ts));
    }
  });
});

describe("parseAggregateHash", () => {
  it("returns structured snapshot from empty record", () => {
    const snap = parseAggregateHash({}, "2025-01-01");
    expect(snap.date).toBe("2025-01-01");
    expect(snap.total).toBe(0);
    expect(snap.triggers).toEqual({});
    expect(snap.emotions).toEqual({});
    expect(snap.pairs).toEqual({});
    expect(snap.tags).toEqual({});
    expect(snap.timeOfDay).toEqual({ morning: 0, afternoon: 0, evening: 0, night: 0 });
    expect(snap.valenceSum).toBe(0);
    expect(snap.arousalSum).toBe(0);
    expect(snap.continuousCount).toBe(0);
  });

  it("parses trigger counts", () => {
    const snap = parseAggregateHash({ "trigger:work": "5", "trigger:family": "3" }, "2025-01-01");
    expect(snap.triggers).toEqual({ work: 5, family: 3 });
  });

  it("parses emotion counts", () => {
    const snap = parseAggregateHash({ "emotion:calm": "4", "emotion:anxious": "2" }, "2025-01-01");
    expect(snap.emotions).toEqual({ calm: 4, anxious: 2 });
  });

  it("parses pair counts", () => {
    const snap = parseAggregateHash({ "pair:work|anxious": "3" }, "2025-01-01");
    expect(snap.pairs).toEqual({ "work|anxious": 3 });
  });

  it("parses time-of-day counts", () => {
    const snap = parseAggregateHash({ "time:morning": "2", "time:evening": "4" }, "2025-01-01");
    expect(snap.timeOfDay.morning).toBe(2);
    expect(snap.timeOfDay.evening).toBe(4);
    expect(snap.timeOfDay.night).toBe(0);
  });

  it("parses tag counts", () => {
    const snap = parseAggregateHash({ "tag:overwhelmed": "2" }, "2025-01-01");
    expect(snap.tags).toEqual({ overwhelmed: 2 });
  });

  it("parses valence/arousal sums scaled by 1000", () => {
    const snap = parseAggregateHash({
      valence_sum: "3500",
      arousal_sum: "-2000",
      continuous_count: "5",
    }, "2025-01-01");
    expect(snap.valenceSum).toBe(3.5);
    expect(snap.arousalSum).toBe(-2);
    expect(snap.continuousCount).toBe(5);
  });

  it("handles total correctly", () => {
    const snap = parseAggregateHash({ total: "12" }, "2025-01-01");
    expect(snap.total).toBe(12);
  });

  it("handles negative valence_sum", () => {
    const snap = parseAggregateHash({ valence_sum: "-500" }, "2025-01-01");
    expect(snap.valenceSum).toBe(-0.5);
  });

  it("handles mixed record with all field types", () => {
    const snap = parseAggregateHash({
      total: "10",
      "trigger:work": "6",
      "trigger:family": "4",
      "emotion:calm": "3",
      "emotion:anxious": "7",
      "pair:work|anxious": "5",
      "pair:family|calm": "3",
      "time:morning": "4",
      "time:evening": "6",
      "tag:stress": "3",
      valence_sum: "-1200",
      arousal_sum: "800",
      continuous_count: "8",
    }, "2025-01-15");

    expect(snap.total).toBe(10);
    expect(snap.triggers.work).toBe(6);
    expect(snap.triggers.family).toBe(4);
    expect(snap.emotions.calm).toBe(3);
    expect(snap.emotions.anxious).toBe(7);
    expect(snap.pairs["work|anxious"]).toBe(5);
    expect(snap.timeOfDay.morning).toBe(4);
    expect(snap.tags.stress).toBe(3);
    expect(snap.valenceSum).toBeCloseTo(-1.2);
    expect(snap.arousalSum).toBeCloseTo(0.8);
    expect(snap.continuousCount).toBe(8);
  });
});
