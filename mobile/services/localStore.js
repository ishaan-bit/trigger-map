import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import * as Crypto from "expo-crypto";
import { logMoment } from "@/services/api";

const STORAGE_KEY = "triggermap.local-moments";

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
export async function saveLocalMoment({ trigger, emotion, note, tags }) {
  const moments = await getLocalMoments();
  const moment = {
    id: Crypto.randomUUID(),
    trigger,
    emotion,
    note: note || "",
    timestamp: new Date().toISOString(),
    isLocal: true,
    ...(tags?.length ? { tags } : {}),
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
        { deviceId, trigger: m.trigger, emotion: m.emotion, note: m.note || "", timestamp: m.timestamp },
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
  const timeOfDayPatterns = { morning: 0, afternoon: 0, evening: 0, night: 0 };

  for (const m of weekMoments) {
    triggerFrequency[m.trigger] = (triggerFrequency[m.trigger] || 0) + 1;
    emotionFrequency[m.emotion] = (emotionFrequency[m.emotion] || 0) + 1;

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
