const redisBaseUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

function assertRedisConfig() {
  if (!redisBaseUrl || !redisToken) {
    throw new Error("Redis configuration missing");
  }
}

function headers() {
  return {
    Authorization: `Bearer ${redisToken}`,
    "Content-Type": "application/json",
  };
}

export function redisKey(...segments) {
  return ["triggermap", ...segments].join(":");
}

export async function redis(command) {
  assertRedisConfig();

  const response = await fetch(redisBaseUrl, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`Redis command failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.result;
}

export async function pipeline(commands) {
  assertRedisConfig();

  const response = await fetch(`${redisBaseUrl}/pipeline`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    throw new Error(`Redis pipeline failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data.map((entry) => entry.result) : [];
}

export function flatArrayToObject(arr) {
  const record = {};
  if (Array.isArray(arr)) {
    for (let i = 0; i < arr.length; i += 2) {
      record[arr[i]] = arr[i + 1];
    }
  }
  return record;
}

export async function hgetallObject(key) {
  const result = await redis(["HGETALL", key]);
  return flatArrayToObject(result);
}

export async function lrangeJson(key, start = 0, end = -1) {
  const items = await redis(["LRANGE", key, String(start), String(end)]);
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      try {
        return JSON.parse(item);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}