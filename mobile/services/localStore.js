import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import * as Crypto from "expo-crypto";
import { logMoment } from "@/services/api";
import { coordinatesToLegacy } from "@triggermap/shared/constants/emotions";

const STORAGE_KEY = "triggermap.local-moments";
const PENDING_SYNC_KEY = "triggermap.pending-anon-sync";

/**
 * Get all locally stored moments, sorted newest first.
 */
export async function getLocalMoments() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const moments = JSON.parse(raw);
    return moments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch {
    return [];
  }
}

/**
 * Save a moment to local storage.
 */
export async function saveLocalMoment({
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
  tags,
  contributionTags,
  contributionTagMeta,
}) {
  const moments = await getLocalMoments();
  const moment = {
    id: Crypto.randomUUID(),
    trigger,
    emotion,
    ...(typeof valence === "number" ? { valence } : {}),
    ...(typeof arousal === "number" ? { arousal } : {}),
    ...(typeof intensity === "number" ? { intensity } : {}),
    ...(emotionPoint ? { emotionPoint } : {}),
    ...(emotionLabel ? { emotionLabel } : {}),
    ...(emotionSubtitle ? { emotionSubtitle } : {}),
    ...(emotionQuadrant ? { emotionQuadrant } : {}),
    ...(emotionIntensity ? { emotionIntensity } : {}),
    note: note || "",
    timestamp: new Date().toISOString(),
    isLocal: true,
    tags: tags || contributionTags || [],
    contributionTags: contributionTags || tags || [],
    contributionTagMeta: contributionTagMeta || [],
  };
  moments.unshift(moment);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(moments));
  return moment;
}

/**
 * Delete a locally stored moment by id.
 */
export async function deleteLocalMoment(id) {
  const moments = await getLocalMoments();
  const filtered = moments.filter((m) => m.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Update a locally stored moment.
 */
export async function updateLocalMoment(id, updates) {
  const moments = await getLocalMoments();
  const index = moments.findIndex((m) => m.id === id);
  if (index === -1) throw new Error("Moment not found");
  moments[index] = { ...moments[index], ...updates, editedAt: new Date().toISOString() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(moments));
  return moments[index];
}

/**
 * Upload all local moments to the server, then clear local storage.
 */
export async function migrateLocalMoments(token, deviceId) {
  const moments = await getLocalMoments();
  if (!moments.length) return [];

  for (const m of moments) {
    try {
      await logMoment(
        {
          deviceId,
          momentId: m.id,
          trigger: m.trigger,
          emotion: m.emotion,
          ...(typeof m.valence === "number" ? { valence: m.valence } : {}),
          ...(typeof m.arousal === "number" ? { arousal: m.arousal } : {}),
          ...(typeof m.intensity === "number" ? { intensity: m.intensity } : {}),
          ...(m.emotionPoint ? { emotionPoint: m.emotionPoint } : {}),
          ...(m.emotionLabel ? { emotionLabel: m.emotionLabel } : {}),
          ...(m.emotionSubtitle ? { emotionSubtitle: m.emotionSubtitle } : {}),
          ...(m.emotionQuadrant ? { emotionQuadrant: m.emotionQuadrant } : {}),
          ...(m.emotionIntensity ? { emotionIntensity: m.emotionIntensity } : {}),
          note: m.note || "",
          timestamp: m.timestamp,
          tags: m.tags || [],
          contributionTags: m.contributionTags || m.tags || [],
          contributionTagMeta: m.contributionTagMeta || [],
        },
        token
      );
    } catch {
      // skip individual failures, best-effort migration
    }
  }

  await AsyncStorage.removeItem(STORAGE_KEY);
  return moments;
}

export async function clearLocalMoments() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Pending anonymous sync queue
// Stores logMoment payloads that failed to reach the backend so they can be
// retried on the next app open.  Capped at 50 entries to bound storage use.
// ---------------------------------------------------------------------------
export async function queuePendingSync(payload) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    if (queue.some((p) => p.momentId === payload.momentId)) return; // already queued
    queue.push({ ...payload, queuedAt: new Date().toISOString() });
    await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue.slice(-50)));
  } catch {
    // storage failure — drop silently; moment is already saved locally
  }
}

export async function getPendingSyncs() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function removePendingSync(momentId) {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return;
    const queue = JSON.parse(raw).filter((p) => p.momentId !== momentId);
    await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

/**
 * Build a basic weekly report from local moments.
 * Matches the output shape of the backend patternEngine.
 */
export function buildLocalReport(moments) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const weekMoments = moments.filter((m) => new Date(m.timestamp) >= weekAgo);

  if (weekMoments.length === 0) return null;

  const triggerFrequency = {};
  const emotionFrequency = {};
  const tagFrequency = {};
  const timeOfDayPatterns = { morning: 0, afternoon: 0, evening: 0, night: 0 };

  for (const m of weekMoments) {
    triggerFrequency[m.trigger] = (triggerFrequency[m.trigger] || 0) + 1;
    const emo = m.emotion || (typeof m.valence === "number" && typeof m.arousal === "number" ? coordinatesToLegacy(m.valence, m.arousal) : "neutral");
    emotionFrequency[emo] = (emotionFrequency[emo] || 0) + 1;
    for (const tag of (m.contributionTags || m.tags || [])) {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
    }

    const hour = new Date(m.timestamp).getHours();
    if (hour < 12) timeOfDayPatterns.morning++;
    else if (hour < 17) timeOfDayPatterns.afternoon++;
    else if (hour < 21) timeOfDayPatterns.evening++;
    else timeOfDayPatterns.night++;
  }

  const sortedTriggers = Object.entries(triggerFrequency).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const sortedEmotions = Object.entries(emotionFrequency).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const triggerMax = sortedTriggers[0]?.[1] || 0;
  const emotionMax = sortedEmotions[0]?.[1] || 0;
  const tiedTriggers = sortedTriggers.filter(([, v]) => v === triggerMax).map(([k]) => k);
  const tiedEmotions = sortedEmotions.filter(([, v]) => v === emotionMax).map(([k]) => k);
  const hasDominantTrigger = tiedTriggers.length === 1;
  const hasDominantEmotion = tiedEmotions.length === 1;

  const totalMoments = weekMoments.length;
  const daysLogged = new Set(weekMoments.map((m) => m.timestamp?.slice(0, 10))).size;
  const confidence = totalMoments < 3 ? "too_early" : totalMoments < 5 ? "low" : daysLogged < 3 ? "emerging" : "moderate";

  return {
    topTrigger: hasDominantTrigger ? tiedTriggers[0] : null,
    topEmotion: hasDominantEmotion ? tiedEmotions[0] : null,
    tiedTriggers,
    tiedEmotions,
    hasDominantTrigger,
    hasDominantEmotion,
    topPair: { trigger: "none", emotion: "none", count: 0 },
    totalMoments,
    timeOfDayPatterns,
    triggerFrequency,
    emotionFrequency,
    correlations: {},
    energyDistribution: {},
    tagFrequency,
    contributionTagFrequency: tagFrequency,
    regulators: [],
    frictionZones: [],
    pairings: [],
    triggerConcentration: 0,
    emotionConcentration: 0,
    mostStableDay: null,
    volatilityScore: null,
    trajectoryNote: null,
    weeklyEmotionTrajectory: [],
    busiestTime: null,
    dataQuality: {
      totalMoments,
      daysLogged,
      uniqueTriggers: Object.keys(triggerFrequency).length,
      uniqueEmotions: Object.keys(emotionFrequency).length,
      confidence,
      hasEnoughForPairings: false,
      hasEnoughForRhythm: false,
      hasEnoughForTrajectory: false,
      hasEnoughForStability: false,
    },
    aiInsight: null,
  };
}
