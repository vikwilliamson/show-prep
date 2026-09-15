import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Persistent companion settings + per-record-type sync cursors.

export interface CompanionConfig {
  serverUrl: string; // baked into the app build via app.config.js, from EAS env vars — not user-editable
  apiKey: string; // baked into the app build, same as serverUrl
  referenceId: string; // pairing ID the client enters — says whose account this is
  deviceId: string;
}

const CONFIG_KEY = "companion.config";
const CURSOR_PREFIX = "companion.cursor."; // + ingest type -> ISO instant

function bakedInDefault(key: "serverUrl" | "apiKey"): string {
  const value = Constants.expoConfig?.extra?.[key];
  return typeof value === "string" ? value : "";
}

// Only referenceId/deviceId are ever persisted — serverUrl/apiKey are
// build-baked (see CompanionConfig's field comments) and must always come
// from the current build's Constants.expoConfig.extra, never from storage.
// A device upgrading from a pre-VIK-113 install (when Server URL/API key
// were manually-typed fields) would otherwise keep a stale full config
// blob in AsyncStorage forever, silently sending sync requests to whatever
// dev URL was typed in months ago.
interface StoredConfig {
  referenceId: string;
  deviceId: string;
}

export async function loadConfig(): Promise<CompanionConfig> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  const stored: Partial<StoredConfig> = raw ? JSON.parse(raw) : {};
  return {
    serverUrl: bakedInDefault("serverUrl"),
    apiKey: bakedInDefault("apiKey"),
    referenceId: stored.referenceId ?? "",
    deviceId: stored.deviceId ?? `galaxy-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export async function saveConfig(config: CompanionConfig): Promise<void> {
  const stored: StoredConfig = { referenceId: config.referenceId, deviceId: config.deviceId };
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(stored));
}

export async function getCursor(type: string): Promise<string | null> {
  return AsyncStorage.getItem(CURSOR_PREFIX + type);
}

export async function setCursor(type: string, iso: string): Promise<void> {
  await AsyncStorage.setItem(CURSOR_PREFIX + type, iso);
}

export interface SyncStatus {
  lastRunAt: string | null;
  lastResult: string | null;
}

const STATUS_KEY = "companion.status";

export async function loadStatus(): Promise<SyncStatus> {
  const raw = await AsyncStorage.getItem(STATUS_KEY);
  return raw ? JSON.parse(raw) : { lastRunAt: null, lastResult: null };
}

export async function saveStatus(status: SyncStatus): Promise<void> {
  await AsyncStorage.setItem(STATUS_KEY, JSON.stringify(status));
}
