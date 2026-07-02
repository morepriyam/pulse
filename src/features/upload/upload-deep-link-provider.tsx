import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { setPendingPairing } from '@/db/pairing';
import { useToast } from '@/features/toast/toast-provider';

import { CAPABILITIES_REJECTION_MESSAGE, checkCapabilities } from './capabilities';
import { parseUploadDeepLink } from './deep-link';
import { cleanupStaleUploadTempFiles } from './native-chunk-upload';

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
 * Trust-on-first-use gate (PROTOCOL.md §3): asks the user to confirm the
 * server's origin before the app makes any request to it — not just a toast
 * after the fact. Resolves `false` on cancel or dismiss (tap outside / back
 * button), never defaulting to "proceed".
 */
function confirmPairing(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Connect to this server?',
      `Pulse will pair with "${host}" and upload to it. Only continue if you recognize this server and opened or scanned this link yourself.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Connect', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Mounts the single global `pulsecam://` deep-link listener for the app's
 * lifetime, matching `TranscriptionProvider`'s pattern — a provider rather
 * than a bare hook, so it's guaranteed to subscribe exactly once regardless
 * of where it's rendered, avoiding duplicate-listener bugs.
 *
 * A recognized link asks the user to confirm the server's origin (TOFU)
 * before anything is fetched from it. Confirming just stores a global
 * "pending pairing" (db/pairing.ts) and toasts — it does NOT pick a draft.
 * Any draft (a fresh recording or an existing one) can claim it later from
 * its export screen, matching the "this server can receive one upload from
 * this device" single-use model without forcing that choice up front.
 */
export function UploadDeepLinkProvider({ children }: { children: React.ReactNode }) {
  const url = useLinkingURL();
  const handledUrl = useRef<string | null>(null);
  const { showToast } = useToast();

  // Best-effort sweep of orphaned tus-resume temp files from a previous
  // launch that was killed mid-upload — see `cleanupStaleUploadTempFiles`.
  useEffect(() => {
    cleanupStaleUploadTempFiles();
  }, []);

  useEffect(() => {
    if (!url || url === handledUrl.current || !url.startsWith('pulsecam://')) return;
    handledUrl.current = url;

    // Expo Router has no route matching this scheme-only URL (no path, just query params), so
    // its own automatic Linking-to-route resolution pushes the root route on top of whatever
    // screen was already open (PROTOCOL.md §3 — this link is data-only, never meant to navigate
    // anywhere on its own). By the time this effect runs, that push has already happened — this
    // provider is the parent of `<Stack>`, so its own linking subscription fires first. Collapse
    // it back to a single screen immediately, before even asking to confirm the pairing, so a
    // rejected/invalid link doesn't leave the extra screen behind either.
    // Guarded: when the link arrives with the app already on the root screen
    // (e.g. warm resume from background), nothing is stacked and an unguarded
    // dismissAll logs a dev-only unhandled POP_TO_TOP warning.
    if (router.canDismiss()) router.dismissAll();

    const result = parseUploadDeepLink(url);
    if (!result.ok) {
      Alert.alert("Can't open this link", REJECTION_MESSAGE[result.reason]);
      return;
    }

    const { link } = result;
    const host = hostOf(link.server);

    void confirmPairing(host).then((confirmed) => {
      if (!confirmed) {
        // Nothing was persisted and no request was made — let the same link be
        // scanned/opened again if the user changes their mind.
        handledUrl.current = null;
        return;
      }
      return checkCapabilities(link.server)
        .then((capResult) => {
          if (!capResult.ok) {
            Alert.alert("Can't connect", CAPABILITIES_REJECTION_MESSAGE[capResult.reason]);
            return;
          }
          // The link's own `uploadUnit` (if present) is a per-session override of the
          // deployment-wide value `/capabilities` reports (PROTOCOL.md §3, §8) — prefer it.
          // `/capabilities` is still fetched regardless, for the protocol-version check above.
          return setPendingPairing({
            server: link.server,
            token: link.token,
            artifactId: link.artifactId,
            uploadUnit: link.uploadUnit ?? capResult.capabilities.uploadUnit,
          }).then(() => {
            showToast(`Connected to ${host} — open a pulse or make a new one to upload`);
          });
        })
        .catch(() => {
          // Let the same link be retried — nothing was persisted, so silently swallowing this
          // would leave the user stuck with no path forward but to restart the app.
          handledUrl.current = null;
          Alert.alert("Can't connect", CAPABILITIES_REJECTION_MESSAGE.unreachable);
        });
    });
  }, [url, showToast]);

  return children;
}
