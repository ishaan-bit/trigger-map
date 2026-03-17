import { randomUUID } from "node:crypto";
import { TRIGGER_KEYWORDS, TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { appendDailyAggregate } from "./aggregationService.js";
import { lrangeJson, pipeline, redis, redisKey } from "./redisClient.js";
import { sanitizeText } from "./security.js";

function detectTriggerFromNote(note) {
  const normalized = sanitizeText(note).toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const [trigger, keywords] of Object.entries(TRIGGER_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return trigger;
    }
  }

  return null;
}

export function getMomentsKey(ownerId) {
  return redisKey("moments", ownerId);
}

export function createMomentPayload({ ownerId, trigger, emotion, note, occurredAt, isAnonymous, prediction }) {
  const finalTrigger = TRIGGERS.includes(trigger) ? trigger : detectTriggerFromNote(note) || "other";
  const finalEmotion = EMOTIONS.includes(emotion) ? emotion : "neutral";

  return {
    id: randomUUID(),
    ownerId,
    trigger: finalTrigger,
    emotion: finalEmotion,
    note: sanitizeText(note || ""),
    timestamp: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
    isAnonymous: Boolean(isAnonymous),
    ...(prediction ? { prediction } : {}),
  };
}

export async function appendMoment(moment) {
  await pipeline([
    ["RPUSH", getMomentsKey(moment.ownerId), JSON.stringify(moment)],
    ["INCR", redisKey("counter", "moments_logged")],
  ]);

  await appendDailyAggregate(moment);

  return moment;
}

export async function getTimeline(ownerId) {
  const moments = await lrangeJson(getMomentsKey(ownerId));

  return moments.sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
}

export async function getMomentById(ownerId, momentId) {
  const moments = await lrangeJson(getMomentsKey(ownerId));
  return moments.find((m) => m.id === momentId) || null;
}

export async function updateMoment(ownerId, momentId, updates) {
  const key = getMomentsKey(ownerId);
  const moments = await lrangeJson(key);
  const index = moments.findIndex((m) => m.id === momentId);

  if (index === -1) {
    return null;
  }

  const original = moments[index];
  const finalTrigger = updates.trigger && TRIGGERS.includes(updates.trigger) ? updates.trigger : original.trigger;
  const finalEmotion = updates.emotion && EMOTIONS.includes(updates.emotion) ? updates.emotion : original.emotion;

  const updated = {
    ...original,
    trigger: finalTrigger,
    emotion: finalEmotion,
    note: updates.note !== undefined ? sanitizeText(updates.note) : original.note,
    editedAt: new Date().toISOString(),
  };

  moments[index] = updated;
  await redis(["DEL", key]);
  if (moments.length) {
    await redis(["RPUSH", key, ...moments.map((m) => JSON.stringify(m))]);
  }

  return { original, updated };
}

export async function deleteMoment(ownerId, momentId) {
  const key = getMomentsKey(ownerId);
  const moments = await lrangeJson(key);
  const index = moments.findIndex((m) => m.id === momentId);

  if (index === -1) {
    return null;
  }

  const removed = moments.splice(index, 1)[0];
  await redis(["DEL", key]);
  if (moments.length) {
    await redis(["RPUSH", key, ...moments.map((m) => JSON.stringify(m))]);
  }

  return removed;
}

export async function exportMoments(ownerId) {
  return getTimeline(ownerId);
}

export async function migrateMoments(fromOwnerId, toOwnerId) {
  if (!fromOwnerId || !toOwnerId || fromOwnerId === toOwnerId) {
    return { migrated: 0 };
  }

  const sourceMoments = await getTimeline(fromOwnerId);
  if (!sourceMoments.length) {
    return { migrated: 0 };
  }

  const targetMoments = await getTimeline(toOwnerId);
  const merged = [...targetMoments, ...sourceMoments]
    .reduce((accumulator, moment) => {
      accumulator.set(moment.id, { ...moment, ownerId: toOwnerId, isAnonymous: false });
      return accumulator;
    }, new Map())
    .values();
  const mergedMoments = [...merged].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
  const targetKey = getMomentsKey(toOwnerId);

  await redis(["DEL", targetKey]);

  if (mergedMoments.length) {
    await redis(["RPUSH", targetKey, ...mergedMoments.map((moment) => JSON.stringify(moment))]);
  }

  await redis(["DEL", getMomentsKey(fromOwnerId)]);

  return { migrated: sourceMoments.length };
}