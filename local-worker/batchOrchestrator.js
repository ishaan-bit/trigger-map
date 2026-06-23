/**
 * LLM Batch Orchestrator
 *
 * Manages a queue of (userId, process) pairs, executes them sequentially
 * through the local Ollama LLM, tracks per-pair status, enforces max
 * runtime, and supports re-running failed/incomplete pairs.
 *
 * Processes: insights, actions, move, fuel, perspective
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { statSync } from "node:fs";
import { spawn } from "node:child_process";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, "..", "backend");

// Load backend .env so Redis config is available when we import backend modules
loadEnv({ path: resolve(BACKEND_DIR, ".env") });

// Dynamic imports for backend modules (resolved at runtime)
let _generateLlmInsightForUser;
let _generateForOwner;
let _redis;
let _redisKey;

function versionedBackendModuleUrl(...parts) {
  const filePath = resolve(BACKEND_DIR, ...parts);
  const url = pathToFileURL(filePath);
  url.searchParams.set("v", String(statSync(filePath).mtimeMs));
  return url.href;
}

async function ensureImports() {
  if (!_generateLlmInsightForUser) {
    const mod = await import(versionedBackendModuleUrl("jobs", "generateLlmInsights.js"));
    _generateLlmInsightForUser = mod.generateLlmInsightForUser;
  }
  if (!_generateForOwner) {
    const mod = await import(versionedBackendModuleUrl("jobs", "generateLlmActions.js"));
    _generateForOwner = mod.generateForOwner;
  }
  if (!_redis) {
    const mod = await import(versionedBackendModuleUrl("services", "redisClient.js"));
    _redis = mod.redis;
    _redisKey = mod.redisKey;
  }
}

function runModeOutputInChild(payload, { signal } = {}) {
  return new Promise((promiseResolve, reject) => {
    let settled = false;
    const child = spawn("node", [resolve(__dirname, "runModeOutput.js")], {
      cwd: BACKEND_DIR,
      env: { ...process.env, MODE_JOB_JSON: JSON.stringify(payload) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const cleanup = () => {
      signal?.removeEventListener?.("abort", onAbort);
    };
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      promiseResolve(value);
    };
    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const onAbort = () => {
      try { child.kill("SIGTERM"); } catch {}
      finishReject(signal.reason || new Error("Mode child aborted"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", finishReject);
    child.on("close", (code) => {
      if (settled) return;
      const resultLine = stdout.split(/\r?\n/).find((line) => line.startsWith("__MODE_RESULT__"));
      if (code === 0 && resultLine) {
        try {
          finishResolve(JSON.parse(resultLine.slice("__MODE_RESULT__".length)));
        } catch (err) {
          finishReject(new Error(`Mode child returned invalid JSON: ${err.message}`));
        }
        return;
      }

      const errorLine = stderr.split(/\r?\n/).find((line) => line.startsWith("__MODE_ERROR__"));
      finishReject(new Error(errorLine?.slice("__MODE_ERROR__".length) || stderr.trim() || stdout.trim() || `Mode child exited ${code}`));
    });
  });
}

// ── Batch state ────────────────────────────────────────────────────────

let currentBatch = null; // { id, pairs, config, startedAt, maxRuntimeMs, status, cancelRequested }
const batchHistory = []; // last N completed batches
const MAX_HISTORY = 10;

// Per-pair timeout: if a single LLM call takes > 3 min, abort it
export const PAIR_TIMEOUT_MS = 180_000;
export const BATCH_LOG_TTL = 3 * 24 * 60 * 60; // 3 days in seconds
export const LLM_BATCH_LOG_WINDOW_MS = BATCH_LOG_TTL * 1000;

class PairTimeoutError extends Error {
  constructor(pair, diagnostics) {
    super(`Pair timeout after ${PAIR_TIMEOUT_MS / 1000}s`);
    this.name = "PairTimeoutError";
    this.code = "PAIR_TIMEOUT";
    this.reason = "llm_timeout";
    this.diagnostics = diagnostics;
  }
}

function llmApiHost(apiUrl) {
  try {
    return new URL(apiUrl).host;
  } catch {
    return "invalid-url";
  }
}

function buildPairDiagnostics(pair, config, patch = {}) {
  const rowConfig = config[pair.process] || {};
  const model = rowConfig.model || process.env.LLM_MODEL || "phi3";
  const apiUrl = process.env.LLM_API_URL || "http://localhost:11434/v1";
  return {
    ...(pair.diagnostics || {}),
    pairId: pair.id,
    ownerIdPrefix: pair.ownerId ? pair.ownerId.slice(0, 8) : null,
    process: pair.process,
    section: pair.process === "insights" ? "insights" : pair.process,
    provider: "ollama",
    model,
    llmApiHost: llmApiHost(apiUrl),
    ...patch,
  };
}

function classifyErrorReason(error) {
  if (!error) return null;
  if (error.reason) return error.reason;
  if (error.code === "PAIR_TIMEOUT") return "llm_timeout";
  if (error.code === "LLM_UNAVAILABLE") return "llm_unavailable";
  if (error.code === "PROMPT_TOO_LARGE") return "prompt_too_large";

  const message = String(error.message || error);
  if (/invalid json/i.test(message)) return "invalid_json";
  if (/valid section|empty response|output only had/i.test(message)) return "invalid_json";
  if (/timed out|timeout/i.test(message)) return "llm_timeout";
  return "error";
}

function terminalStatusForPair(pair) {
  if (pair.status === "completed" && pair.process === "insights") return "generated";
  if (pair.status === "completed") return "completed";
  if (pair.status === "timeout") return "timeout";
  if (pair.status === "failed") return "error";
  return pair.status || "unknown";
}

function terminalMessage(pair, reason, error) {
  if (error?.message) return error.message;
  if (pair.error) return pair.error;
  if (reason) return reason;
  if (pair.process === "insights" && pair.status === "completed") return "LLM insight generated";
  if (pair.status === "completed") return "Run completed";
  return pair.status || "Run";
}

export function buildTerminalPairLog(pair, config = {}, { result, error, now = Date.now() } = {}) {
  const diagnostics = {
    ...(pair.diagnostics || {}),
    ...(result?.diagnostics || {}),
    ...(error?.diagnostics || {}),
  };
  const rowConfig = config[pair.process] || {};
  const status = terminalStatusForPair(pair);
  const reason = diagnostics.reason || result?.reason || classifyErrorReason(error);
  const completedAt = pair.completedAt || now;
  const durationMs = Number.isFinite(pair.durationMs)
    ? pair.durationMs
    : pair.startedAt
      ? completedAt - pair.startedAt
      : diagnostics.durationMs;
  const model = diagnostics.model || result?.model || rowConfig.model || process.env.LLM_MODEL || "phi3";

  return {
    timestamp: new Date(completedAt).toISOString(),
    section: pair.process === "insights" ? "insights" : pair.process,
    ownerIdPrefix: pair.ownerId ? pair.ownerId.slice(0, 8) : diagnostics.ownerIdPrefix || null,
    pairId: pair.id || diagnostics.pairId || null,
    process: pair.process,
    status,
    reason,
    durationMs,
    selectedSource: result?.selectedSource || diagnostics.selectedSource || null,
    promptCharCount: diagnostics.promptCharCount ?? null,
    model,
    provider: diagnostics.provider || "ollama",
    llmApiHost: diagnostics.llmApiHost || llmApiHost(process.env.LLM_API_URL || "http://localhost:11434/v1"),
    message: terminalMessage(pair, reason, error),
  };
}

export function finalizePairLog(pair, config = {}, context = {}) {
  const log = buildTerminalPairLog(pair, config, context);
  pair.llmLog = log;
  pair.timestamp = log.timestamp;
  pair.message = log.message;
  pair.reason = log.reason;
  pair.diagnostics = {
    ...(pair.diagnostics || {}),
    ...log,
  };
  return log;
}

/**
 * Estimate runtime for a set of pairs.
 * Based on empirical averages: ~30-45s per LLM call on phi3/GPU.
 */
export function estimateRuntime(pairs, config) {
  const MODEL_TIMES = {
    phi3: 35,
    gemma3: 45,
    gemma4: 60,
    mistral: 50,
    llama3: 55,
    llama2: 50,
    gemma: 40,
    qwen2: 45,
  };

  let totalSeconds = 0;
  for (const pair of pairs) {
    const rowConfig = config[pair.process] || {};
    const model = rowConfig.model || "phi3";
    const baseTime = MODEL_TIMES[model] || 45;

    // Perspective and insights have maxWords which affect runtime
    if (pair.process === "insights" || pair.process === "perspective") {
      const maxWords = rowConfig.maxWords || 100;
      const wordMultiplier = Math.max(0.8, maxWords / 100);
      totalSeconds += Math.round(baseTime * wordMultiplier);
    } else {
      totalSeconds += baseTime;
    }
  }

  // Add 2s overhead per pair for Redis reads
  totalSeconds += pairs.length * 2;

  return {
    totalPairs: pairs.length,
    estimatedSeconds: totalSeconds,
    estimatedMinutes: Math.ceil(totalSeconds / 60),
  };
}

/**
 * Start a new batch run.
 * @param {Array} pairs - [{id, ownerId, process, config}]
 * @param {Object} config - per-process config {insights: {model, maxWords, ...}, ...}
 * @param {number} maxRuntimeMinutes - max wall time before stopping
 * @returns {Object} batch status
 */
export async function startBatch(pairs, config, maxRuntimeMinutes) {
  if (currentBatch && currentBatch.status === "running") {
    throw new Error("A batch is already running");
  }

  await ensureImports();

  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const maxRuntimeMs = maxRuntimeMinutes * 60 * 1000;

  // Initialize all pairs
  const workItems = pairs.map((p, i) => ({
    id: p.id || `pair-${i}`,
    ownerId: p.ownerId,
    process: p.process,
    status: "pending",
    error: null,
    durationMs: null,
    startedAt: null,
    completedAt: null,
  }));

  currentBatch = {
    id: batchId,
    pairs: workItems,
    config,
    startedAt: Date.now(),
    maxRuntimeMs,
    status: "running",
    cancelRequested: false,
    currentIndex: 0,
    completedCount: 0,
    failedCount: 0,
    incompleteCount: 0,
  };

  // Run in background (don't await)
  executeBatch().catch((err) => {
    console.error(`[batch] Fatal error in batch ${batchId}: ${err.message}`);
    if (currentBatch && currentBatch.id === batchId) {
      currentBatch.status = "error";
      currentBatch.error = err.message;
      archiveBatch();
    }
  });

  return { batchId, totalPairs: workItems.length, status: "started" };
}

/**
 * Execute all pairs sequentially with timeout enforcement.
 */
async function executeBatch() {
  const batch = currentBatch;
  if (!batch) return;

  const deadline = batch.startedAt + batch.maxRuntimeMs;
  console.log(`[batch] Starting batch ${batch.id} — ${batch.pairs.length} pairs, deadline in ${Math.round(batch.maxRuntimeMs / 60000)}m`);

  for (let i = 0; i < batch.pairs.length; i++) {
    const pair = batch.pairs[i];
    batch.currentIndex = i;

    // Check cancel
    if (batch.cancelRequested) {
      markRemaining(batch.pairs, i, "incomplete", "cancelled", batch.config);
      break;
    }

    // Check timeout — but let at least 1 pair run
    if (i > 0 && Date.now() >= deadline) {
      console.log(`[batch] Deadline reached after ${i} pairs. Marking remaining as incomplete.`);
      markRemaining(batch.pairs, i, "incomplete", "timeout - max runtime exceeded", batch.config);
      break;
    }

    // Execute pair
    pair.status = "running";
    pair.startedAt = Date.now();
    let pairError = null;

    try {
      const result = await executeWithTimeout(pair, batch.config);

      // Detect skipped results (e.g. generateForOwner returns {skipped: true})
      if (result && result.skipped) {
        pair.status = "skipped";
        pair.error = result.reason || "skipped by backend";
        pair.result = result;
        pair.diagnostics = result.diagnostics || null;
        batch.failedCount++;
        console.log(`[batch] ⊘ ${pair.ownerId.slice(0, 8)}/${pair.process}: skipped — ${pair.error}`);
      } else {
        pair.status = "completed";
        pair.result = result;
        batch.completedCount++;
        console.log(`[batch] ✓ ${pair.ownerId.slice(0, 8)}/${pair.process} (${Date.now() - pair.startedAt}ms)`);
      }
    } catch (err) {
      pairError = err;
      pair.status = err.code === "PAIR_TIMEOUT" ? "timeout" : "failed";
      pair.error = err.message || String(err);
      pair.diagnostics = err.diagnostics || pair.diagnostics || null;
      batch.failedCount++;
      console.error(`[batch] ✗ ${pair.ownerId.slice(0, 8)}/${pair.process}: ${pair.error}`);
    }

    pair.completedAt = Date.now();
    pair.durationMs = pair.completedAt - pair.startedAt;
    finalizePairLog(pair, batch.config, { result: pair.result, error: pairError });
    persistCurrentBatchSnapshot(batch).catch((err) =>
      console.error(`[batch] Failed to persist pair log to Redis: ${err.message}`)
    );
  }

  batch.status = "done";
  batch.completedAt = Date.now();
  batch.totalDurationMs = batch.completedAt - batch.startedAt;
  batch.incompleteCount = batch.pairs.filter((p) => p.status === "incomplete").length;

  console.log(
    `[batch] Batch ${batch.id} done — ` +
    `${batch.completedCount} completed, ${batch.failedCount} failed, ${batch.incompleteCount} incomplete ` +
    `(${Math.round(batch.totalDurationMs / 1000)}s)`
  );

  archiveBatch();
}

/**
 * Execute a single pair with a timeout guard.
 */
export async function executeWithTimeout(pair, config, { runner = executePair, timeoutMs = PAIR_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  let settled = false;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const diagnostics = buildPairDiagnostics(pair, config, {
        status: "timeout",
        reason: "llm_timeout",
        durationMs: Date.now() - startedAt,
        timeoutAt: new Date().toISOString(),
        timeoutMs,
        message: `Pair timeout after ${PAIR_TIMEOUT_MS / 1000}s`,
      });
      pair.diagnostics = diagnostics;
      const timeoutError = new PairTimeoutError(pair, diagnostics);
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);

    const onDiagnostics = (diagnostics) => {
      pair.diagnostics = buildPairDiagnostics(pair, config, diagnostics);
    };

    Promise.resolve()
      .then(() => runner(pair, config, { signal: controller.signal, onDiagnostics }))
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Dispatch a single (user, process) pair to the appropriate function.
 */
async function executePair(pair, config, { signal, onDiagnostics } = {}) {
  const rowConfig = config[pair.process] || {};
  const model = rowConfig.model || process.env.LLM_MODEL || "phi3";
  const apiUrl = process.env.LLM_API_URL || "http://localhost:11434/v1";
  const style = rowConfig.style || "default";
  onDiagnostics?.({
    model,
    llmApiHost: llmApiHost(apiUrl),
    status: "running",
    pairStartedAt: new Date().toISOString(),
  });

  // Set model + style env for the duration of this call
  const prevModel = process.env.LLM_MODEL;
  const prevStyle = process.env.LLM_STYLE;
  process.env.LLM_MODEL = model;
  if (style && style !== "default") {
    process.env.LLM_STYLE = style;
  } else {
    delete process.env.LLM_STYLE;
  }

  try {
    switch (pair.process) {
      case "insights":
        return await _generateLlmInsightForUser(pair.ownerId, {
          minMoments: rowConfig.minMoments || 5,
          maxWords: rowConfig.maxWords || 100,
          signal,
          onDiagnostics,
        });

      case "actions":
        return await _generateForOwner(pair.ownerId, {
          model,
          apiUrl,
          force: true, // batch always forces — eligibility already checked
          signal,
        });

      case "move":
        return await runModeOutputInChild({
          ownerId: pair.ownerId,
          mode: "move",
          model,
          maxWords: rowConfig.maxWords || 100,
          style,
        }, { signal });

      case "fuel":
        return await runModeOutputInChild({
          ownerId: pair.ownerId,
          mode: "fuel",
          model,
          maxWords: rowConfig.maxWords || 100,
          style,
        }, { signal });

      case "perspective":
        return await runModeOutputInChild({
          ownerId: pair.ownerId,
          mode: "perspective",
          model,
          maxWords: rowConfig.maxWords || 100,
          style,
        }, { signal });

      default:
        throw new Error(`Unknown process: ${pair.process}`);
    }
  } finally {
    // Restore env
    if (prevModel !== undefined) {
      process.env.LLM_MODEL = prevModel;
    } else {
      delete process.env.LLM_MODEL;
    }
    if (prevStyle !== undefined) {
      process.env.LLM_STYLE = prevStyle;
    } else {
      delete process.env.LLM_STYLE;
    }
  }
}

function markRemaining(pairs, fromIndex, status, reason, config = {}) {
  for (let j = fromIndex; j < pairs.length; j++) {
    if (pairs[j].status === "pending") {
      const pair = pairs[j];
      pair.status = status;
      pair.error = reason;
      pair.completedAt = Date.now();
      pair.durationMs = pair.startedAt ? pair.completedAt - pair.startedAt : 0;
      finalizePairLog(pair, config, { error: new Error(reason) });
    }
  }
}

export function createBatchSummary(batch) {
  return {
    id: batch.id,
    status: batch.status,
    error: batch.error || null,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
    totalPairs: batch.pairs.length,
    completedCount: batch.completedCount,
    failedCount: batch.failedCount,
    incompleteCount: batch.incompleteCount,
    totalDurationMs: batch.totalDurationMs,
    pairs: batch.pairs.map(simplifyPair),
  };
}

function archiveBatch() {
  if (!currentBatch) return;
  const summary = createBatchSummary(currentBatch);
  batchHistory.unshift(summary);
  if (batchHistory.length > MAX_HISTORY) batchHistory.pop();

  // Persist to Redis (fire-and-forget, don't block batch completion)
  persistBatchToRedis(summary).catch((err) =>
    console.error(`[batch] Failed to persist batch to Redis: ${err.message}`)
  );
}

function persistCurrentBatchSnapshot(batch = currentBatch) {
  if (!batch) return Promise.resolve();
  return persistBatchToRedis(createBatchSummary(batch));
}

export function buildBatchLogRedisCommands(redisKeyFn, summary) {
  return [
    ["SET", redisKeyFn("llm_batch_log", summary.id), JSON.stringify(summary)],
    ["EXPIRE", redisKeyFn("llm_batch_log", summary.id), String(BATCH_LOG_TTL)],
    ["ZADD", redisKeyFn("llm_batch_logs"), String(summary.startedAt), summary.id],
    ["ZREMRANGEBYRANK", redisKeyFn("llm_batch_logs"), "0", "-31"],
  ];
}

async function persistBatchToRedis(summary) {
  if (!_redis || !_redisKey) return;
  for (const command of buildBatchLogRedisCommands(_redisKey, summary)) {
    await _redis(command);
  }
}

export function isBatchLogVisibleWithinWindow(summary, nowMs = Date.now()) {
  const timestamp = Number(summary?.completedAt || summary?.startedAt);
  return Number.isFinite(timestamp) && nowMs - timestamp <= LLM_BATCH_LOG_WINDOW_MS;
}

function visibleBatchHistory() {
  const nowMs = Date.now();
  return batchHistory.filter((batch) => isBatchLogVisibleWithinWindow(batch, nowMs));
}

async function loadHistoryFromRedis() {
  try {
    if (!_redis || !_redisKey) {
      await ensureImports();
    }
    // Get batch IDs from the sorted set, most recent first
    const ids = await _redis(["ZREVRANGE", _redisKey("llm_batch_logs"), "0", "29"]);
    if (!ids || !Array.isArray(ids) || ids.length === 0) return;

    const loaded = [];
    for (const id of ids) {
      const raw = await _redis(["GET", _redisKey("llm_batch_log", id)]);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (isBatchLogVisibleWithinWindow(parsed)) loaded.push(parsed);
        } catch {}
      }
    }
    // Merge into in-memory history (avoid duplicates)
    const existingIds = new Set(batchHistory.map((b) => b.id));
    for (const batch of loaded) {
      if (!existingIds.has(batch.id)) {
        batchHistory.push(batch);
        existingIds.add(batch.id);
      }
    }
    // Sort by startedAt descending
    batchHistory.sort((a, b) => b.startedAt - a.startedAt);
    if (batchHistory.length > MAX_HISTORY) batchHistory.length = MAX_HISTORY;
    console.log(`[batch] Loaded ${loaded.length} batch logs from Redis`);
  } catch (err) {
    console.error(`[batch] Failed to load history from Redis: ${err.message}`);
  }
}

// Load history on module init
let _historyLoaded = false;

// ── Public API ─────────────────────────────────────────────────────────

export async function getBatchStatus() {
  // Lazy-load history from Redis on first call
  if (!_historyLoaded) {
    _historyLoaded = true;
    await loadHistoryFromRedis();
  }

  if (!currentBatch) {
    return { status: "idle", history: visibleBatchHistory() };
  }

  const completed = currentBatch.pairs.filter((p) => p.status === "completed");
  const failed = currentBatch.pairs.filter((p) => p.status === "failed" || p.status === "skipped" || p.status === "timeout");
  const incomplete = currentBatch.pairs.filter((p) => p.status === "incomplete");
  const pending = currentBatch.pairs.filter((p) => p.status === "pending");
  const running = currentBatch.pairs.find((p) => p.status === "running") || null;

  return {
    batchId: currentBatch.id,
    status: currentBatch.status,
    startedAt: currentBatch.startedAt,
    completedAt: currentBatch.completedAt,
    totalDurationMs: currentBatch.totalDurationMs,
    elapsed: Date.now() - currentBatch.startedAt,
    progress: `${currentBatch.completedCount + currentBatch.failedCount}/${currentBatch.pairs.length}`,
    totalPairs: currentBatch.pairs.length,
    completedCount: completed.length,
    failedCount: failed.length,
    incompleteCount: incomplete.length,
    pendingCount: pending.length,
    running: running ? { ownerId: running.ownerId, process: running.process, startedAt: running.startedAt } : null,
    completed: completed.map(simplifyPair),
    failed: failed.map(simplifyPair),
    incomplete: incomplete.map(simplifyPair),
    history: visibleBatchHistory(),
    error: currentBatch.error || null,
  };
}

export function cancelBatch() {
  if (!currentBatch || currentBatch.status !== "running") {
    return { ok: false, error: "No running batch" };
  }
  currentBatch.cancelRequested = true;
  return { ok: true, message: "Cancel requested — current pair will finish" };
}

/**
 * Re-run specific pairs. Creates a new mini-batch from selected pair IDs
 * from the last batch.
 */
export async function rerunPairs(pairIds, maxRuntimeMinutes) {
  if (currentBatch && currentBatch.status === "running") {
    throw new Error("A batch is already running");
  }

  if (!currentBatch) {
    throw new Error("No previous batch to re-run from");
  }

  await ensureImports();

  const sourcePairs = currentBatch.pairs.filter((p) => pairIds.includes(p.id));
  if (sourcePairs.length === 0) {
    throw new Error("No matching pairs found");
  }

  const config = currentBatch.config;

  // Reset pairs for re-run
  const newPairs = sourcePairs.map((p) => ({
    id: p.id,
    ownerId: p.ownerId,
    process: p.process,
  }));

  return startBatch(newPairs, config, maxRuntimeMinutes || 120);
}

export function simplifyPair(p) {
  const log = p.llmLog || p.diagnostics || {};
  return {
    id: p.id,
    ownerId: p.ownerId,
    process: p.process,
    status: p.status,
    error: p.error,
    message: p.message || log.message || null,
    reason: p.reason || log.reason || null,
    timestamp: p.timestamp || log.timestamp || null,
    section: log.section || (p.process === "insights" ? "insights" : p.process),
    selectedSource: p.result?.selectedSource || log.selectedSource || null,
    promptCharCount: log.promptCharCount ?? null,
    model: log.model || p.result?.model || null,
    provider: log.provider || null,
    llmApiHost: log.llmApiHost || null,
    llmLog: p.llmLog || null,
    diagnostics: p.result?.diagnostics || p.diagnostics || null,
    durationMs: p.durationMs,
    startedAt: p.startedAt,
    completedAt: p.completedAt,
  };
}
