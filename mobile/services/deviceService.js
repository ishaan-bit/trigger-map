import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "triggermap.device-id";
const SESSION_TOKEN_KEY = "triggermap.session-token";
const ONBOARDING_KEY = "triggermap.onboarding-complete";
const REMINDER_KEY = "triggermap.reminder-enabled";
const LAST_OPENED_AT_KEY = "triggermap.last-opened-at";
const LAST_LOGGED_AT_KEY = "triggermap.last-logged-at";

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