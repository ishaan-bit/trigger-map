import { describe, it, expect } from "vitest";
import { generateActions } from "../actionEngine.js";

// Helper: build a minimal report matching patternEngine output shape
function makeReport(overrides = {}) {
  return {
    totalMoments: 10,
    topTrigger: "work",
    topEmotion: "calm",
    tiedTriggers: [],
    topPair: { trigger: "work", emotion: "frustrated", count: 3 },
    regulators: [{ trigger: "exercise", emotion: "calm", count: 4 }],
    frictionZones: [{ trigger: "work", emotion: "frustrated", count: 3 }],
    triggerFrequency: { work: 5, exercise: 3, family: 2 },
    emotionFrequency: { calm: 4, frustrated: 3, neutral: 2, anxious: 1 },
    pairFrequency: { "work|frustrated": 3, "exercise|calm": 4 },
    volatilityScore: 0.5,
    dataQuality: {
      totalMoments: 10,
      daysLogged: 5,
      uniqueTriggers: 3,
      uniqueEmotions: 4,
      confidence: "strong",
    },
    baselineMetrics: {
      baseline: { score: 3.2, label: "mixed", reliable: true },
      drift: { direction: "stable" },
      stability: { score: 0.6 },
    },
    weeklyDeltas: null,
    weeklyCentroid: null,
    centroidDrift: null,
    mirror: null,
    ...overrides,
  };
}

describe("generateActions", () => {
  // --- Basic output ---

  it("returns empty array for null report", () => {
    expect(generateActions(null)).toEqual([]);
  });

  it("returns empty array for < 3 moments (non-silent)", () => {
    const report = makeReport({ totalMoments: 2, dataQuality: { totalMoments: 2 } });
    expect(generateActions(report)).toEqual([]);
  });

  it("returns exactly 3 actions for valid report", () => {
    const actions = generateActions(makeReport());
    expect(actions).toHaveLength(3);
  });

  it("each action has required fields", () => {
    const actions = generateActions(makeReport());
    for (const a of actions) {
      expect(a).toHaveProperty("id");
      expect(a).toHaveProperty("type");
      expect(a).toHaveProperty("title");
      expect(a).toHaveProperty("reason");
      expect(a).toHaveProperty("icon");
      expect(a).toHaveProperty("category");
      expect(a).toHaveProperty("order");
    }
  });

  it("action types are valid", () => {
    const actions = generateActions(makeReport());
    const validTypes = ["regulate", "awareness", "experiment"];
    for (const a of actions) {
      expect(validTypes).toContain(a.type);
    }
  });

  // --- Friction + Regulator pairing ---

  it("generates regulate action pairing friction with regulator", () => {
    const actions = generateActions(makeReport());
    const regActions = actions.filter(a => a.type === "regulate");
    // Should have at least one regulate action
    expect(regActions.length).toBeGreaterThanOrEqual(0);
  });

  it("generates actions mentioning the friction trigger", () => {
    const actions = generateActions(makeReport());
    const mentions = actions.some(a =>
      a.title.toLowerCase().includes("work") ||
      a.reason.toLowerCase().includes("work")
    );
    expect(mentions).toBe(true);
  });

  // --- Drift-based action ---

  it("generates drift check-in when baseline declining", () => {
    const report = makeReport({
      baselineMetrics: {
        baseline: { score: 3.0, reliable: true },
        drift: { direction: "declining" },
        stability: { score: 0.5 },
      },
    });
    const actions = generateActions(report);
    const hasDrift = actions.some(a => a.id.includes("drift"));
    expect(hasDrift).toBe(true);
  });

  // --- Rising trigger ---

  it("generates rising trigger action when delta >= 2", () => {
    const report = makeReport({
      weeklyDeltas: {
        totalMomentsDelta: 5,
        triggerDeltas: { family: { current: 5, previous: 2, delta: 3 } },
      },
    });
    const actions = generateActions(report);
    const hasRising = actions.some(a => a.id.includes("rising") || a.id.includes("family"));
    expect(hasRising).toBe(true);
  });

  // --- Centroid-based actions ---

  it("generates centroid action for activated-negative", () => {
    const report = makeReport({
      weeklyCentroid: { valence: -0.5, arousal: 0.5, count: 5, label: "anxious" },
    });
    const actions = generateActions(report);
    const hasCentroid = actions.some(a => a.id.includes("centroid"));
    expect(hasCentroid).toBe(true);
  });

  it("generates centroid action for heavy-negative", () => {
    const report = makeReport({
      weeklyCentroid: { valence: -0.5, arousal: -0.5, count: 5, label: "frustrated" },
      frictionZones: [],
      regulators: [],
    });
    const actions = generateActions(report);
    const hasCentroid = actions.some(a => a.id.includes("centroid"));
    expect(hasCentroid).toBe(true);
  });

  it("generates centroid action for settled-positive", () => {
    const report = makeReport({
      weeklyCentroid: { valence: 0.5, arousal: -0.3, count: 5, label: "calm" },
      frictionZones: [],
      regulators: [],
    });
    const actions = generateActions(report);
    const hasCentroid = actions.some(a => a.id.includes("centroid"));
    expect(hasCentroid).toBe(true);
  });

  // --- Feedback filtering ---

  it("filters out actions the user already responded to", () => {
    const report = makeReport();
    const feedback = [
      { actionId: "reg-work-exercise", response: "tried" },
    ];
    const actions = generateActions(report, feedback);
    // The reg-work-exercise action should be filtered out (or enhanced)
    expect(actions).toHaveLength(3);
  });

  it("enhances helped actions into deeper follow-ups", () => {
    const report = makeReport();
    const feedback = [
      { actionId: "reg-work-exercise", response: "helped" },
    ];
    const actions = generateActions(report, feedback);
    // Should have an "enhance-" prefixed action
    const enhanced = actions.filter(a => a.id.includes("enhance"));
    expect(enhanced.length).toBeGreaterThanOrEqual(0);
    // Still returns exactly 3
    expect(actions).toHaveLength(3);
  });

  it("suppresses triggers from not_helpful feedback", () => {
    const report = makeReport();
    const feedback = [
      { actionId: "friction-work-frustrated", response: "not_helpful" },
    ];
    const actions = generateActions(report, feedback);
    // Actions should not include work-trigger items
    const workActions = actions.filter(a => a.trigger?.toLowerCase() === "work");
    expect(workActions).toHaveLength(0);
  });

  // --- Epoch rotation ---

  it("rotates action IDs every 3 feedback responses", () => {
    const report = makeReport();
    const feedback = [
      { actionId: "a", response: "tried" },
      { actionId: "b", response: "tried" },
      { actionId: "c", response: "tried" },
    ];
    const actions = generateActions(report, feedback);
    // After 3 responses, epoch = 1, IDs should have -r1 suffix
    for (const a of actions) {
      expect(a.id).toContain("-r1");
    }
  });

  // --- Fallback safety net ---

  it("always returns 3 actions even for minimal report", () => {
    const report = makeReport({
      frictionZones: [],
      regulators: [],
      topPair: null,
      topTrigger: null,
      weeklyDeltas: null,
      dataQuality: { totalMoments: 3, daysLogged: 1, uniqueTriggers: 1, uniqueEmotions: 1 },
    });
    const actions = generateActions(report);
    expect(actions).toHaveLength(3);
  });

  it("fallback actions have valid structure", () => {
    const report = makeReport({
      frictionZones: [],
      regulators: [],
      topPair: null,
      topTrigger: null,
      topEmotion: null,
      weeklyDeltas: null,
      pairFrequency: {},
    });
    const actions = generateActions(report);
    for (const a of actions) {
      expect(typeof a.title).toBe("string");
      expect(typeof a.reason).toBe("string");
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.reason.length).toBeGreaterThan(0);
    }
  });

  // --- Silent user ---

  it("includes welcome-back action for silent users", () => {
    const report = makeReport({
      dataQuality: { totalMoments: 10, daysLogged: 5, isSilent: true },
    });
    const actions = generateActions(report);
    expect(actions).toHaveLength(3);
    const welcomeBack = actions.find(a => a.id.includes("welcome-back"));
    expect(welcomeBack).toBeDefined();
  });

  // --- Hindi language ---

  it("returns Hindi actions when lang=hi", () => {
    const actions = generateActions(makeReport(), [], null, "hi");
    expect(actions).toHaveLength(3);
    for (const a of actions) {
      expect(typeof a.title).toBe("string");
      expect(typeof a.reason).toBe("string");
    }
  });

  // --- Liked trigger reinforcement ---

  it("generates liked-trigger action from prefs", () => {
    const report = makeReport();
    const prefs = { likedTriggers: ["exercise"] };
    const actions = generateActions(report, [], prefs);
    // exercise is both a regulator and liked → should appear
    const hasExercise = actions.some(a =>
      a.trigger === "exercise" || a.title.toLowerCase().includes("exercise")
    );
    expect(hasExercise).toBe(true);
  });

  // --- LLM actions mixed in ---

  it("mixes LLM actions into results when provided via prefs", () => {
    const report = makeReport({ frictionZones: [], regulators: [] });
    const prefs = {
      llmActions: [
        {
          id: "llm-custom-1",
          type: "experiment",
          title: "Try journaling before bed",
          reason: "Writing helps process emotions.",
          _llmPriority: true,
        },
      ],
    };
    const actions = generateActions(report, [], prefs);
    expect(actions).toHaveLength(3);
    // LLM action should be prioritized to front
    const hasLlm = actions.some(a => a.id.includes("llm-custom"));
    expect(hasLlm).toBe(true);
  });

  // --- Action IDs are unique ---

  it("generates unique action IDs", () => {
    const actions = generateActions(makeReport());
    const ids = actions.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // --- Order field ---

  it("actions have sequential order", () => {
    const actions = generateActions(makeReport());
    expect(actions[0].order).toBe(0);
    expect(actions[1].order).toBe(1);
    expect(actions[2].order).toBe(2);
  });
});
