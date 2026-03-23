// HTTP client for calling main backend internal API endpoints.
// Used for control actions (jobs, cache, reprocessing).

const BACKEND_URL = () => process.env.BACKEND_URL;
const INTERNAL_KEY = () => process.env.BACKEND_INTERNAL_KEY;

function assertConfig() {
  if (!BACKEND_URL()) throw new Error('BACKEND_URL not configured');
  if (!INTERNAL_KEY()) throw new Error('BACKEND_INTERNAL_KEY not configured');
}

export async function backendRequest(path, options = {}) {
  assertConfig();
  const url = `${BACKEND_URL()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Key': INTERNAL_KEY(),
      ...options.headers,
    },
    signal: AbortSignal.timeout(300000),
  });

  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: body };
}

export async function triggerJob(jobName, params = {}) {
  return backendRequest('/api/internal/control/run-job', {
    method: 'POST',
    body: JSON.stringify({ job: jobName, ...params }),
  });
}

export async function clearCache(cacheKey) {
  return backendRequest('/api/internal/control/clear-cache', {
    method: 'POST',
    body: JSON.stringify({ key: cacheKey }),
  });
}

export async function getBackendHealth() {
  return backendRequest('/api/health', { method: 'GET' });
}

export async function manageUser(action, params = {}) {
  return backendRequest('/api/internal/control/manage-user', {
    method: 'POST',
    body: JSON.stringify({ action, ...params }),
  });
}

export async function sendPush({ userIds, title, body }) {
  return backendRequest('/api/internal/control/send-push', {
    method: 'POST',
    body: JSON.stringify({ userIds, title, body }),
  });
}
