import {
  initialize,
  readRecords,
  requestPermission,
  type ReadRecordsOptions,
} from "react-native-health-connect";

// The companion is the ONLY component that touches Health Connect — all reads
// happen on-device (HC has no cloud API). Postgres on the server is the system
// of record; HC is just the pipe.

export const RECORD_TYPES = ["Nutrition"] as const;

export type HcRecordType = (typeof RECORD_TYPES)[number];

let initialized = false;

export async function ensureInitialized(): Promise<boolean> {
  if (initialized) return true;
  initialized = await initialize();
  return initialized;
}

export async function requestAllPermissions(): Promise<void> {
  await ensureInitialized();
  await requestPermission(
    RECORD_TYPES.map((recordType) => ({
      accessType: "read" as const,
      recordType,
    })),
  );
}

/**
 * Reads all records of a type in [startTime, endTime), following pagination.
 * Every record carries metadata.id — the stable UID the server upserts on.
 */
export async function readAll<T = Record<string, unknown>>(
  recordType: HcRecordType,
  startTime: string,
  endTime: string,
): Promise<T[]> {
  await ensureInitialized();
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const options: ReadRecordsOptions = {
      timeRangeFilter: { operator: "between", startTime, endTime },
      pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    };
    const result = await readRecords(recordType, options);
    out.push(...(result.records as T[]));
    pageToken = result.pageToken || undefined;
  } while (pageToken);
  return out;
}
