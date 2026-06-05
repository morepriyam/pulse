import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { CameraType, CameraView } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';

import {
  addSegment,
  createDraft,
  deleteDraft,
  deleteSegment,
  reorderSegments,
  segmentsForDraft,
} from '@/db/drafts';
import { absolutize, persistRecording } from '@/utils/file-store';
import { getDurationMs } from '@/utils/video';

export const STABILIZATION_MODES = ['off', 'standard', 'cinematic', 'auto'] as const;
export type StabilizationMode = (typeof STABILIZATION_MODES)[number];

export function useRecorder(initialDraftId?: string) {
  const cameraRef = useRef<CameraView>(null);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [torch, setTorch] = useState(false);
  const [stabilization, setStabilization] = useState<StabilizationMode>('off');

  const { data: segments } = useLiveQuery(segmentsForDraft(draftId ?? ''), [draftId]);

  // Drop a draft this session created but left empty (recorded then deleted) so it doesn't
  // litter Home. Resumed drafts are never touched — their segments may still be loading.
  const sessionDraftId = useRef<string | null>(null);
  const segmentCount = useRef(0);
  useEffect(() => {
    segmentCount.current = segments.length;
  }, [segments]);
  useEffect(
    () => () => {
      if (sessionDraftId.current && segmentCount.current === 0) {
        void deleteDraft(sessionDraftId.current);
      }
    },
    [],
  );

  async function startRecording() {
    if (!cameraRef.current || isRecording || !cameraReady) return;
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync();
      if (!video?.uri) return;

      let id = draftId;
      if (!id) {
        id = await createDraft();
        sessionDraftId.current = id;
        setDraftId(id);
      }

      const segmentId = `${id}-${Date.now()}`;
      const originalFilename = await persistRecording(video.uri, id, segmentId);
      const durationMs = await getDurationMs(absolutize(originalFilename));
      await addSegment(id, { id: segmentId, originalFilename, durationMs });
    } catch {
      // interrupted mid-record — drop the clip
    } finally {
      setIsRecording(false);
    }
  }

  function toggleRecording() {
    if (isRecording) cameraRef.current?.stopRecording();
    else void startRecording();
  }

  function flipCamera() {
    setFacing((prev) => {
      const next = prev === 'back' ? 'front' : 'back';
      if (next === 'front') setTorch(false);
      return next;
    });
  }

  function cycleStabilization() {
    setStabilization((prev) => {
      const next = (STABILIZATION_MODES.indexOf(prev) + 1) % STABILIZATION_MODES.length;
      return STABILIZATION_MODES[next];
    });
  }

  return {
    cameraRef,
    draftId,
    segments,
    isRecording,
    cameraReady,
    facing,
    torch,
    stabilization,
    onCameraReady: () => setCameraReady(true),
    toggleRecording,
    flipCamera,
    toggleTorch: () => setTorch((prev) => !prev),
    cycleStabilization,
    deleteSegment: (id: string) => void deleteSegment(id),
    reorderSegments: (ids: string[]) => void reorderSegments(ids),
  };
}
