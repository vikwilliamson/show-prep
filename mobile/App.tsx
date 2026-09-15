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
import { fetchDashboard, type DashboardSummary } from "./src/dashboard";
import { requestAllPermissions } from "./src/healthConnect";
import { runSync } from "./src/sync";

type Tab = "config" | "dashboard";

export default function App() {
  const [tab, setTab] = useState<Tab>("config");
  const [config, setConfig] = useState<CompanionConfig | null>(null);
  const [status, setStatus] = useState<SyncStatus>({
    lastRunAt: null,
    lastResult: null,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  useEffect(() => {
    loadConfig().then(setConfig);
    loadStatus().then(setStatus);
  }, []);

  async function loadDashboard() {
    if (!config) return;
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      setDashboard(await fetchDashboard(config));
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : String(err));
    } finally {
      setDashboardLoading(false);
    }
  }

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
      if (result.ok) await loadDashboard();
    } catch (err) {
      setNote(`Sync failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(null);
    }
  }

  function selectTab(next: Tab) {
    setTab(next);
    if (next === "dashboard" && !dashboard && !dashboardLoading) loadDashboard();
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabButton, tab === "config" && styles.tabButtonActive]}
          onPress={() => selectTab("config")}
        >
          <Text style={[styles.tabButtonText, tab === "config" && styles.tabButtonTextActive]}>
            Setup
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === "dashboard" && styles.tabButtonActive]}
          onPress={() => selectTab("dashboard")}
        >
          <Text
            style={[styles.tabButtonText, tab === "dashboard" && styles.tabButtonTextActive]}
          >
            Dashboard
          </Text>
        </Pressable>
      </View>

      {tab === "config" ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Gamma Companion</Text>
          <Text style={styles.subtitle}>
            Reads MyFitnessPal + Samsung Health data from Health Connect and
            syncs it to your prep server. Background sync runs roughly
            hourly; use Sync Now after logging meals.
          </Text>

          <Text style={styles.label}>Pairing ID</Text>
          <TextInput
            style={styles.input}
            value={config.referenceId}
            onChangeText={(v) => update({ referenceId: v })}
            placeholder="From your coach — paste it here"
            placeholderTextColor="#666"
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
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <DashboardView
            data={dashboard}
            loading={dashboardLoading}
            error={dashboardError}
            onRetry={loadDashboard}
          />
        </ScrollView>
      )}
    </View>
  );
}

function DashboardView({
  data,
  loading,
  error,
  onRetry,
}: {
  data: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View>
        <Text style={styles.note}>Couldn&apos;t load your dashboard: {error}</Text>
        <Pressable style={styles.buttonSecondary} onPress={onRetry}>
          <Text style={styles.buttonSecondaryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!data) return null;

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.statusBox}>
        <Text style={styles.statusTitle}>{data.targetName ?? "Target date"}</Text>
        <Text style={styles.statusText}>
          {data.daysToTarget != null ? `${Math.max(data.daysToTarget, 0)} days out` : "Not set"}
        </Text>
        {data.targetDate && <Text style={styles.statusDetail}>{data.targetDate}</Text>}
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.statusTitle}>Current weight</Text>
        <Text style={styles.statusText}>
          {data.currentWeightLbs != null ? `${data.currentWeightLbs} lbs` : "No weigh-ins synced yet"}
        </Text>
        {data.weeklyChangeLbs != null && (
          <Text style={styles.statusDetail}>
            {data.weeklyChangeLbs > 0 ? "+" : ""}
            {data.weeklyChangeLbs} lbs/wk
            {data.targetWeightLbs != null &&
              data.currentWeightLbs != null &&
              ` · ${Math.abs(Math.round((data.currentWeightLbs - data.targetWeightLbs) * 10) / 10)} lbs ${
                data.currentWeightLbs > data.targetWeightLbs ? "above" : "under"
              } target`}
          </Text>
        )}
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.statusTitle}>
          {data.protocol ? "Active protocol" : "Nutrition target"}
        </Text>
        {data.protocol ? (
          <>
            <Text style={styles.statusText}>{data.protocol.calories ?? "—"} kcal</Text>
            <Text style={styles.statusDetail}>
              {data.protocol.proteinG ?? "?"}P / {data.protocol.carbsG ?? "?"}C /{" "}
              {data.protocol.fatG ?? "?"}F
            </Text>
          </>
        ) : (
          <Text style={styles.statusText}>No active protocol set</Text>
        )}
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.statusTitle}>This week at a glance</Text>
        <Text style={styles.statusDetail}>
          Water ({data.water.targetLiters}L/day min):{" "}
          {data.water.daysLogged
            ? `${data.water.daysMet}/${data.water.daysLogged} days · avg ${data.water.avgLiters}L`
            : "no data"}
        </Text>
        <Text style={styles.statusDetail}>
          Sleep ({data.sleep.targetHours}h min):{" "}
          {data.sleep.nightsLogged
            ? `${data.sleep.nightsMet}/${data.sleep.nightsLogged} nights · avg ${data.sleep.avgHours}h`
            : "no data"}
        </Text>
        <Text style={styles.statusDetail}>
          Lifting (min {data.training.strengthTarget}/wk): {data.training.strengthCount} sessions
        </Text>
        <Text style={styles.statusDetail}>
          Cardio ({data.training.cardioTarget}/wk): {data.training.cardioCount} sessions
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#131312" },
  content: { padding: 20, paddingTop: 16, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 4,
  },
  tabButton: {
    flex: 1,
    borderColor: "#33332f",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  tabButtonActive: { backgroundColor: "#3987e5", borderColor: "#3987e5" },
  tabButtonText: { color: "#c3c2b7", fontWeight: "600" },
  tabButtonTextActive: { color: "#fff" },
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
