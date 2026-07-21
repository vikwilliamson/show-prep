import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { runSync } from "./sync";

// Periodic background sync (Android WorkManager under the hood). The OS
// decides exact timing; 15 min is the floor, real cadence is usually coarser.

const TASK_NAME = "show-prep-hc-sync";

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const result = await runSync();
    return result.ok
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(TASK_NAME, {
      minimumInterval: 60, // minutes
    });
  } catch {
    // Registration can fail in Expo Go or when the OS restricts background
    // work — manual sync still works.
  }
}
