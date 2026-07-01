import { useLinkingURL } from 'expo-linking';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { setPendingPairing } from '@/db/pairing';
import { useToast } from '@/features/toast/toast-provider';

import { CAPABILITIES_REJECTION_MESSAGE, checkCapabilities } from './capabilities';
import { parseUploadDeepLink } from './deep-link';

const REJECTION_MESSAGE: Record<'unsupported-version' | 'invalid-link', string> = {
  'unsupported-version':
    'This upload link needs a newer version of Pulse. Update the app and try again.',
  'invalid-link': 'This upload link looks damaged. Ask for a new one and try again.',
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Mounts the single global `pulsecam://` deep-link listener for the app's
 * lifetime, matching `TranscriptionProvider`'s pattern — a provider rather
 * than a bare hook, so it's guaranteed to subscribe exactly once regardless
 * of where it's rendered, avoiding duplicate-listener bugs.
 *
 * No confirm screen: a recognized link is connected to immediately. Success
 * just stores a global "pending pairing" (db/pairing.ts) and toasts — it
 * does NOT pick a draft. Any draft (a fresh recording or an existing one)
 * can claim it later from its export screen, matching the "this server can
 * receive one upload from this device" single-use model without forcing
 * that choice up front.
 */
export function UploadDeepLinkProvider({ children }: { children: React.ReactNode }) {
  const url = useLinkingURL();
  const handledUrl = useRef<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!url || url === handledUrl.current || !url.startsWith('pulsecam://')) return;
    handledUrl.current = url;

    const result = parseUploadDeepLink(url);
    if (!result.ok) {
      Alert.alert("Can't open this link", REJECTION_MESSAGE[result.reason]);
      return;
    }

    const { link } = result;
    const host = hostOf(link.server);

    void checkCapabilities(link.server).then((capResult) => {
      if (!capResult.ok) {
        Alert.alert("Can't connect", CAPABILITIES_REJECTION_MESSAGE[capResult.reason]);
        return;
      }
      void setPendingPairing({
        server: link.server,
        token: link.token,
        artifactId: link.artifactId,
        uploadUnit: capResult.capabilities.uploadUnit,
      }).then(() => {
        showToast(`Connected to ${host} — open a pulse or make a new one to upload`);
      });
    });
  }, [url, showToast]);

  return children;
}
