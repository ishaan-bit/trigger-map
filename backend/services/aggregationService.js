import { flatArrayToObject, hgetallObject, pipeline, redis, redisKey } from "./redisClient.js";

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
    triggers: {},
    emotions: {},
    pairs: {},
    tags: {},
    timeOfDay: {
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    },
    // Continuous emotion model aggregates
    valenceSum: Number(record["valence_sum"] || 0) / 1000,
    arousalSum: Number(record["arousal_sum"] || 0) / 1000,
    continuousCount: Number(record["continuous_count"] || 0),
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
    } else if (field.startsWith("tag:")) {
      snapshot.tags[field.replace("tag:", "")] = value;
    } else if (field.startsWith("contribution:")) {
      snapshot.contributionTags = snapshot.contributionTags || {};
      snapshot.contributionTags[field.replace("contribution:", "")] = value;
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

  if (Array.isArray(moment.tags)) {
    for (const tag of moment.tags) {
      cmds.push(["HINCRBY", key, `tag:${tag}`, "1"]);
    }
  }
  if (Array.isArray(moment.contributionTags)) {
    for (const tag of moment.contributionTags) {
      if (!moment.tags?.includes(tag)) {
        cmds.push(["HINCRBY", key, `tag:${tag}`, "1"]);
      }
      cmds.push(["HINCRBY", key, `contribution:${tag}`, "1"]);
    }
  }

  // Store valence/arousal running sums for centroid computation
  if (typeof moment.valence === "number" && typeof moment.arousal === "number") {
    // HINCRBY only works with integers — store scaled by 1000 for precision
    cmds.push(["HINCRBY", key, "valence_sum", String(Math.round(moment.valence * 1000))]);
    cmds.push(["HINCRBY", key, "arousal_sum", String(Math.round(moment.arousal * 1000))]);
    cmds.push(["HINCRBY", key, "continuous_count", "1"]);
  }

  await pipeline(cmds);
}

export async function getDailyAggregate(ownerId, date) {
  const record = await hgetallObject(getDailyAggregateKey(ownerId, date));
  return parseAggregateHash(record, date);
}

/**
 * Overwrite an owner's daily aggregate hashes from rebuilt snapshots
 * (shape produced by buildAggregatesFromRawMoments). Used during
 * anonymous→account migration so progress + report engines, which read
 * daily aggregates, stay correct for the merged timeline.
 *
 * Each snapshot's day key is fully replaced (DEL then HSET) and re-stamped
 * with the standard 45-day TTL. Snapshots whose day already fell out of the
 * TTL window are skipped — they would only be written to expire immediately.
 */
export async function replaceDailyAggregates(ownerId, snapshots = []) {
  if (!ownerId || !Array.isArray(snapshots) || snapshots.length === 0) return;

  const cutoff = formatAggregateDate(new Date(Date.now() - AGGREGATE_TTL_SECONDS * 1000));
  const cmds = [];

  for (const snap of snapshots) {
    const date = snap?.date;
    if (!date || date < cutoff) continue;
    if (Number(snap.total || 0) <= 0) continue;

    const key = getDailyAggregateKey(ownerId, date);
    const fields = ["date", date, "total", String(Number(snap.total || 0))];

    for (const [trigger, count] of Object.entries(snap.triggers || {})) {
      fields.push(`trigger:${trigger}`, String(Number(count || 0)));
    }
    for (const [emotion, count] of Object.entries(snap.emotions || {})) {
      fields.push(`emotion:${emotion}`, String(Number(count || 0)));
    }
    for (const [pair, count] of Object.entries(snap.pairs || {})) {
      fields.push(`pair:${pair}`, String(Number(count || 0)));
    }
    for (const [bucket, count] of Object.entries(snap.timeOfDay || {})) {
      fields.push(`time:${bucket}`, String(Number(count || 0)));
    }
    for (const [tag, count] of Object.entries(snap.tags || {})) {
      fields.push(`tag:${tag}`, String(Number(count || 0)));
    }
    for (const [tag, count] of Object.entries(snap.contributionTags || {})) {
      fields.push(`contribution:${tag}`, String(Number(count || 0)));
    }
    if (Number(snap.continuousCount || 0) > 0) {
      fields.push("valence_sum", String(Math.round(Number(snap.valenceSum || 0) * 1000)));
      fields.push("arousal_sum", String(Math.round(Number(snap.arousalSum || 0) * 1000)));
      fields.push("continuous_count", String(Number(snap.continuousCount || 0)));
    }

    cmds.push(["DEL", key]);
    cmds.push(["HSET", key, ...fields]);
    cmds.push(["EXPIRE", key, String(AGGREGATE_TTL_SECONDS)]);
  }

  cmds.push(["SADD", getOwnerIndexKey(), ownerId]);

  if (cmds.length) {
    await pipeline(cmds);
  }
}

/**
 * Pad a sparse, date-keyed snapshot list into a continuous daily array
 * spanning `days` back from today (oldest → newest). Engines that bin by
 * array index (progress: every 7 entries = 1 week) need one slot per
 * calendar day; rebuilt-from-raw aggregates only contain active days.
 */
export function padToDailyWindow(snapshots = [], days = 45) {
  const byDate = new Map((snapshots || []).map((s) => [s.date, s]));
  const out = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    const date = formatAggregateDate(d);
    out.push(byDate.get(date) || parseAggregateHash({}, date));
  }
  return out;
}

export async function getWeeklyAggregates(ownerId, days = 7) {
  const dates = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    dates.push(formatAggregateDate(date));
  }

  const keys = dates.map((date) => getDailyAggregateKey(ownerId, date));
  const results = await pipeline(keys.map((key) => ["HGETALL", key]));

  return dates.map((date, i) => parseAggregateHash(flatArrayToObject(results[i]), date));
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
