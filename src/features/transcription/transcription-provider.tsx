import { createContext, useContext } from 'react';

import { useLibraryTranscription, type TranscriptionStatus } from './use-library-transcription';

const StatusContext = createContext<TranscriptionStatus>({ kind: 'idle' });

/**
 * Mounts the single global transcription engine for the app's lifetime and exposes its coarse
 * status via context. Place once near the root, above all screens, so captions are generated in
 * the background regardless of which screen is open.
 */
export function TranscriptionProvider({ children }: { children: React.ReactNode }) {
  const status = useLibraryTranscription();
  return <StatusContext.Provider value={status}>{children}</StatusContext.Provider>;
}

/** Current background transcription status (idle / deleting / downloading / transcribing). */
export const useTranscriptionStatus = () => useContext(StatusContext);
