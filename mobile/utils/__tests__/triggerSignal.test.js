import { describe, it, expect } from "vitest";
import { deriveSignalState } from "../triggerSignal.js";

/**
 * Build a server-shaped report. Presence of `correlations`/`baselineMetrics`
 * marks it as "analysis ready" (vs the offline local shell).
 */
function makeReport(over = {}) {
  return {
    totalMoments: 12,
    lifetimeMoments: 12,
    dataQuality: { confidence: "moderate", daysLogged: 5 },
    correlations: { work: { frustrated: 3 } },
    frictionZones: [],
    regulators: [],
    recurrence: [],
    baselineMetrics: { baseline: { score: 3, reliable: true }, drift: { value: 0, direction: "stable" } },
    weeklyEmotionTrajectory: [],
    ...over,
  };
}

/**
 * First-run local report shape (mirrors localStore.buildLocalReport): only the
 * user's own freq tables are present — no server correlations/baseline/friction.
 */
function localReport(over = {}) {
  return {
    lifetimeMoments: 1,
    totalMoments: 1,
    topTrigger: "work",
    topEmotion: "frustrated",
    triggerFrequency: { work: 1 },
    emotionFrequency: { frustrated: 1 },
    correlations: {},
    frictionZones: [],
    regulators: [],
    recurrence: [],
    weeklyEmotionTrajectory: [],
    dataQuality: { confidence: "too_early", daysLogged: 1 },
    ...over,
  };
}

describe("deriveSignalState — early progression (value at first log)", () => {
  it("reflection: one log surfaces the actual logged area + feeling", () => {
    const s = deriveSignalState(localReport());
    expect(s.state).toBe("reflection");
    expect(s.seed.lead).toEqual({ trigger: "work", emotion: "frustrated" });
    expect(s.seed.echo).toBe(false);
    expect(s.barometer.enoughData).toBe(false); // never claims a pressure read yet
  });

  it("thread (echo): two logs of the same area/feeling flag a POSSIBLE echo, not a pattern", () => {
    const s = deriveSignalState(localReport({
      lifetimeMoments: 2,
      totalMoments: 2,
      triggerFrequency: { work: 2 },
      emotionFrequency: { frustrated: 2 },
    }));
    expect(s.state).toBe("thread");
    expect(s.seed.echo).toBe(true);
    expect(s.seed.repeatedTrigger).toBe("work");
    expect(s.seed.repeatedEmotion).toBe("frustrated");
    // Honesty: a 2-log echo is NEVER an observed pattern or steady read.
    expect(s.state).not.toBe("pattern");
    expect(s.state).not.toBe("steady");
  });

  it("thread (no echo): two distinct logs stay provisional with no echo", () => {
    const s = deriveSignalState(localReport({
      lifetimeMoments: 2,
      totalMoments: 2,
      topTrigger: null,
      topEmotion: null,
      triggerFrequency: { work: 1, money: 1 },
      emotionFrequency: { frustrated: 1, anxious: 1 },
    }));
    expect(s.state).toBe("thread");
    expect(s.seed.echo).toBe(false);
    expect(s.seed.triggers.map((x) => x.key).sort()).toEqual(["money", "work"]);
  });

  it("three logs do NOT auto-promote to a pattern on local-only data", () => {
    // Local report: 3 moments, confidence 'low', no server friction analysis.
    const s = deriveSignalState(localReport({
      lifetimeMoments: 3,
      totalMoments: 3,
      triggerFrequency: { work: 2, money: 1 },
      emotionFrequency: { frustrated: 2, anxious: 1 },
      dataQuality: { confidence: "low", daysLogged: 2 },
    }));
    expect(["forming", "steady", "pattern"]).toContain(s.state);
    expect(s.state).toBe("forming"); // earliest honest read until evidence supports more
  });

  it("empty (0 logs) stays seeding", () => {
    expect(deriveSignalState(null).state).toBe("seeding");
  });
});

describe("deriveSignalState — state resolution", () => {
  it("seeding: brand-new user with 0 lifetime moments", () => {
    const r = makeReport({ totalMoments: 0, lifetimeMoments: 0, dataQuality: { confidence: "too_early", daysLogged: 0 } });
    expect(deriveSignalState(r).state).toBe("seeding");
  });

  it("dormant: stale confidence (silent returning user)", () => {
    const r = makeReport({ dataQuality: { confidence: "stale", daysLogged: 0 }, silenceWindow: { daysSinceLastLog: 9 } });
    const s = deriveSignalState(r);
    expect(s.state).toBe("dormant");
    expect(s.meta.silenceDays).toBe(9);
  });

  it("forming (pending): offline shell — moments but no server analysis", () => {
    const r = {
      totalMoments: 9,
      lifetimeMoments: 9,
      dataQuality: { confidence: "moderate", daysLogged: 4 },
      // no correlations / baselineMetrics / frictionZones → analysis not ready
    };
    const s = deriveSignalState(r);
    expect(s.state).toBe("forming");
    expect(s.meta.pending).toBe(true);
    expect(s.barometer.enoughData).toBe(false);
  });

  it("forming: low confidence even with analysis present", () => {
    const r = makeReport({ totalMoments: 4, dataQuality: { confidence: "low", daysLogged: 2 } });
    expect(deriveSignalState(r).state).toBe("forming");
  });

  it("steady: enough data, no friction, no concern", () => {
    const r = makeReport({
      volatilityLabel: "steady",
      positiveStreak: { days: 3, startDate: "2026-06-20" },
    });
    expect(deriveSignalState(r).state).toBe("steady");
  });

  it("pattern: a recurring friction link (count>=3)", () => {
    const r = makeReport({
      frictionZones: [{ trigger: "work", emotion: "frustrated", count: 4 }],
    });
    const s = deriveSignalState(r);
    expect(s.state).toBe("pattern");
    expect(s.connected.friction[0]).toMatchObject({ trigger: "work", emotion: "frustrated", strength: "recurring" });
    expect(s.headline.vars).toMatchObject({ trigger: "work", emotion: "frustrated" });
  });

  it("building: crash-risk concern + non-steady barometer", () => {
    const r = makeReport({
      dataQuality: { confidence: "strong", daysLogged: 6 },
      frictionZones: [{ trigger: "work", emotion: "frustrated", count: 3 }],
      compoundPatterns: { crashRisk: true, falseRecovery: false, maskingLevel: "moderate" },
      invokedMetrics: { vacuumDrift: -0.6 },
      baselineMetrics: { baseline: { score: 3, reliable: true }, drift: { value: -0.5, direction: "declining" } },
      negativeStreak: { days: 3, startDate: "2026-06-21" },
    });
    const s = deriveSignalState(r);
    expect(s.state).toBe("building");
    expect(s.barometer.band).toBe("building");
    expect(s.barometer.concerns).toContain("crashRisk");
  });

  it("building does NOT fire on thin data even if a flag is set", () => {
    const r = makeReport({
      dataQuality: { confidence: "low", daysLogged: 2 },
      compoundPatterns: { crashRisk: true },
      baselineMetrics: { baseline: { score: 3, reliable: false }, drift: null },
    });
    // low confidence → never escalates to building
    expect(deriveSignalState(r).state).toBe("forming");
  });
});

describe("deriveSignalState — barometer honesty", () => {
  it("never exposes a percentage; only band + direction + confidence", () => {
    const s = deriveSignalState(makeReport());
    expect(["steady", "shifting", "building"]).toContain(s.barometer.band);
    expect(["easing", "holding", "rising"]).toContain(s.barometer.direction);
    expect(s.barometer.pressure).toBeGreaterThanOrEqual(0);
    expect(s.barometer.pressure).toBeLessThanOrEqual(1);
  });

  it("declining drift raises pressure; improving drift eases it", () => {
    const declining = deriveSignalState(makeReport({ baselineMetrics: { baseline: { score: 3, reliable: true }, drift: { value: -0.9, direction: "declining" } } }));
    const improving = deriveSignalState(makeReport({ baselineMetrics: { baseline: { score: 3, reliable: true }, drift: { value: 0.9, direction: "improving" } } }));
    expect(declining.barometer.pressure).toBeGreaterThan(improving.barometer.pressure);
    expect(declining.barometer.direction).toBe("rising");
    expect(improving.barometer.direction).toBe("easing");
  });
});

describe("deriveSignalState — divergence (vacuum under surface)", () => {
  it("builds the surface/ground series when invoked layer present", () => {
    const r = makeReport({
      weeklyEmotionTrajectory: [
        { date: "2026-06-21", score: 4.0 },
        { date: "2026-06-22", score: 4.1 },
        { date: "2026-06-23", score: 4.2 },
      ],
      invokedMetrics: {
        vacuumDrift: -0.6,
        vacuumTrajectory: [
          { date: "2026-06-21", vacuum: 3.4 },
          { date: "2026-06-22", vacuum: 3.3 },
          { date: "2026-06-23", vacuum: 3.2 },
        ],
      },
    });
    const d = deriveSignalState(r).barometer.divergence;
    expect(d).not.toBeNull();
    expect(d.points).toHaveLength(3);
    expect(d.gap).toBeCloseTo(1.0, 1);
    expect(d.diverging).toBe(true);
  });

  it("returns null divergence when invoked layer missing", () => {
    expect(deriveSignalState(makeReport()).barometer.divergence).toBeNull();
  });
});

describe("deriveSignalState — connected map & action bridge", () => {
  it("falls back to longitudinal friction when the week is quiet", () => {
    const r = makeReport({
      frictionZones: [],
      mirror: { frictionZones: [{ trigger: "money", emotion: "anxious", count: 5 }] },
    });
    const s = deriveSignalState(r);
    expect(s.connected.friction[0]).toMatchObject({ trigger: "money", emotion: "anxious", span: "recent" });
  });

  it("picks an action tied to the top friction trigger when available", () => {
    const r = makeReport({
      frictionZones: [{ trigger: "work", emotion: "frustrated", count: 3 }],
      actions: [
        { id: "centroid-rising-energy", type: "awareness", title: "x", reason: "y" },
        { id: "reg-work-exercise", type: "regulate", title: "z", reason: "w" },
      ],
    });
    expect(deriveSignalState(r).action.id).toBe("reg-work-exercise");
  });

  it("handles a completely empty report without throwing", () => {
    expect(() => deriveSignalState(null)).not.toThrow();
    expect(deriveSignalState(null).state).toBe("seeding");
    expect(() => deriveSignalState({})).not.toThrow();
  });

  it("handles tied top trigger (no dominant) by leaning on friction zones", () => {
    const r = makeReport({
      topTrigger: null,
      tiedTriggers: ["work", "family"],
      frictionZones: [{ trigger: "family", emotion: "anxious", count: 3 }],
    });
    const s = deriveSignalState(r);
    expect(s.connected.friction[0].trigger).toBe("family");
  });
});
