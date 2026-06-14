// A module-level pointer to the draft the user is currently looking at (recorder/export). The
// background transcription engine reads it to caption that draft's clips *first*, so captions for
// what's on screen appear quickly instead of waiting behind the rest of the library. It's a plain
// signal (not React state) — the engine reads it when it builds each work batch; no render churn.
let activeDraftId: string | null = null;

export function setActiveDraft(id: string | null): void {
  activeDraftId = id;
}

export function getActiveDraft(): string | null {
  return activeDraftId;
}
