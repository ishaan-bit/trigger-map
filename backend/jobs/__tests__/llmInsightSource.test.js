import { describe, it, expect } from "vitest";
import {
  RAW_FALLBACK_MAX_ACTIVE_DAYS,
  RAW_FALLBACK_MAX_RECENT_MOMENTS,
  RAW_FALLBACK_SILENT_ACTIVE_DAYS,
  buildAggregatesFromRawMoments,
  buildLlmInsightSourceFromData,
  normalizeRawMoment,
} from "../llmInsightSource.js";

const NOW = new Date("2026-05-26T00:00:00.000Z");

function rawMoment(overrides = {}) {
  return JSON.stringify({
    id: `m-${Math.random()}`,
    timestamp: "2026-05-20T10:00:00.000Z",
    trigger: "work",
    emotion: "calm",
    ...overrides,
  });
}

function aggregate(date, total, trigger = "work", emotion = "calm") {
  return {
    date,
    total,
    triggers: { [trigger]: total },
    emotions: { [emotion]: total },
    pairs: { [`${trigger}|${emotion}`]: total },
    tags: {},
    contributionTags: {},
    timeOfDay: { morning: total, afternoon: 0, evening: 0, night: 0 },
    valenceSum: 0,
    arousalSum: 0,
    continuousCount: 0,
  };
}

describe("LLM insight source selection", () => {
  it("returns no-data when there are no raw moments", () => {
    const source = buildLlmInsightSourceFromData({
      aggregates: [],
      rawEntries: [],
      minMoments: 3,
      now: NOW,
    });

    expect(source.status).toBe("skipped");
    expect(source.reason).toBe("no-data");
    expect(source.diagnostics.selectedSource).toBe("none");
    expect(source.diagnostics.rawMomentCount).toBe(0);
  });

  it("returns below-threshold when one raw moment is usable", () => {
    const source = buildLlmInsightSourceFromData({
      aggregates: [],
      rawEntries: [rawMoment()],
      minMoments: 3,
      now: NOW,
    });

    expect(source.status).toBe("skipped");
    expect(source.reason).toBe("below-threshold (1 < 3)");
    expect(source.diagnostics.rawMomentCount).toBe(1);
    expect(source.diagnostics.rawQualifyingCount).toBe(1);
  });

  it("uses raw-fallback when raw moments meet threshold and aggregates do not", () => {
    const source = buildLlmInsightSourceFromData({
      aggregates: [],
      rawEntries: [
        rawMoment({ id: "a", timestamp: "2026-04-01T10:00:00.000Z", trigger: "work", emotion: "calm" }),
        rawMoment({ id: "b", timestamp: "2026-04-02T10:00:00.000Z", trigger: "family", emotion: "anxious" }),
        rawMoment({ id: "c", timestamp: "2026-04-03T10:00:00.000Z", trigger: "health", emotion: "energized" }),
      ],
      minMoments: 3,
      now: NOW,
    });

    expect(source.status).toBe("ready");
    expect(source.selectedSource).toBe("raw-fallback");
    expect(source.weeklyReport.totalMoments).toBe(3);
    expect(source.diagnostics.rawQualifyingCount).toBe(3);
  });

  it("keeps the aggregate fast path when aggregates meet threshold", () => {
    const source = buildLlmInsightSourceFromData({
      aggregates: [aggregate("2026-05-20", 3)],
      rawEntries: [],
      minMoments: 3,
      now: NOW,
    });

    expect(source.status).toBe("ready");
    expect(source.selectedSource).toBe("aggregates");
    expect(source.weeklyReport.totalMoments).toBe(3);
  });

  it("skips malformed raw moments without crashing", () => {
    const source = buildLlmInsightSourceFromData({
      aggregates: [],
      rawEntries: [
        "{bad-json",
        rawMoment({ id: "a" }),
        rawMoment({ id: "b", timestamp: "2026-05-21T10:00:00.000Z" }),
        rawMoment({ id: "c", timestamp: "2026-05-22T10:00:00.000Z" }),
      ],
      minMoments: 3,
      now: NOW,
    });

    expect(source.status).toBe("ready");
    expect(source.selectedSource).toBe("raw-fallback");
    expect(source.diagnostics.skippedMalformedCount).toBe(1);
    expect(source.diagnostics.rawMomentCount).toBe(4);
    expect(source.diagnostics.rawQualifyingCount).toBe(3);
  });

  it("counts old schema raw moments when minimally usable", () => {
    const oldSchema = {
      date: "2026-05-20",
      context: "family",
      mood: "stressed",
      notes: "not logged in diagnostics",
    };
    const parsed = normalizeRawMoment(JSON.stringify(oldSchema));

    expect(parsed.malformed).toBe(false);
    expect(parsed.moment.trigger).toBe("family");
    expect(parsed.moment.emotion).toBe("anxious");

    const source = buildLlmInsightSourceFromData({
      aggregates: [],
      rawEntries: [
        JSON.stringify(oldSchema),
        JSON.stringify({ ...oldSchema, date: "2026-05-21", context: "work", mood: "okay" }),
        JSON.stringify({ ...oldSchema, date: "2026-05-22", context: "health", mood: "happy" }),
      ],
      minMoments: 3,
      now: NOW,
    });

    expect(source.status).toBe("ready");
    expect(source.selectedSource).toBe("raw-fallback");
    expect(source.weeklyReport.totalMoments).toBe(3);
  });

  it("builds raw aggregate snapshots without persisting them", () => {
    const parsed = [
      normalizeRawMoment(rawMoment({ timestamp: "2026-05-20T01:00:00.000Z" })).moment,
      normalizeRawMoment(rawMoment({ timestamp: "2026-05-20T13:00:00.000Z", emotion: "energized" })).moment,
    ];

    const aggregates = buildAggregatesFromRawMoments(parsed);
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].total).toBe(2);
    expect(aggregates[0].emotions.calm).toBe(1);
    expect(aggregates[0].emotions.energized).toBe(1);
  });

  it("bounds raw-fallback reports to a compact active window", () => {
    const rawEntries = Array.from({ length: 80 }, (_, index) => {
      const date = new Date("2026-03-01T10:00:00.000Z");
      date.setDate(date.getDate() + index);
      return rawMoment({
        id: `raw-${index}`,
        timestamp: date.toISOString(),
        note: "x".repeat(1000),
      });
    });

    const source = buildLlmInsightSourceFromData({
      aggregates: [],
      rawEntries,
      minMoments: 3,
      now: NOW,
    });

    expect(source.status).toBe("ready");
    expect(source.selectedSource).toBe("raw-fallback");
    expect(source.weeklyReport.dailyAggregates.length).toBeLessThanOrEqual(RAW_FALLBACK_MAX_ACTIVE_DAYS);
    expect(source.weeklyReport.rawFallbackSummary.activeDaysTotal).toBe(80);
    expect(source.weeklyReport.rawFallbackSummary.activeDaysUsed).toBeLessThanOrEqual(RAW_FALLBACK_MAX_ACTIVE_DAYS);
    expect(source.moments.length).toBeLessThanOrEqual(RAW_FALLBACK_MAX_RECENT_MOMENTS);
  });

  it("uses only the last active days for stale raw-fallback history", () => {
    const rawEntries = Array.from({ length: 30 }, (_, index) => {
      const date = new Date("2025-11-01T10:00:00.000Z");
      date.setDate(date.getDate() + index);
      return rawMoment({ id: `old-${index}`, timestamp: date.toISOString() });
    });

    const source = buildLlmInsightSourceFromData({
      aggregates: [],
      rawEntries,
      minMoments: 3,
      now: NOW,
    });

    expect(source.status).toBe("ready");
    expect(source.selectedSource).toBe("raw-fallback");
    expect(source.weeklyReport.rawFallbackSummary.activeDaysTotal).toBe(30);
    expect(source.weeklyReport.rawFallbackSummary.activeDaysUsed).toBe(RAW_FALLBACK_SILENT_ACTIVE_DAYS);
    expect(source.weeklyReport.dataQuality.isSilent).toBe(true);
  });
});
