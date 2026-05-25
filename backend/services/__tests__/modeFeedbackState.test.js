import { describe, expect, it } from "vitest";
import {
  applyModeFeedbackToResults,
  buildModeFeedbackByMode,
  buildModeFeedbackMap,
  feedbackPreferenceIds,
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

  it("keeps Move and Fuel helpful state even when library backfill displays the item later", () => {
    const now = Date.now();
    const map = buildModeFeedbackMap({
      fuel: { generatedAt: new Date(500).toISOString(), items: [{ id: "oats" }] },
    }, [
      { mode: "fuel", itemId: "chicken_broth", response: "helpful", timestamp: now - 100 },
    ], ["fuel"]);

    expect(map).toEqual({ chicken_broth: "helpful" });
  });

  it("can return feedback scoped by mode for clients that render local backfill items", () => {
    const now = Date.now();
    const byMode = buildModeFeedbackByMode({}, [
      { mode: "move", itemId: "walk", response: "helpful", timestamp: now - 100 },
      { mode: "fuel", itemId: "walk", response: "not_helpful", timestamp: now - 50 },
    ], ["move", "fuel"]);

    expect(byMode.move).toEqual({ walk: "helpful" });
    expect(byMode.fuel).toEqual({ walk: "not_helpful" });
  });

  it("derives latest preference IDs for generation prompts and selection", () => {
    const prefs = feedbackPreferenceIds([
      { mode: "fuel", itemId: "eggs", response: "not_helpful", timestamp: 100 },
      { mode: "fuel", itemId: "eggs", response: "helpful", timestamp: 200 },
      { mode: "fuel", itemId: "soda", response: "not_helpful", timestamp: 250 },
    ], "fuel", { now: 300, windowMs: 1000 });

    expect(prefs).toEqual({ liked: ["eggs"], disliked: ["soda"] });
  });

  it("recognizes rule-based outputs without treating LLM model names as rule output", () => {
    expect(isRuleBasedModeOutput({ source: "rule" })).toBe(true);
    expect(isRuleBasedModeOutput({ model: "rule-based" })).toBe(true);
    expect(isRuleBasedModeOutput({ model: "phi3" })).toBe(false);
    expect(isRuleBasedModeOutput({ source: "llm", model: "phi3" })).toBe(false);
  });
});
