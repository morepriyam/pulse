import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { uploads } from './upload-manager';

export const UPLOAD_RESUME_TASK = 'pulse-upload-resume';

/**
 * Module-scope task registration — `TaskManager.defineTask` MUST run in the global scope of the
 * bundle (never inside a component), so this file is imported for its side effect at app startup.
 * When the OS grants a background window — including after the app was killed and relaunched
 * headlessly — the task re-drives any uploads still pending (`ensureRunning` hydrates them from the
 * DB). On iOS this backs `BGTaskScheduler`; on Android, `WorkManager`.
 */
TaskManager.defineTask(UPLOAD_RESUME_TASK, async () => {
  try {
    await uploads.ensureRunning();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Register the resume task once. Idempotent and best-effort — background tasks are unavailable on
 * simulators / Expo Go, in which case the app-launch and AppState-active triggers still resume.
 */
export async function registerUploadResumeTask(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    if (!(await TaskManager.isTaskRegisteredAsync(UPLOAD_RESUME_TASK))) {
      // 15 min is the OS floor; the task only kicks off resume, so the exact cadence doesn't matter.
      await BackgroundTask.registerTaskAsync(UPLOAD_RESUME_TASK, { minimumInterval: 15 });
    }
  } catch {
    // Background tasks unavailable — foreground / AppState triggers still resume uploads.
  }
}
