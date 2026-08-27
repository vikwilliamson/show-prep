import {
  getCursor,
  loadConfig,
  saveStatus,
  setCursor,
  type CompanionConfig,
} from "./config";
import { readAll } from "./healthConnect";
import { mapNutrition } from "./mapper";

// Incremental sync engine.
//  - HC only exposes data from up to 30 days before permission was granted,
//    so the first sync reaches back 30 days.
//  - Later syncs re-read a 24h overlap window before the last cursor; the
//    server upserts on metadata.id, so overlap is safe by design.

const FIRST_SYNC_DAYS = 30;
const OVERLAP_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;
// A hung request (dead connection, dev server mid-restart, etc.) must not
// leave the sync — and the UI's "Syncing…" state — stuck forever. See VIK-74.
export const FETCH_TIMEOUT_MS = 30_000;

interface TypePlan {
  ingestType: string;
  source: "myfitnesspal";
  read: (startTime: string, endTime: string) => Promise<unknown[]>;
}

async function windowFor(ingestType: string, now: Date): Promise<string> {
  const cursor = await getCursor(ingestType);
  if (!cursor) {
    return new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000).toISOString();
  }
  return new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString();
}

async function post(
  config: CompanionConfig,
  ingestType: string,
  source: string,
  records: unknown[],
): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(
        `${config.serverUrl.replace(/\/$/, "")}/api/ingest/${ingestType}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            deviceId: config.deviceId,
            referenceId: config.referenceId,
            source,
            records: batch,
          }),
          signal: controller.signal,
        },
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`${ingestType} sync timed out after ${FETCH_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${ingestType} sync failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { accepted: number };
    accepted += json.accepted;
  }
  return accepted;
}

export interface SyncResult {
  ok: boolean;
  detail: string;
}

export async function runSync(): Promise<SyncResult> {
  const config = await loadConfig();
  if (!config.serverUrl) {
    return { ok: false, detail: "Server URL not configured." };
  }
  if (!config.referenceId) {
    return { ok: false, detail: "Pairing ID not configured." };
  }

  const now = new Date();
  const endTime = now.toISOString();

  const plans: TypePlan[] = [
    {
      ingestType: "nutrition",
      source: "myfitnesspal",
      read: async (s, e) => mapNutrition(await readAll("Nutrition", s, e)),
    },
  ];

  const lines: string[] = [];
  let anyFailure = false;

  for (const plan of plans) {
    try {
      const startTime = await windowFor(plan.ingestType, now);
      const records = await plan.read(startTime, endTime);
      const accepted = records.length
        ? await post(config, plan.ingestType, plan.source, records)
        : 0;
      await setCursor(plan.ingestType, endTime);
      lines.push(`${plan.ingestType}: ${accepted}`);
    } catch (err) {
      anyFailure = true;
      lines.push(
        `${plan.ingestType}: ERROR ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const detail = lines.join("\n");
  await saveStatus({ lastRunAt: endTime, lastResult: detail });
  return { ok: !anyFailure, detail };
}
