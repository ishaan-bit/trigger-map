import { describe, it, expect } from "vitest";
import en from "../../i18n/en.json";
import hi from "../../i18n/hi.json";
import { deriveSignalState } from "../triggerSignal.js";
import { buildHeadline, dormantBody, confidenceLabel, buildDrivers, buildChanges, buildWatch } from "../triggerCopy.js";

/* Mirror of LanguageContext.t: resolve dotted key + {var} interpolation. */
function makeT(dict) {
  const resolve = (path) => path.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), dict);
  return (key, vars) => {
    const v = resolve(key);
    if (typeof v !== "string") return key; // missing → returns the raw key (visible bug if it happens)
    return vars ? v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`)) : v;
  };
}

function report(over = {}) {
  return {
    totalMoments: 14,
    lifetimeMoments: 14,
    dataQuality: { confidence: "strong", daysLogged: 6 },
    correlations: { work: { frustrated: 4 } },
    baselineMetrics: { baseline: { score: 3, reliable: true }, drift: { value: -0.6, direction: "declining" } },
    frictionZones: [{ trigger: "work", emotion: "frustrated", count: 4 }],
    regulators: [{ trigger: "exercise", emotion: "calm", count: 3 }],
    recurrence: [{ trigger: "money", emotion: "anxious", count: 2, label: "emerging" }],
    negativeStreak: { days: 3, startDate: "2026-06-21" },
    weeklyDeltas: {
      triggerDeltas: { work: { current: 4, previous: 1, delta: 3 } },
      emotionDeltas: { frustrated: { current: 4, previous: 2, delta: 2 } },
    },
    invokedMetrics: { vacuumDrift: -0.6, contamination: [{ sourceTrigger: "work", targetTrigger: "family" }] },
    compoundPatterns: { crashRisk: true, maskingLevel: "moderate" },
    actions: [{ id: "reg-work-exercise", type: "regulate", title: "Walk it off", reason: "A short walk after work helps." }],
    ...over,
  };
}

for (const [lang, dict] of [["en", en], ["hi", hi]]) {
  describe(`triggerCopy (${lang}) — no missing keys, interpolation resolves`, () => {
    const t = makeT(dict);

    it("pattern/building signal produces fully-resolved copy", () => {
      const signal = deriveSignalState(report());
      const head = buildHeadline(signal, t);
      const conf = confidenceLabel(signal, t);
      const drivers = buildDrivers(signal, t);
      const changes = buildChanges(signal, t);
      const watch = buildWatch(signal, t);

      // None of these should equal a raw "triggerMap.*" key path.
      const all = [head.title, head.body, conf, ...drivers, ...changes, ...watch];
      for (const s of all) {
        expect(typeof s).toBe("string");
        expect(s.startsWith("triggerMap.")).toBe(false);
        expect(s).not.toMatch(/\{(trigger|emotion|days|delta|source|target|count)\}/); // no leftover placeholders
      }
      expect(drivers.length).toBeGreaterThan(0);
      expect(changes.length).toBeGreaterThan(0);
    });

    it("reflection (1 log) headline interpolates the logged area + feeling", () => {
      const signal = deriveSignalState({
        lifetimeMoments: 1, totalMoments: 1, topTrigger: "work", topEmotion: "frustrated",
        triggerFrequency: { work: 1 }, emotionFrequency: { frustrated: 1 },
        correlations: {}, frictionZones: [], dataQuality: { confidence: "too_early", daysLogged: 1 },
      });
      expect(signal.state).toBe("reflection");
      const head = buildHeadline(signal, t);
      expect(head.title.startsWith("triggerMap.")).toBe(false);
      expect(head.body.startsWith("triggerMap.")).toBe(false);
      expect(head.body).not.toMatch(/\{(trigger|emotion)\}/);
      expect(confidenceLabel(signal, t).startsWith("triggerMap.")).toBe(false);
    });

    it("thread (2-log echo) headline resolves and stays provisional", () => {
      const signal = deriveSignalState({
        lifetimeMoments: 2, totalMoments: 2, topTrigger: "work", topEmotion: "frustrated",
        triggerFrequency: { work: 2 }, emotionFrequency: { frustrated: 2 },
        correlations: {}, frictionZones: [], dataQuality: { confidence: "too_early", daysLogged: 1 },
      });
      expect(signal.state).toBe("thread");
      expect(signal.seed.echo).toBe(true);
      const head = buildHeadline(signal, t);
      expect(head.body.startsWith("triggerMap.")).toBe(false);
      expect(head.body).not.toMatch(/\{(trigger|emotion)\}/);
      expect(confidenceLabel(signal, t).startsWith("triggerMap.")).toBe(false);
    });

    it("every state's headline resolves (no raw keys)", () => {
      const states = {
        seeding: report({ totalMoments: 0, lifetimeMoments: 0, dataQuality: { confidence: "too_early", daysLogged: 0 }, correlations: undefined, baselineMetrics: undefined, frictionZones: undefined }),
        reflection: { lifetimeMoments: 1, totalMoments: 1, topTrigger: "money", topEmotion: "anxious", triggerFrequency: { money: 1 }, emotionFrequency: { anxious: 1 }, correlations: {}, frictionZones: [], dataQuality: { confidence: "too_early", daysLogged: 1 } },
        thread: { lifetimeMoments: 2, totalMoments: 2, triggerFrequency: { work: 1, money: 1 }, emotionFrequency: { anxious: 1, frustrated: 1 }, correlations: {}, frictionZones: [], dataQuality: { confidence: "too_early", daysLogged: 1 } },
        dormant: report({ dataQuality: { confidence: "stale", daysLogged: 0 }, silenceWindow: { daysSinceLastLog: 8 } }),
        steady: report({ frictionZones: [], compoundPatterns: undefined, invokedMetrics: undefined, negativeStreak: null, baselineMetrics: { baseline: { score: 3, reliable: true }, drift: { value: 0, direction: "stable" } }, volatilityLabel: "steady" }),
        forming: report({ totalMoments: 4, dataQuality: { confidence: "low", daysLogged: 2 } }),
        pattern: report({ compoundPatterns: undefined, invokedMetrics: undefined, negativeStreak: null, baselineMetrics: { baseline: { score: 3, reliable: true }, drift: { value: 0, direction: "stable" } } }),
      };
      for (const [name, r] of Object.entries(states)) {
        const signal = deriveSignalState(r);
        const head = buildHeadline(signal, t);
        expect(head.title.startsWith("triggerMap."), `${name}.title`).toBe(false);
        expect(head.body.startsWith("triggerMap."), `${name}.body`).toBe(false);
        if (name === "dormant") {
          const db = dormantBody(signal, t);
          expect(db.startsWith("triggerMap.")).toBe(false);
          expect(db).toContain("8"); // days interpolated
        }
      }
    });
  });
}
