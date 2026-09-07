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

const ISO_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a YYYY-MM-DD string into its numeric parts, throwing immediately
 *  on malformed input instead of letting NaN components silently propagate
 *  into `Date.UTC` and surface later as an opaque "Invalid Date". Every
 *  function below routes through this single parser. */
function parseIsoDate(isoDate: string): { y: number; m: number; d: number } {
  const match = ISO_DATE_SHAPE.exec(isoDate);
  if (!match) {
    throw new RangeError(`Invalid ISO date (expected YYYY-MM-DD): ${JSON.stringify(isoDate)}`);
  }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Adds n days to a YYYY-MM-DD string (pure calendar math, no timezones). */
export function addDays(isoDate: string, n: number): string {
  const { y, m, d } = parseIsoDate(isoDate);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing the given YYYY-MM-DD date. */
export function mondayOf(isoDate: string): string {
  const { y, m, d } = parseIsoDate(isoDate);
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
  const { y: fy, m: fm, d: fd } = parseIsoDate(from);
  const { y: ty, m: tm, d: td } = parseIsoDate(to);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

/** Human "Mon Jan 5" label for a YYYY-MM-DD date. */
export function shortLabel(isoDate: string): string {
  const { y, m, d } = parseIsoDate(isoDate);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Compact "M/D" label for a YYYY-MM-DD date — chart axis/tooltip format. */
export function shortMonthDay(isoDate: string): string {
  const { m, d } = parseIsoDate(isoDate);
  return `${m}/${d}`;
}
