import { describe, expect, it } from "vitest";
import { buildRecentNotes, toStoredLlmInsightPayload } from "../generateLlmInsights.js";

describe("LLM insight job helpers", () => {
  it("bounds recent note examples before prompt construction", () => {
    const moments = Array.from({ length: 20 }, (_, index) => ({
      trigger: "work",
      emotion: "calm",
      derivedLabel: "calm",
      note: `${index}-` + "x".repeat(1000),
      contributionTags: ["sleep"],
    }));

    const notes = buildRecentNotes(moments);

    expect(notes).toHaveLength(8);
    expect(notes.every((note) => note.note.length <= 120)).toBe(true);
  });

  it("keeps stored insight payload shape free of diagnostics", () => {
    const stored = toStoredLlmInsightPayload({
      narrative: "What stood out\nA calm pattern.",
      sectionCount: 1,
      model: "llm-phi3",
      generatedAt: "2026-05-26T00:00:00.000Z",
      diagnostics: { promptCharCount: 1234 },
      promptDiagnostics: { approximateTokenEstimate: 309 },
    });

    expect(stored).toEqual({
      narrative: "What stood out\nA calm pattern.",
      sectionCount: 1,
      model: "llm-phi3",
      generatedAt: "2026-05-26T00:00:00.000Z",
    });
  });
});
