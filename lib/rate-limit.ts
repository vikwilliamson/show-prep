interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Minimal in-memory fixed-window rate limiter keyed by an arbitrary string
 * (e.g. client IP). Best-effort on Vercel — each serverless instance has
 * its own memory, so this doesn't bound a determined attacker spread across
 * many cold starts, but it closes the trivial single-instance repeat-request
 * case, which is what actually matters at this app's current scale (see
 * specs/client-accounts.md's Auth-hardening follow-ups, VIK-127).
 */
export function checkRateLimit(key: string, opts: { windowMs: number; max: number }): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= opts.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= opts.max) return false;
  bucket.count += 1;
  return true;
}

/** Clears one key's bucket, or every bucket when called with no key. */
export function resetRateLimit(key?: string): void {
  if (key) buckets.delete(key);
  else buckets.clear();
}
