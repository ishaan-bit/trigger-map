import { describe, expect, it } from "vitest";
import {
  BATCH_LOG_TTL,
  buildBatchLogRedisCommands,
  buildTerminalPairLog,
  createBatchSummary,
  executeWithTimeout,
  finalizePairLog,
  isBatchLogVisibleWithinWindow,
  simplifyPair,
} from "../batchOrchestrator.js";

const NOW = new Date("2026-05-26T06:00:00.000Z").getTime();

function redisKey(...segments) {
  return `triggermap:${segments.join(":")}`;
}

function basePair(overrides = {}) {
  return {
    id: "pair-1",
    ownerId: "owner-123456789",
    process: "insights",
    status: "completed",
    error: null,
    startedAt: NOW - 1200,
    completedAt: NOW,
    durationMs: 1200,
    ...overrides,
  };
}

function opsVisibleSummary(pair) {
  const batch = {
    id: "batch-test",
    status: "done",
    startedAt: NOW - 2000,
    completedAt: NOW,
    pairs: [pair],
    completedCount: pair.status === "completed" ? 1 : 0,
    failedCount: pair.status === "completed" ? 0 : 1,
    incompleteCount: pair.status === "incomplete" ? 1 : 0,
    totalDurationMs: 2000,
  };
  return createBatchSummary(batch);
}

describe("LLM batch ops-visible logs", () => {
  it("persists a successful insight generation log in the existing batch shape", () => {
    const pair = basePair({
      result: {
        ok: true,
        model: "llm-phi3",
        sectionCount: 3,
        selectedSource: "aggregates",
        diagnostics: {
          status: "generated",
          selectedSource: "aggregates",
          promptCharCount: 1234,
          model: "phi3",
          provider: "ollama",
        },
      },
    });

    finalizePairLog(pair, { insights: { model: "phi3" } }, { result: pair.result, now: NOW });
    const summary = opsVisibleSummary(pair);
    const simplified = summary.pairs[0];

    expect(simplified.status).toBe("completed");
    expect(simplified.llmLog).toMatchObject({
      section: "insights",
      ownerIdPrefix: "owner-12",
      pairId: "pair-1",
      status: "generated",
      selectedSource: "aggregates",
      promptCharCount: 1234,
      model: "phi3",
      provider: "ollama",
    });
    expect(simplified.completedAt).toBe(NOW);
  });

  it("persists no-data and below-threshold skipped logs with terminal reasons", () => {
    for (const reason of ["no-data", "below-threshold (1 < 3)"]) {
      const pair = basePair({
        status: "skipped",
        error: reason,
        result: {
          skipped: true,
          reason,
          diagnostics: {
            status: "skipped",
            reason,
            selectedSource: "none",
            rawMomentCount: reason === "no-data" ? 0 : 1,
            rawQualifyingCount: reason === "no-data" ? 0 : 1,
          },
        },
      });

      finalizePairLog(pair, { insights: { model: "phi3" } }, { result: pair.result, now: NOW });
      const simplified = simplifyPair(pair);

      expect(simplified.status).toBe("skipped");
      expect(simplified.error).toBe(reason);
      expect(simplified.llmLog).toMatchObject({
        status: "skipped",
        reason,
        selectedSource: "none",
        section: "insights",
      });
    }
  });

  it("persists raw-fallback generation without private raw moment text", () => {
    const pair = basePair({
      result: {
        ok: true,
        model: "llm-phi3",
        selectedSource: "raw-fallback",
        diagnostics: {
          status: "generated",
          selectedSource: "raw-fallback",
          rawMomentCount: 8,
          rawQualifyingCount: 8,
          rawSelectedMomentCount: 5,
          promptCharCount: 4321,
        },
      },
    });

    finalizePairLog(pair, { insights: { model: "phi3" } }, { result: pair.result, now: NOW });
    const simplified = simplifyPair(pair);

    expect(simplified.llmLog).toMatchObject({
      status: "generated",
      selectedSource: "raw-fallback",
      promptCharCount: 4321,
    });
    expect(JSON.stringify(simplified)).not.toContain("note");
    expect(JSON.stringify(simplified)).not.toContain("rawText");
  });

  it("persists pair timeout logs with the expected terminal message", async () => {
    const pair = basePair({
      status: "running",
      completedAt: null,
      durationMs: null,
    });

    await expect(
      executeWithTimeout(pair, { insights: { model: "phi3" } }, {
        timeoutMs: 5,
        runner: () => new Promise(() => {}),
      })
    ).rejects.toMatchObject({ code: "PAIR_TIMEOUT", reason: "llm_timeout" });

    pair.status = "timeout";
    pair.error = "Pair timeout after 180s";
    pair.completedAt = NOW;
    pair.durationMs = 180000;
    finalizePairLog(pair, { insights: { model: "phi3" } }, {
      error: {
        code: "PAIR_TIMEOUT",
        reason: "llm_timeout",
        message: "Pair timeout after 180s",
        diagnostics: pair.diagnostics,
      },
      now: NOW,
    });

    expect(simplifyPair(pair).llmLog).toMatchObject({
      status: "timeout",
      reason: "llm_timeout",
      durationMs: 180000,
      message: "Pair timeout after 180s",
      section: "insights",
    });
  });

  it("aborts the running pair and carries owner-level diagnostics", async () => {
    const pair = basePair({
      id: "pair-abort",
      ownerId: "270a5bb6-9cdc-4a65-8a63-09f79d1bccaa",
      status: "running",
      completedAt: null,
      durationMs: null,
    });
    let sawAbort = false;

    await expect(executeWithTimeout(pair, { insights: { model: "phi3" } }, {
      timeoutMs: 20,
      runner: async (_pair, _config, { signal, onDiagnostics }) => {
        onDiagnostics({
          selectedSource: "raw-fallback",
          promptCharCount: 12345,
          approximateTokenEstimate: 3087,
        });
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
            reject(signal.reason);
          }, { once: true });
        });
      },
    })).rejects.toMatchObject({
      code: "PAIR_TIMEOUT",
      reason: "llm_timeout",
      diagnostics: {
        ownerIdPrefix: "270a5bb6",
        selectedSource: "raw-fallback",
        promptCharCount: 12345,
        approximateTokenEstimate: 3087,
        status: "timeout",
        reason: "llm_timeout",
      },
    });

    expect(sawAbort).toBe(true);
  });

  it("does not poison a later pair after one timeout", async () => {
    await expect(executeWithTimeout(basePair({ id: "pair-slow", status: "running" }), { insights: { model: "phi3" } }, {
      timeoutMs: 10,
      runner: async (_pair, _config, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    })).rejects.toMatchObject({ code: "PAIR_TIMEOUT" });

    await expect(executeWithTimeout(basePair({ id: "pair-fast", status: "running" }), { insights: { model: "phi3" } }, {
      timeoutMs: 100,
      runner: async () => ({ ok: true }),
    })).resolves.toEqual({ ok: true });
  });

  it("classifies thrown invalid JSON errors as terminal LLM logs", () => {
    const pair = basePair({
      status: "failed",
      error: "Mode child returned invalid JSON: Unexpected token",
    });
    const error = new Error("Mode child returned invalid JSON: Unexpected token");

    const log = buildTerminalPairLog(pair, { insights: { model: "phi3" } }, { error, now: NOW });

    expect(log).toMatchObject({
      status: "error",
      reason: "invalid_json",
      message: "Mode child returned invalid JSON: Unexpected token",
    });
  });

  it("builds Redis commands and a shape compatible with the ops logs reader", () => {
    const pair = basePair({
      result: { ok: true, selectedSource: "aggregates", diagnostics: { status: "generated" } },
    });
    finalizePairLog(pair, { insights: { model: "phi3" } }, { result: pair.result, now: NOW });
    const summary = opsVisibleSummary(pair);
    const commands = buildBatchLogRedisCommands(redisKey, summary);
    const saved = JSON.parse(commands[0][2]);

    expect(commands).toEqual([
      ["SET", "triggermap:llm_batch_log:batch-test", expect.any(String)],
      ["EXPIRE", "triggermap:llm_batch_log:batch-test", String(BATCH_LOG_TTL)],
      ["ZADD", "triggermap:llm_batch_logs", String(summary.startedAt), "batch-test"],
      ["ZREMRANGEBYRANK", "triggermap:llm_batch_logs", "0", "-31"],
    ]);
    expect(saved).toMatchObject({
      id: "batch-test",
      startedAt: NOW - 2000,
      completedAt: NOW,
      totalPairs: 1,
      pairs: [expect.objectContaining({
        id: "pair-1",
        ownerId: "owner-123456789",
        process: "insights",
        status: "completed",
        durationMs: 1200,
        completedAt: NOW,
        llmLog: expect.objectContaining({ status: "generated" }),
      })],
    });
  });

  it("keeps loaded logs inside the last 3 days window", () => {
    const fresh = { id: "fresh", startedAt: NOW - 1000 };
    const stale = { id: "stale", startedAt: NOW - (3 * 24 * 60 * 60 * 1000) - 1 };

    expect(isBatchLogVisibleWithinWindow(fresh, NOW)).toBe(true);
    expect(isBatchLogVisibleWithinWindow(stale, NOW)).toBe(false);
  });
});
