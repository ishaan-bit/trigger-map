import { hgetallObject, pipeline, redis, redisKey } from "./redisClient.js";

const AGGREGATE_TTL_SECONDS = 60 * 60 * 24 * 45;

export function formatAggregateDate(dateValue = new Date()) {
  return new Date(dateValue).toISOString().slice(0, 10);
}

export function getDailyAggregateKey(ownerId, date = formatAggregateDate()) {
  return redisKey("daily", ownerId, date);
}

export function getOwnerIndexKey() {
  return redisKey("owners");
}

export function bucketForTimestamp(timestamp) {
  const hour = new Date(timestamp).getHours();

  if (hour < 6) {
    return "night";
  }
  if (hour < 12) {
    return "morning";
  }
  if (hour < 18) {
    return "afternoon";
  }

  return "evening";
}

function parseAggregateHash(record, date) {
  const snapshot = {
    date,
    total: Number(record.total || 0),
    prediction: record.prediction || null,
    triggers: {},
    emotions: {},
    pairs: {},
    timeOfDay: {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    },
  };

  for (const [field, rawValue] of Object.entries(record)) {
    const value = Number(rawValue || 0);

    if (field.startsWith("trigger:")) {
      snapshot.triggers[field.replace("trigger:", "")] = value;
    } else if (field.startsWith("emotion:")) {
      snapshot.emotions[field.replace("emotion:", "")] = value;
    } else if (field.startsWith("pair:")) {
      snapshot.pairs[field.replace("pair:", "")] = value;
    } else if (field.startsWith("time:")) {
      snapshot.timeOfDay[field.replace("time:", "")] = value;
    }
  }

  return snapshot;
}

export async function appendDailyAggregate(moment) {
  const date = formatAggregateDate(moment.timestamp);
  const key = getDailyAggregateKey(moment.ownerId, date);
  const timeBucket = bucketForTimestamp(moment.timestamp);
  const pairKey = `${moment.trigger}|${moment.emotion}`;

  const cmds = [
    ["HINCRBY", key, "total", "1"],
    ["HINCRBY", key, `trigger:${moment.trigger}`, "1"],
    ["HINCRBY", key, `emotion:${moment.emotion}`, "1"],
    ["HINCRBY", key, `pair:${pairKey}`, "1"],
    ["HINCRBY", key, `time:${timeBucket}`, "1"],
    ["HSET", key, "date", date],
    ["EXPIRE", key, String(AGGREGATE_TTL_SECONDS)],
    ["SADD", getOwnerIndexKey(), moment.ownerId],
  ];

  // Store daily prediction (first one per day wins)
  if (moment.prediction) {
    cmds.push(["HSETNX", key, "prediction", moment.prediction]);
  }

  await pipeline(cmds);
}

export async function getDailyAggregate(ownerId, date) {
  const record = await hgetallObject(getDailyAggregateKey(ownerId, date));
  return parseAggregateHash(record, date);
}

export async function getWeeklyAggregates(ownerId, days = 7) {
  const dates = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    dates.push(formatAggregateDate(date));
  }

  const snapshots = await Promise.all(dates.map((date) => getDailyAggregate(ownerId, date)));
  return snapshots;
}

export async function getWeeklyPairCount(ownerId, trigger, emotion, days = 7) {
  const pairKey = `${trigger}|${emotion}`;
  const aggregates = await getWeeklyAggregates(ownerId, days);
  return aggregates.reduce((total, snapshot) => total + Number(snapshot.pairs[pairKey] || 0), 0);
}

export async function listOwnerIds() {
  const owners = await redis(["SMEMBERS", getOwnerIndexKey()]);
  return Array.isArray(owners) ? owners : [];
}

export async function decrementDailyAggregate(moment) {
  const date = formatAggregateDate(moment.timestamp);
  const key = getDailyAggregateKey(moment.ownerId, date);
  const timeBucket = bucketForTimestamp(moment.timestamp);
  const pairKey = `${moment.trigger}|${moment.emotion}`;

  await pipeline([
    ["HINCRBY", key, "total", "-1"],
    ["HINCRBY", key, `trigger:${moment.trigger}`, "-1"],
    ["HINCRBY", key, `emotion:${moment.emotion}`, "-1"],
    ["HINCRBY", key, `pair:${pairKey}`, "-1"],
    ["HINCRBY", key, `time:${timeBucket}`, "-1"],
  ]);
}

export async function repairAggregateForEdit(original, updated) {
  await decrementDailyAggregate(original);
  await appendDailyAggregate(updated);
}