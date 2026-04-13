import { describe, it, expect } from "vitest";
import { createMomentPayload } from "../momentService.js";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS, EMOTION_COORDINATES, coordinatesToLegacy } from "@triggermap/shared/constants/emotions";

describe("createMomentPayload", () => {
  const base = { ownerId: "user-1", trigger: "work", emotion: "calm", note: "" };

  it("returns all required fields", () => {
    const m = createMomentPayload(base);
    expect(m).toHaveProperty("id");
    expect(m).toHaveProperty("ownerId", "user-1");
    expect(m).toHaveProperty("trigger");
    expect(m).toHaveProperty("emotion");
    expect(m).toHaveProperty("valence");
    expect(m).toHaveProperty("arousal");
    expect(m).toHaveProperty("intensity");
    expect(m).toHaveProperty("derivedLabel");
    expect(m).toHaveProperty("timestamp");
    expect(m).toHaveProperty("isAnonymous");
  });

  it("generates unique IDs", () => {
    const m1 = createMomentPayload(base);
    const m2 = createMomentPayload(base);
    expect(m1.id).not.toBe(m2.id);
  });

  // --- Trigger validation ---

  it("accepts valid trigger", () => {
    const m = createMomentPayload({ ...base, trigger: "family" });
    expect(m.trigger).toBe("family");
  });

  it("falls back to 'work' for invalid trigger with empty note", () => {
    const m = createMomentPayload({ ...base, trigger: "invalid_trigger", note: "" });
    expect(m.trigger).toBe("work");
  });

  it("detects trigger from note when trigger is invalid", () => {
    const m = createMomentPayload({
      ...base,
      trigger: "invalid",
      note: "Had a fight with my partner today",
    });
    // Should detect "partner" from the note
    expect(TRIGGERS).toContain(m.trigger);
  });

  it("all valid triggers are accepted", () => {
    for (const t of TRIGGERS) {
      const m = createMomentPayload({ ...base, trigger: t });
      expect(m.trigger).toBe(t);
    }
  });

  // --- Emotion mapping (legacy string) ---

  it("accepts valid emotion string", () => {
    for (const e of EMOTIONS) {
      const m = createMomentPayload({ ...base, emotion: e });
      expect(m.emotion).toBe(e);
    }
  });

  it("falls back to neutral for invalid emotion string", () => {
    const m = createMomentPayload({ ...base, emotion: "blissful" });
    expect(m.emotion).toBe("neutral");
  });

  it("maps valid emotion to its coordinates", () => {
    const m = createMomentPayload({ ...base, emotion: "calm" });
    expect(m.valence).toBe(EMOTION_COORDINATES.calm.valence);
    expect(m.arousal).toBe(EMOTION_COORDINATES.calm.arousal);
  });

  // --- Continuous model (valence + arousal) ---

  it("uses coordinatesToLegacy when valence/arousal provided", () => {
    const m = createMomentPayload({
      ...base,
      valence: 0.8,
      arousal: -0.5,
      emotion: undefined,
    });
    expect(m.emotion).toBe(coordinatesToLegacy(0.8, -0.5));
    expect(m.valence).toBe(0.8);
    expect(m.arousal).toBe(-0.5);
  });

  it("prefers continuous model over legacy emotion when both present", () => {
    const m = createMomentPayload({
      ...base,
      valence: -0.8,
      arousal: 0.9,
      emotion: "calm", // should be ignored
    });
    // With v=-0.8, a=0.9 → should map to anxious, not calm
    expect(m.emotion).toBe(coordinatesToLegacy(-0.8, 0.9));
    expect(m.valence).toBe(-0.8);
    expect(m.arousal).toBe(0.9);
  });

  it("ignores valence/arousal if only one is provided", () => {
    const m = createMomentPayload({ ...base, valence: 0.5, emotion: "frustrated" });
    expect(m.emotion).toBe("frustrated");
    // arousal not provided, so should NOT use continuous model
  });

  // --- Intensity ---

  it("uses provided intensity when given", () => {
    const m = createMomentPayload({ ...base, intensity: 0.75 });
    expect(m.intensity).toBe(0.75);
  });

  it("computes intensity from coordinates when not provided", () => {
    const m = createMomentPayload({ ...base, emotion: "calm" });
    const expectedIntensity = Math.sqrt(
      EMOTION_COORDINATES.calm.valence ** 2 +
      EMOTION_COORDINATES.calm.arousal ** 2
    );
    expect(m.intensity).toBeCloseTo(expectedIntensity, 5);
  });

  // --- Timestamp ---

  it("uses occurredAt when provided", () => {
    const ts = "2025-03-15T10:30:00Z";
    const m = createMomentPayload({ ...base, occurredAt: ts });
    expect(m.timestamp).toBe(new Date(ts).toISOString());
  });

  it("defaults to current time when occurredAt not provided", () => {
    const before = Date.now();
    const m = createMomentPayload(base);
    const after = Date.now();
    const mTime = new Date(m.timestamp).getTime();
    expect(mTime).toBeGreaterThanOrEqual(before);
    expect(mTime).toBeLessThanOrEqual(after);
  });

  // --- Tags ---

  it("includes tags when provided", () => {
    const m = createMomentPayload({ ...base, tags: ["stress", "deadline"] });
    expect(m.tags).toEqual(["stress", "deadline"]);
  });

  it("omits tags field when not provided", () => {
    const m = createMomentPayload(base);
    expect(m).not.toHaveProperty("tags");
  });

  it("omits tags field when empty array", () => {
    const m = createMomentPayload({ ...base, tags: [] });
    expect(m).not.toHaveProperty("tags");
  });

  // --- isAnonymous ---

  it("defaults isAnonymous to false", () => {
    const m = createMomentPayload(base);
    expect(m.isAnonymous).toBe(false);
  });

  it("sets isAnonymous from input", () => {
    const m = createMomentPayload({ ...base, isAnonymous: true });
    expect(m.isAnonymous).toBe(true);
  });

  // --- derivedLabel ---

  it("sets derivedLabel from continuous model", () => {
    const m = createMomentPayload({ ...base, valence: 0.5, arousal: 0.3 });
    expect(typeof m.derivedLabel).toBe("string");
    expect(m.derivedLabel.length).toBeGreaterThan(0);
  });

  it("sets derivedLabel to emotion for legacy model", () => {
    const m = createMomentPayload({ ...base, emotion: "frustrated" });
    expect(m.derivedLabel).toBe("frustrated");
  });

  // --- Note sanitization ---

  it("defaults note to empty string when not provided", () => {
    const m = createMomentPayload({ ...base, note: undefined });
    expect(m.note).toBe("");
  });
});
