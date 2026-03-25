import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "triggermap.device-id";
const SESSION_TOKEN_KEY = "triggermap.session-token";
const ONBOARDING_KEY = "triggermap.onboarding-complete";
const REMINDER_KEY = "triggermap.reminder-enabled";
const REFLECTION_KEY = "triggermap.reflection-enabled";
const NUDGES_KEY = "triggermap.nudges-enabled";
const LAST_OPENED_AT_KEY = "triggermap.last-opened-at";
const LAST_LOGGED_AT_KEY = "triggermap.last-logged-at";
const DAILY_PREDICTION_KEY = "triggermap.daily-prediction";
const LANGUAGE_KEY = "triggermap.language";

export async function getOrCreateDeviceId() {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const secureStoreValue = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (secureStoreValue) {
    await AsyncStorage.setItem(DEVICE_ID_KEY, secureStoreValue);
    return secureStoreValue;
  }

  const created = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}

export async function getSessionToken() {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function setSessionToken(token) {
  return SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken() {
  return SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}

export async function getOnboardingComplete() {
  return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "true";
}

export async function setOnboardingComplete(value) {
  return AsyncStorage.setItem(ONBOARDING_KEY, value ? "true" : "false");
}

export async function getReminderEnabled() {
  return (await AsyncStorage.getItem(REMINDER_KEY)) === "true";
}

export async function setReminderEnabled(value) {
  return AsyncStorage.setItem(REMINDER_KEY, value ? "true" : "false");
}

export async function getReflectionEnabled() {
  // Default to true for new users (set on onboarding)
  const raw = await AsyncStorage.getItem(REFLECTION_KEY);
  return raw === null ? true : raw === "true";
}

export async function setReflectionEnabled(value) {
  return AsyncStorage.setItem(REFLECTION_KEY, value ? "true" : "false");
}

export async function getNudgesEnabled() {
  const raw = await AsyncStorage.getItem(NUDGES_KEY);
  return raw === null ? true : raw === "true";
}

export async function setNudgesEnabled(value) {
  return AsyncStorage.setItem(NUDGES_KEY, value ? "true" : "false");
}

export async function getLastOpenedAt() {
  return AsyncStorage.getItem(LAST_OPENED_AT_KEY);
}

export async function setLastOpenedAt(value = new Date().toISOString()) {
  return AsyncStorage.setItem(LAST_OPENED_AT_KEY, value);
}

export async function getLastLoggedAt() {
  return AsyncStorage.getItem(LAST_LOGGED_AT_KEY);
}

export async function setLastLoggedAt(value = new Date().toISOString()) {
  return AsyncStorage.setItem(LAST_LOGGED_AT_KEY, value);
}

/** Save today's prediction (e.g. "calm", "neutral", "stressful"). */
export async function saveDailyPrediction(prediction) {
  const entry = JSON.stringify({ prediction, date: new Date().toISOString().slice(0, 10) });
  return AsyncStorage.setItem(DAILY_PREDICTION_KEY, entry);
}

/** Get today's prediction if one exists, otherwise null. */
export async function getDailyPrediction() {
  const raw = await AsyncStorage.getItem(DAILY_PREDICTION_KEY);
  if (!raw) return null;
  try {
    const { prediction, date } = JSON.parse(raw);
    if (date === new Date().toISOString().slice(0, 10)) return prediction;
  } catch { /* corrupted */ }
  return null;
}

/** Get the stored language preference ('en' or 'hi'). */
export async function getLanguage() {
  return AsyncStorage.getItem(LANGUAGE_KEY);
}

/** Set the language preference. */
export async function setLanguage(lang) {
  return AsyncStorage.setItem(LANGUAGE_KEY, lang);
}