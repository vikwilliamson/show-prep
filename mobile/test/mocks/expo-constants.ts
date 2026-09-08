// Stand-in for expo-constants, wired in via tsconfig.test.json `paths`.
// config.ts reads Constants.expoConfig?.extra for the baked-in serverUrl/apiKey
// defaults — this mock lets tests control what that "build config" contains.

const DEFAULT_EXTRA: Record<string, unknown> = {
  serverUrl: "https://prep.example.com",
  apiKey: "test-api-key",
};

let extra: Record<string, unknown> = { ...DEFAULT_EXTRA };

const Constants = {
  get expoConfig() {
    return { extra };
  },
};

/** Test helper: control what expoConfig.extra returns. */
export function __setExtra(next: Record<string, unknown>): void {
  extra = next;
}

/** Test helper: reset to the default baked-in config used by most tests. */
export function __reset(): void {
  extra = { ...DEFAULT_EXTRA };
}

export default Constants;
