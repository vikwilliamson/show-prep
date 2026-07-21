import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  loadConfig,
  loadStatus,
  saveConfig,
  type CompanionConfig,
  type SyncStatus,
} from "./src/config";
import { requestAllPermissions } from "./src/healthConnect";
import { runSync } from "./src/sync";

export default function App() {
  const [config, setConfig] = useState<CompanionConfig | null>(null);
  const [status, setStatus] = useState<SyncStatus>({
    lastRunAt: null,
    lastResult: null,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
    loadStatus().then(setStatus);
  }, []);

  if (!config) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const update = (patch: Partial<CompanionConfig>) =>
    setConfig({ ...config, ...patch });

  async function persist() {
    if (!config) return;
    await saveConfig(config);
    setNote("Settings saved.");
  }

  async function grantPermissions() {
    setBusy("permissions");
    setNote(null);
    try {
      await requestAllPermissions();
      setNote("Health Connect permissions granted.");
    } catch (err) {
      setNote(`Permission request failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    if (!config) return;
    setBusy("sync");
    setNote(null);
    try {
      await saveConfig(config);
      const result = await runSync();
      setStatus(await loadStatus());
      setNote(result.ok ? "Sync complete." : "Sync finished with errors — see below.");
    } catch (err) {
      setNote(`Sync failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <StatusBar style="light" />
      <Text style={styles.title}>Show Prep Companion</Text>
      <Text style={styles.subtitle}>
        Reads MyFitnessPal + Samsung Health data from Health Connect and syncs
        it to your prep server. Background sync runs roughly hourly; use Sync
        Now after logging meals.
      </Text>

      <Text style={styles.label}>Server URL</Text>
      <TextInput
        style={styles.input}
        value={config.serverUrl}
        onChangeText={(v) => update({ serverUrl: v })}
        placeholder="http://192.168.1.10:3210"
        placeholderTextColor="#666"
        autoCapitalize="none"
        keyboardType="url"
      />

      <Text style={styles.label}>Ingest API key (optional)</Text>
      <TextInput
        style={styles.input}
        value={config.apiKey}
        onChangeText={(v) => update({ apiKey: v })}
        placeholder="INGEST_API_KEY from the server"
        placeholderTextColor="#666"
        autoCapitalize="none"
        secureTextEntry
      />

      <Text style={styles.label}>Device ID</Text>
      <TextInput
        style={styles.input}
        value={config.deviceId}
        onChangeText={(v) => update({ deviceId: v })}
        autoCapitalize="none"
      />

      <View style={styles.row}>
        <Pressable style={styles.buttonSecondary} onPress={persist} disabled={!!busy}>
          <Text style={styles.buttonSecondaryText}>Save</Text>
        </Pressable>
        <Pressable
          style={styles.buttonSecondary}
          onPress={grantPermissions}
          disabled={!!busy}
        >
          <Text style={styles.buttonSecondaryText}>
            {busy === "permissions" ? "Requesting…" : "Grant HC permissions"}
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.button} onPress={syncNow} disabled={!!busy}>
        <Text style={styles.buttonText}>
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </Text>
      </Pressable>

      {note && <Text style={styles.note}>{note}</Text>}

      <View style={styles.statusBox}>
        <Text style={styles.statusTitle}>Last sync</Text>
        <Text style={styles.statusText}>
          {status.lastRunAt
            ? new Date(status.lastRunAt).toLocaleString()
            : "never"}
        </Text>
        {status.lastResult && (
          <Text style={styles.statusDetail}>{status.lastResult}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#131312" },
  content: { padding: 20, paddingTop: 64, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#c3c2b7", fontSize: 13, marginBottom: 12, lineHeight: 18 },
  label: { color: "#c3c2b7", fontSize: 12, marginTop: 8 },
  input: {
    backgroundColor: "#1a1a19",
    borderColor: "#33332f",
    borderWidth: 1,
    borderRadius: 8,
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  button: {
    backgroundColor: "#3987e5",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  buttonSecondary: {
    borderColor: "#33332f",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  buttonSecondaryText: { color: "#fff" },
  note: { color: "#c3c2b7", marginTop: 8 },
  statusBox: {
    backgroundColor: "#1a1a19",
    borderColor: "#33332f",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  statusTitle: { color: "#c3c2b7", fontSize: 12, textTransform: "uppercase" },
  statusText: { color: "#fff", fontSize: 16, marginTop: 4 },
  statusDetail: { color: "#c3c2b7", fontSize: 12, marginTop: 8, fontFamily: "monospace" },
});
