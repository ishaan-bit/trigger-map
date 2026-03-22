// Direct Upstash Redis client for ops-console read operations.
// Mirrors the backend redis pattern but is fully independent.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function assertRedisConfig() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
  }
}

export async function redis(command) {
  assertRedisConfig();
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Redis error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.result;
}

export async function pipeline(commands) {
  assertRedisConfig();
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Redis pipeline error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.map((r) => r.result);
}

export function redisKey(...segments) {
  return `triggermap:${segments.join(':')}`;
}

export function flatArrayToObject(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return {};
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) {
    obj[arr[i]] = arr[i + 1];
  }
  return obj;
}

export async function hgetallObject(key) {
  const raw = await redis(['HGETALL', key]);
  return flatArrayToObject(raw);
}

export async function sMembers(key) {
  return redis(['SMEMBERS', key]);
}

export async function sCard(key) {
  return redis(['SCARD', key]);
}

export async function lLen(key) {
  return redis(['LLEN', key]);
}

export async function lRange(key, start, end) {
  return redis(['LRANGE', key, String(start), String(end)]);
}

export async function get(key) {
  return redis(['GET', key]);
}

export async function keys(pattern) {
  return redis(['KEYS', pattern]);
}

export async function ttl(key) {
  return redis(['TTL', key]);
}

export async function dbSize() {
  return redis(['DBSIZE']);
}

// Health check: test connectivity
export async function pingRedis() {
  try {
    const start = Date.now();
    const result = await redis(['PING']);
    const latency = Date.now() - start;
    return { ok: result === 'PONG', latency };
  } catch (err) {
    return { ok: false, error: err.message, latency: -1 };
  }
}
