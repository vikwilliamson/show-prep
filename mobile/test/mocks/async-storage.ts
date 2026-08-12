// In-memory stand-in for @react-native-async-storage/async-storage, wired in
// via tsconfig.test.json `paths`. config.ts imports the real specifier and
// resolves here at test time, so the store below is the same singleton the
// code under test reads and writes.

const store = new Map<string, string>();
let failNextGet = false;

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    if (failNextGet) throw new Error("storage unavailable");
    return store.has(key) ? store.get(key)! : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async clear(): Promise<void> {
    store.clear();
  },
  async getAllKeys(): Promise<string[]> {
    return [...store.keys()];
  },
};

/** Test helper: wipe all persisted state between cases. */
export function __reset(): void {
  store.clear();
  failNextGet = false;
}

/** Test helper: make the next (and subsequent) getItem calls throw. */
export function __failGets(on: boolean): void {
  failNextGet = on;
}

/** Test helper: snapshot the raw store for assertions. */
export function __dump(): Map<string, string> {
  return new Map(store);
}

export default AsyncStorage;
