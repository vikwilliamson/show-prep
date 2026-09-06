// Stand-in for react-native-health-connect, wired in via tsconfig.test.json
// `paths`. healthConnect.ts and sync.ts import the real specifier and resolve
// here at test time. Datasets and pages are programmable per record type so the
// full read -> map -> post pipeline can run headlessly.

export type ReadRecordsOptions = {
  timeRangeFilter?: { operator: string; startTime: string; endTime: string };
  pageSize?: number;
  pageToken?: string;
};

export interface RecordResult {
  records: any[];
  pageToken?: string;
}

let initializeCalls = 0;
const flatData = new Map<string, any[]>();
const pagedData = new Map<string, RecordResult[]>();
const pageCursor = new Map<string, number>();

/** Records of every readRecords call, for asserting the time window used. */
export const __readCalls: { recordType: string; options: ReadRecordsOptions }[] = [];

export async function initialize(): Promise<boolean> {
  initializeCalls += 1;
  return true;
}

const permissionCalls: unknown[][] = [];

export async function requestPermission(perms: unknown[]): Promise<unknown> {
  permissionCalls.push(perms);
  return perms;
}

/** Test helper: every permissions array passed to requestPermission. */
export function __permissionCalls(): unknown[][] {
  return permissionCalls;
}

export async function readRecords(
  recordType: string,
  options: ReadRecordsOptions,
): Promise<RecordResult> {
  __readCalls.push({ recordType, options });

  // Paged mode: return successive pages regardless of the time filter, so
  // pagination in healthConnect.readAll can be exercised.
  if (pagedData.has(recordType)) {
    const pages = pagedData.get(recordType)!;
    const idx = pageCursor.get(recordType) ?? 0;
    pageCursor.set(recordType, idx + 1);
    return pages[idx] ?? { records: [], pageToken: undefined };
  }

  // Flat mode: single page, filtered by the requested [startTime, endTime).
  const all = flatData.get(recordType) ?? [];
  const range = options.timeRangeFilter;
  const records = all.filter((r) => {
    const t: string | undefined = r.startTime ?? r.time;
    if (!t || !range) return true;
    return t >= range.startTime && t < range.endTime;
  });
  return { records, pageToken: undefined };
}

// Health Connect exposes exercise types as integer constants.
export const ExerciseType = {
  WALKING: 79,
  RUNNING: 56,
  STRENGTH_TRAINING: 71,
  BIKING: 8,
};

/** Test helper: set the full dataset for a record type (single page). */
export function __setRecords(recordType: string, records: any[]): void {
  flatData.set(recordType, records);
}

/** Test helper: set successive pages returned by readRecords for a type. */
export function __setPages(recordType: string, pages: RecordResult[]): void {
  pagedData.set(recordType, pages);
  pageCursor.set(recordType, 0);
}

/** Test helper: reset all datasets, call logs, and counters. */
export function __reset(): void {
  initializeCalls = 0;
  flatData.clear();
  pagedData.clear();
  pageCursor.clear();
  __readCalls.length = 0;
  permissionCalls.length = 0;
}

/** Test helper: how many times initialize() has been called. */
export function __initializeCalls(): number {
  return initializeCalls;
}
