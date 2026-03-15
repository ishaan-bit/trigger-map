import { pipeline, redis, redisKey } from "./redisClient.js";

export async function enforceRateLimit(key, limit, windowSeconds) {
  const bucketKey = redisKey("ratelimit", key);
  const [count] = await pipeline([
    ["INCR", bucketKey],
    ["EXPIRE", bucketKey, String(windowSeconds)],
  ]);

  return Number(count) <= limit;
}

export async function touchDailyActive(ownerId) {
  const today = new Date().toISOString().slice(0, 10);
  const dauKey = redisKey("dau", today);

  await pipeline([
    ["SADD", dauKey, ownerId],
    ["EXPIRE", dauKey, String(60 * 60 * 48)],
  ]);
}

export async function incrementCounter(name) {
  await redis(["INCR", redisKey("counter", name)]);
}