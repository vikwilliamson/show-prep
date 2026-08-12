// Stand-in for expo-background-task, wired in via tsconfig.test.json `paths`.

export enum BackgroundTaskResult {
  Success = 1,
  Failed = 2,
}

let throwOnRegister = false;
export const __registerCalls: { taskName: string; options: unknown }[] = [];

export async function registerTaskAsync(
  taskName: string,
  options?: unknown,
): Promise<void> {
  __registerCalls.push({ taskName, options });
  if (throwOnRegister) throw new Error("background work restricted by OS");
}

/** Test helper: make registerTaskAsync reject (Expo Go / OS restriction). */
export function __setThrowOnRegister(on: boolean): void {
  throwOnRegister = on;
}

/** Test helper: reset call log and behavior. */
export function __reset(): void {
  throwOnRegister = false;
  __registerCalls.length = 0;
}
