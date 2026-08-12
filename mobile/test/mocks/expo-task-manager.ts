// Stand-in for expo-task-manager, wired in via tsconfig.test.json `paths`.
// Captures the task body registered at module load so tests can invoke it.

type TaskExecutor = (body?: unknown) => Promise<unknown> | unknown;

const tasks = new Map<string, TaskExecutor>();

export function defineTask(taskName: string, executor: TaskExecutor): void {
  tasks.set(taskName, executor);
}

/** Test helper: retrieve a registered task body by name. */
export function __getTask(taskName: string): TaskExecutor | undefined {
  return tasks.get(taskName);
}
