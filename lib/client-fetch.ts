const GENERIC_ERROR = "Something went wrong. Please try again.";

function isErrorBody(body: unknown): body is { error: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  );
}

/**
 * fetch() + JSON parsing that treats a non-2xx response as a failure instead
 * of piping the error body straight into application state. Throws an Error
 * carrying the server's `{ error }` message when present, otherwise a
 * friendly generic message — never the raw response body.
 */
export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error(isErrorBody(body) ? body.error : GENERIC_ERROR);
  }
  return body as T;
}

export function errorMessage(err: unknown, fallback: string = GENERIC_ERROR): string {
  return err instanceof Error ? err.message : fallback;
}
