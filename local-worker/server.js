/**
 * TriggerMap Local Worker
 *
 * Lightweight HTTP server that runs on the developer machine and
 * executes LLM jobs (generateLlmInsights, generateFreePass) that
 * require local GPU / LLM inference. The ops dashboard calls this
 * instead of the Vercel backend for LLM-related actions.
 *
 * Start:  npm start        (or npm run dev for auto-reload)
 * Port:   LOCAL_WORKER_PORT (default 8787)
 */

import 'dotenv/config';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(__dirname, '..', 'backend');

const PORT = parseInt(process.env.LOCAL_WORKER_PORT || '8787', 10);
const WORKER_KEY = process.env.LOCAL_WORKER_KEY;

if (!WORKER_KEY || WORKER_KEY === 'change-me-to-a-strong-secret') {
  console.error('ERROR: Set LOCAL_WORKER_KEY in .env before starting the worker.');
  process.exit(1);
}

// ── Active job tracking (prevent concurrent runs of the same job) ──
const activeJobs = new Map(); // jobName → { startedAt, abortController }

// ── CORS helpers ──
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Auth ──
function verifyBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7);
  if (token.length !== WORKER_KEY.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(WORKER_KEY));
  } catch {
    return false;
  }
}

// ── JSON helpers ──
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 64) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ── Job runner (spawns CLI process) ──
function runJob(scriptName, { model, force, minMoments } = {}) {
  return new Promise((resolve, reject) => {
    const args = [resolve(BACKEND_DIR, 'jobs', scriptName)];
    if (force) args.push('--force');
    if (minMoments != null) args.push(`--min-moments=${minMoments}`);

    const env = { ...process.env };
    if (model) env.LLM_MODEL = model;

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    const child = spawn('node', args, {
      cwd: BACKEND_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({ ok: code === 0, code, stdout, stderr, durationMs: duration });
    });
    child.on('error', (err) => {
      reject(err);
    });
  });
}

// ── Routes ──
async function handleRequest(req, res) {
  setCorsHeaders(res);

  // Preflight
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Health (no auth needed)
  if (path === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'triggermap-local-worker',
      uptime: process.uptime(),
      activeJobs: Object.fromEntries(
        [...activeJobs.entries()].map(([k, v]) => [k, { startedAt: v.startedAt, elapsed: Date.now() - v.startedAt }])
      ),
    });
  }

  // All other routes require auth
  if (!verifyBearer(req)) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  // POST /run-llm-insights
  if (path === '/run-llm-insights' && req.method === 'POST') {
    return handleRunJob(req, res, 'generateLlmInsights.js', 'generateLlmInsights');
  }

  // POST /run-freepass
  if (path === '/run-freepass' && req.method === 'POST') {
    return handleRunJob(req, res, 'generateFreePass.js', 'generateFreePass');
  }

  // POST /cancel-job
  if (path === '/cancel-job' && req.method === 'POST') {
    const body = await readBody(req);
    const jobName = body.job;
    const entry = activeJobs.get(jobName);
    if (!entry) return json(res, 404, { error: 'No active job found', job: jobName });
    if (entry.child) {
      entry.child.kill('SIGTERM');
      activeJobs.delete(jobName);
      return json(res, 200, { ok: true, cancelled: jobName });
    }
    return json(res, 400, { error: 'Job cannot be cancelled' });
  }

  return json(res, 404, { error: 'Not found' });
}

async function handleRunJob(req, res, scriptName, jobName) {
  // Prevent concurrent runs
  if (activeJobs.has(jobName)) {
    const entry = activeJobs.get(jobName);
    return json(res, 409, {
      error: `Job "${jobName}" is already running`,
      startedAt: entry.startedAt,
      elapsed: Date.now() - entry.startedAt,
    });
  }

  const body = await readBody(req);
  const { model, force, minMoments } = body;

  // Validate model if provided
  const ALLOWED_MODELS = ['phi3', 'mistral', 'llama3', 'llama2', 'gemma', 'qwen2'];
  if (model && !ALLOWED_MODELS.includes(model)) {
    return json(res, 400, { error: `Invalid model: ${model}. Allowed: ${ALLOWED_MODELS.join(', ')}` });
  }

  const args = ['jobs/' + scriptName];
  if (force) args.push('--force');
  if (minMoments != null) args.push(`--min-moments=${minMoments}`);

  const env = { ...process.env };
  if (model) env.LLM_MODEL = model;

  const startTime = Date.now();
  let stdout = '';
  let stderr = '';

  const child = spawn('node', args, {
    cwd: BACKEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  activeJobs.set(jobName, { startedAt: startTime, child });

  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  child.on('close', (code) => {
    activeJobs.delete(jobName);
    const duration = Date.now() - startTime;
    json(res, code === 0 ? 200 : 500, {
      ok: code === 0,
      action: jobName,
      exitCode: code,
      durationMs: duration,
      stdout: stdout.slice(-4000),
      stderr: stderr.slice(-2000),
      source: 'local-worker',
    });
  });

  child.on('error', (err) => {
    activeJobs.delete(jobName);
    json(res, 500, {
      ok: false,
      action: jobName,
      error: err.message,
      source: 'local-worker',
    });
  });
}

// ── Start ──
const server = http.createServer(handleRequest);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  TriggerMap Local Worker`);
  console.log(`  ─────────────────────`);
  console.log(`  Listening on http://127.0.0.1:${PORT}`);
  console.log(`  Backend dir: ${BACKEND_DIR}`);
  console.log(`  Endpoints:`);
  console.log(`    GET  /health          (no auth)`);
  console.log(`    POST /run-llm-insights`);
  console.log(`    POST /run-freepass`);
  console.log(`    POST /cancel-job`);
  console.log(`  Auth: Bearer token required\n`);
});
