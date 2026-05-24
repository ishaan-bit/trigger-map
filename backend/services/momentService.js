import { randomUUID } from "node:crypto";
import { TRIGGER_KEYWORDS, TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS, EMOTION_COORDINATES, coordinatesToLegacy, derivedEmotionLabel, emotionRegionKey } from "@triggermap/shared/constants/emotions";
import { buildContributionTagMeta, getContributionSuggestions } from "@triggermap/shared/constants/contributions";
import { appendDailyAggregate, getOwnerIndexKey } from "./aggregationService.js";
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

export function createMomentPayload({
  ownerId,
  id,
  trigger,
  emotion,
  valence,
  arousal,
  intensity,
  emotionPoint,
  emotionLabel,
  emotionSubtitle,
  emotionQuadrant,
  emotionIntensity,
  note,
  occurredAt,
  isAnonymous,
  tags,
  contributionTags,
  contributionTagMeta,
}) {
  const finalTrigger = TRIGGERS.includes(trigger) ? trigger : detectTriggerFromNote(note) || "work";

  // Continuous model: valence/arousal provided → map to legacy 5-label for aggregation/insights
  // Legacy model: emotion string provided → validate against known set
  const hasContinuous = typeof valence === "number" && typeof arousal === "number";
  const finalEmotion = hasContinuous
    ? coordinatesToLegacy(valence, arousal)
    : (EMOTIONS.includes(emotion) ? emotion : "neutral");
  const coords = hasContinuous
    ? { valence, arousal }
    : (EMOTION_COORDINATES[finalEmotion] || EMOTION_COORDINATES.neutral);
  const finalDerivedLabel = hasContinuous ? derivedEmotionLabel(valence, arousal) : finalEmotion;
  const contributionSuggestionSet = getContributionSuggestions({
    domain: finalTrigger,
    valence: coords.valence,
    arousal: coords.arousal,
    intensity,
    emotionLabel: emotionLabel || finalDerivedLabel,
    emotionQuadrant,
    intensityBand: emotionIntensity,
  });
  const finalContributionTags = Array.isArray(contributionTags)
    ? contributionTags
    : (Array.isArray(tags) ? tags : []);
  const finalContributionMeta = Array.isArray(contributionTagMeta) && contributionTagMeta.length
    ? contributionTagMeta
    : buildContributionTagMeta(finalContributionTags, contributionSuggestionSet.all);
  const finalEmotionPoint = emotionPoint || {
    valence: coords.valence,
    arousal: coords.arousal,
    x: coords.valence,
    y: coords.arousal,
  };

  return {
    id: id || randomUUID(),
    ownerId,
    trigger: finalTrigger,
    emotion: finalEmotion,
    emotion_legacy: finalEmotion,
    valence: coords.valence,
    arousal: coords.arousal,
    emotionPoint: finalEmotionPoint,
    intensity: typeof intensity === "number" ? intensity : Math.sqrt(coords.valence ** 2 + coords.arousal ** 2),
    derivedLabel: finalDerivedLabel,
    emotionLabel: emotionLabel || finalDerivedLabel,
    emotionSubtitle: emotionSubtitle || finalDerivedLabel,
    emotionQuadrant: emotionQuadrant || contributionSuggestionSet.emotionQuadrant || emotionRegionKey(coords.valence, coords.arousal),
    emotionIntensity: emotionIntensity || contributionSuggestionSet.intensityBand,
    note: sanitizeText(note || ""),
    timestamp: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
    isAnonymous: Boolean(isAnonymous),
    contributionTags: finalContributionTags,
    contributionTagMeta: finalContributionMeta,
    ...(tags?.length ? { tags } : {}),
  };
}

export async function appendMoment(moment) {
  // Dedup guard: prevent identical moment within 10s window
  const dedupKey = redisKey("dedup", moment.ownerId,
    `${moment.timestamp}|${moment.trigger}|${moment.valence}|${moment.arousal}`);
  const isNew = await redis(["SET", dedupKey, "1", "NX", "EX", "10"]);
  if (!isNew) return moment;

  // ID-based dedup: prevent duplicate writes during anonymous→auth migration
  const idDedupKey = redisKey("moment_seen", moment.id);
  const idIsNew = await redis(["SET", idDedupKey, "1", "NX", "EX", String(90 * 86400)]);
  if (!idIsNew) return moment;

  await pipeline([
    ["RPUSH", getMomentsKey(moment.ownerId), JSON.stringify(moment)],
    ["INCR", redisKey("counter", "moments_logged")],
    ["SADD", getOwnerIndexKey(), moment.ownerId],
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
