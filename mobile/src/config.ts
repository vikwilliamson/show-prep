import AsyncStorage from "@react-native-async-storage/async-storage";

// Persistent companion settings + per-record-type sync cursors.

export interface CompanionConfig {
  serverUrl: string; // e.g. https://prep.example.com or http://192.168.1.10:3210
  apiKey: string; // INGEST_API_KEY on the server ("" if the server is open)
  deviceId: string;
}

const CONFIG_KEY = "companion.config";
const CURSOR_PREFIX = "companion.cursor."; // + ingest type -> ISO instant

export async function loadConfig(): Promise<CompanionConfig> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  if (raw) return JSON.parse(raw);
  return {
    serverUrl: "",
    apiKey: "",
    deviceId: `galaxy-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export async function saveConfig(config: CompanionConfig): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
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
