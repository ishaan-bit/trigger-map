// HTTP client for calling the local worker (LLM jobs).
// The local worker runs on the developer machine and handles
// jobs that require local GPU / LLM inference.

const WORKER_URL = () => process.env.LOCAL_WORKER_URL || 'http://localhost:8787';
const WORKER_KEY = () => process.env.LOCAL_WORKER_KEY;

export async function workerRequest(path, options = {}) {
  const key = WORKER_KEY();
  if (!key) throw new Error('LOCAL_WORKER_KEY not configured');

  const url = `${WORKER_URL()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s for the initial request

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...options.headers,
      },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data: body };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLlmInsights({ model, force, minMoments, maxWords, ownerIds, style } = {}) {
  return workerRequest('/run-llm-insights', {
    method: 'POST',
    body: JSON.stringify({ model, force, minMoments, maxWords, ownerIds, style }),
  });
}

export async function runFreePass({ model, force, minMoments, maxWords, ownerIds, style } = {}) {
  return workerRequest('/run-freepass', {
    method: 'POST',
    body: JSON.stringify({ model, force, minMoments, maxWords, ownerIds, style }),
  });
}

export async function runRewriteSummaries({ model, force, ownerIds, style } = {}) {
  return workerRequest('/rewrite-summaries', {
    method: 'POST',
    body: JSON.stringify({ model, force, ownerIds, style }),
  });
}

export async function runLlmActions({ model, force, ownerIds, style } = {}) {
  return workerRequest('/generate-llm-actions', {
    method: 'POST',
    body: JSON.stringify({ model, force, ownerIds, style }),
  });
}

export async function runAdaptiveModes({ model, force, maxWords, ownerIds, style } = {}) {
  return workerRequest('/generate-adaptive-modes', {
    method: 'POST',
    body: JSON.stringify({ model, force, maxWords, ownerIds, style }),
  });
}

export async function getJobStatus(jobName) {
  return workerRequest(`/job-status?job=${encodeURIComponent(jobName)}`, { method: 'GET' });
}

export async function cancelWorkerJob(jobName) {
  return workerRequest('/cancel-job', {
    method: 'POST',
    body: JSON.stringify({ job: jobName }),
  });
}

export async function getWorkerHealth() {
  try {
    const key = WORKER_KEY();
    const url = `${WORKER_URL()}/health`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await res.json().catch(() => null);
    return { ok: true, data: body };
  } catch {
    return { ok: false, data: null };
  }
}

export async function listModels() {
  return workerRequest('/models', { method: 'GET' });
}

export async function pullModel(model) {
  return workerRequest('/pull-model', {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}

// ── LLM Batch endpoints ──

export async function estimateLlmBatch({ pairs, config }) {
  return workerRequest('/llm-batch/estimate', {
    method: 'POST',
    body: JSON.stringify({ pairs, config }),
  });
}

export async function runLlmBatch({ pairs, config, maxRuntimeMinutes }) {
  return workerRequest('/llm-batch/run', {
    method: 'POST',
    body: JSON.stringify({ pairs, config, maxRuntimeMinutes }),
  });
}

export async function getLlmBatchStatus() {
  return workerRequest('/llm-batch/status', { method: 'GET' });
}

export async function cancelLlmBatch() {
  return workerRequest('/llm-batch/cancel', { method: 'POST', body: '{}' });
}

export async function rerunLlmBatch({ pairIds, maxRuntimeMinutes }) {
  return workerRequest('/llm-batch/rerun', {
    method: 'POST',
    body: JSON.stringify({ pairIds, maxRuntimeMinutes }),
  });
}
