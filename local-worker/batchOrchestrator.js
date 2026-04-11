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
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, "..", "backend");

// Load backend .env so Redis config is available when we import backend modules
loadEnv({ path: resolve(BACKEND_DIR, ".env") });

// Dynamic imports for backend modules (resolved at runtime)
let _generateLlmInsightForUser;
let _generateForOwner;
let _generateModeOutput;
let _redis;
let _redisKey;

async function ensureImports() {
  if (!_generateLlmInsightForUser) {
    const mod = await import(pathToFileURL(resolve(BACKEND_DIR, "jobs", "generateLlmInsights.js")).href);
    _generateLlmInsightForUser = mod.generateLlmInsightForUser;
  }
  if (!_generateForOwner) {
    const mod = await import(pathToFileURL(resolve(BACKEND_DIR, "jobs", "generateLlmActions.js")).href);
    _generateForOwner = mod.generateForOwner;
  }
  if (!_generateModeOutput) {
    const mod = await import(pathToFileURL(resolve(BACKEND_DIR, "ai", "modeComposer.js")).href);
    _generateModeOutput = mod.generateModeOutput;
  }
  if (!_redis) {
    const mod = await import(pathToFileURL(resolve(BACKEND_DIR, "services", "redisClient.js")).href);
    _redis = mod.redis;
    _redisKey = mod.redisKey;
  }
}

// ── Batch state ────────────────────────────────────────────────────────

let currentBatch = null; // { id, pairs, config, startedAt, maxRuntimeMs, status, cancelRequested }
const batchHistory = []; // last N completed batches
const MAX_HISTORY = 10;

// Per-pair timeout: if a single LLM call takes > 3 min, abort it
const PAIR_TIMEOUT_MS = 180_000;

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
      markRemaining(batch.pairs, i, "incomplete", "cancelled");
      break;
    }

    // Check timeout — but let at least 1 pair run
    if (i > 0 && Date.now() >= deadline) {
      console.log(`[batch] Deadline reached after ${i} pairs. Marking remaining as incomplete.`);
      markRemaining(batch.pairs, i, "incomplete", "timeout - max runtime exceeded");
      break;
    }

    // Execute pair
    pair.status = "running";
    pair.startedAt = Date.now();

    try {
      const result = await executeWithTimeout(pair, batch.config);

      // Detect skipped results (e.g. generateForOwner returns {skipped: true})
      if (result && result.skipped) {
        pair.status = "skipped";
        pair.error = result.reason || "skipped by backend";
        batch.failedCount++;
        console.log(`[batch] ⊘ ${pair.ownerId.slice(0, 8)}/${pair.process}: skipped — ${pair.error}`);
      } else {
        pair.status = "completed";
        pair.result = result;
        batch.completedCount++;
        console.log(`[batch] ✓ ${pair.ownerId.slice(0, 8)}/${pair.process} (${Date.now() - pair.startedAt}ms)`);
      }
    } catch (err) {
      pair.status = "failed";
      pair.error = err.message || String(err);
      batch.failedCount++;
      console.error(`[batch] ✗ ${pair.ownerId.slice(0, 8)}/${pair.process}: ${pair.error}`);
    }

    pair.completedAt = Date.now();
    pair.durationMs = pair.completedAt - pair.startedAt;
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
async function executeWithTimeout(pair, config) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Pair timeout after ${PAIR_TIMEOUT_MS / 1000}s`));
    }, PAIR_TIMEOUT_MS);

    executePair(pair, config)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Dispatch a single (user, process) pair to the appropriate function.
 */
async function executePair(pair, config) {
  const rowConfig = config[pair.process] || {};
  const model = rowConfig.model || process.env.LLM_MODEL || "phi3";
  const apiUrl = process.env.LLM_API_URL || "http://localhost:11434/v1";
  const style = rowConfig.style || "default";

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
        });

      case "actions":
        return await _generateForOwner(pair.ownerId, {
          model,
          apiUrl,
          force: true, // batch always forces — eligibility already checked
        });

      case "move":
        return await _generateModeOutput({
          ownerId: pair.ownerId,
          mode: "move",
          model,
          maxWords: rowConfig.maxWords || 100,
          style,
        });

      case "fuel":
        return await _generateModeOutput({
          ownerId: pair.ownerId,
          mode: "fuel",
          model,
          maxWords: rowConfig.maxWords || 100,
          style,
        });

      case "perspective":
        return await _generateModeOutput({
          ownerId: pair.ownerId,
          mode: "perspective",
          model,
          maxWords: rowConfig.maxWords || 100,
          style,
        });

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

function markRemaining(pairs, fromIndex, status, reason) {
  for (let j = fromIndex; j < pairs.length; j++) {
    if (pairs[j].status === "pending") {
      pairs[j].status = status;
      pairs[j].error = reason;
      pairs[j].completedAt = Date.now();
    }
  }
}

function archiveBatch() {
  if (!currentBatch) return;
  const summary = {
    id: currentBatch.id,
    startedAt: currentBatch.startedAt,
    completedAt: currentBatch.completedAt,
    totalPairs: currentBatch.pairs.length,
    completedCount: currentBatch.completedCount,
    failedCount: currentBatch.failedCount,
    incompleteCount: currentBatch.incompleteCount,
    totalDurationMs: currentBatch.totalDurationMs,
    pairs: currentBatch.pairs.map(simplifyPair),
  };
  batchHistory.unshift(summary);
  if (batchHistory.length > MAX_HISTORY) batchHistory.pop();

  // Persist to Redis (fire-and-forget, don't block batch completion)
  persistBatchToRedis(summary).catch((err) =>
    console.error(`[batch] Failed to persist batch to Redis: ${err.message}`)
  );
}

const BATCH_LOG_TTL = 3 * 24 * 60 * 60; // 3 days in seconds

async function persistBatchToRedis(summary) {
  if (!_redis || !_redisKey) return;
  const key = _redisKey("llm_batch_log", summary.id);
  await _redis(["SET", key, JSON.stringify(summary)]);
  await _redis(["EXPIRE", key, BATCH_LOG_TTL]);
  // Also maintain a sorted set of batch IDs for easy retrieval
  await _redis(["ZADD", _redisKey("llm_batch_logs"), String(summary.startedAt), summary.id]);
  // Trim old entries (keep last 30)
  await _redis(["ZREMRANGEBYRANK", _redisKey("llm_batch_logs"), "0", "-31"]);
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
        try { loaded.push(JSON.parse(raw)); } catch {}
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
    return { status: "idle", history: batchHistory };
  }

  const completed = currentBatch.pairs.filter((p) => p.status === "completed");
  const failed = currentBatch.pairs.filter((p) => p.status === "failed" || p.status === "skipped");
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
    history: batchHistory,
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

function simplifyPair(p) {
  return {
    id: p.id,
    ownerId: p.ownerId,
    process: p.process,
    status: p.status,
    error: p.error,
    durationMs: p.durationMs,
    startedAt: p.startedAt,
    completedAt: p.completedAt,
  };
}
