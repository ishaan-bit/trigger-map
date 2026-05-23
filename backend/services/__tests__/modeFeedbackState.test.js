import { describe, expect, it } from "vitest";
import {
  applyModeFeedbackToResults,
  buildModeFeedbackMap,
  isRuleBasedModeOutput,
  latestModeFeedback,
} from "../modeFeedbackState.js";

describe("modeFeedbackState", () => {
  it("keeps the latest response for a mode item", () => {
    const latest = latestModeFeedback([
      { mode: "move", itemId: "walk", response: "not_helpful", timestamp: 100 },
      { mode: "move", itemId: "walk", response: "helpful", timestamp: 200 },
    ], { now: 300, windowMs: 1000 });

    expect(latest.get("move:walk").response).toBe("helpful");
  });

  it("filters dismissed Move and Fuel items from returned mode output", () => {
    const now = Date.now();
    const results = {
      move: { items: [{ id: "walk" }, { id: "stretch" }] },
      fuel: { items: [{ id: "tea" }, { id: "oats" }] },
    };

    const filtered = applyModeFeedbackToResults(results, [
      { mode: "move", itemId: "walk", response: "not_helpful", timestamp: now - 100 },
      { mode: "fuel", itemId: "tea", response: "not_helpful", timestamp: now - 100 },
    ]);

    expect(filtered.move.items.map((item) => item.id)).toEqual(["stretch"]);
    expect(filtered.fuel.items.map((item) => item.id)).toEqual(["oats"]);
  });

  it("returns Move and Fuel dismissal state even when the item is not in current output", () => {
    const now = Date.now();
    const map = buildModeFeedbackMap({
      move: { generatedAt: new Date(500).toISOString(), items: [{ id: "stretch" }] },
      fuel: { generatedAt: new Date(500).toISOString(), items: [{ id: "oats" }] },
    }, [
      { mode: "move", itemId: "walk", response: "not_helpful", timestamp: now - 100 },
      { mode: "fuel", itemId: "tea", response: "not_helpful", timestamp: now - 100 },
    ], ["move", "fuel"]);

    expect(map).toEqual({ walk: "not_helpful", tea: "not_helpful" });
  });

  it("restores helpful state for current Move and Fuel items across refetch", () => {
    const now = Date.now();
    const map = buildModeFeedbackMap({
      move: { generatedAt: new Date(500).toISOString(), items: [{ id: "walk" }] },
      fuel: { generatedAt: new Date(500).toISOString(), items: [{ id: "tea" }] },
    }, [
      { mode: "move", itemId: "walk", response: "helpful", timestamp: now - 100 },
      { mode: "fuel", itemId: "tea", response: "helpful", timestamp: now - 100 },
    ], ["move", "fuel"]);

    expect(map).toEqual({ walk: "helpful", tea: "helpful" });
  });

  it("recognizes rule-based outputs without treating LLM model names as rule output", () => {
    expect(isRuleBasedModeOutput({ source: "rule" })).toBe(true);
    expect(isRuleBasedModeOutput({ model: "rule-based" })).toBe(true);
    expect(isRuleBasedModeOutput({ model: "phi3" })).toBe(false);
    expect(isRuleBasedModeOutput({ source: "llm", model: "phi3" })).toBe(false);
  });
});
