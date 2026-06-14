// A tiny module-level flag the recorder sets while the camera is actively recording. The global
// transcription engine checks it between clips and yields, so Whisper inference never competes with
// capture. It's a plain signal (not React state) so updating it from the recorder doesn't trigger
// renders; the engine re-checks it on its own cadence and the recorder pokes it to resume.
let recording = false;
let onResume: (() => void) | null = null;

export function setRecordingActive(active: boolean): void {
  const was = recording;
  recording = active;
  if (was && !active) onResume?.(); // recording just stopped — let the engine resume
}

export function isRecordingActive(): boolean {
  return recording;
}

/** The engine registers a callback to be poked when recording stops. */
export function setResumeHandler(fn: (() => void) | null): void {
  onResume = fn;
}
