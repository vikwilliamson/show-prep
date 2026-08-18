// Day bucketing: timestamps are stored as UTC, and the local calendar date
// (default America/Los_Angeles) is computed at ingest and stored in a
// local_date column.

export const DEFAULT_TIMEZONE = "America/Los_Angeles";

/** YYYY-MM-DD for an instant in the given IANA timezone. */
export function localDateOf(
  instant: Date | string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Today's local date in the given timezone. */
export function todayLocal(timeZone: string = DEFAULT_TIMEZONE): string {
  return localDateOf(new Date(), timeZone);
}

/** Adds n days to a YYYY-MM-DD string (pure calendar math, no timezones). */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing the given YYYY-MM-DD date. */
export function mondayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(isoDate, diff);
}

/** The 7 dates (Mon..Sun) of the week starting at weekStart. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Whole days from `from` until `to` (both YYYY-MM-DD); negative if past. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

/** Human "Mon Jan 5" label for a YYYY-MM-DD date. */
export function shortLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
