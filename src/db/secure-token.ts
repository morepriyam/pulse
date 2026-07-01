import * as SecureStore from 'expo-secure-store';

/**
 * Upload capability tokens are live bearer credentials (§ pulsevault protocol) — kept in
 * the Keychain/Keystore via expo-secure-store instead of the plain-SQLite `projects`/
 * `settings` tables, which are unencrypted at rest and readable from an unencrypted device
 * backup or a rooted/jailbroken device.
 */
const draftTokenKey = (draftId: string) => `upload.token.${draftId}`;
const PENDING_PAIRING_TOKEN_KEY = 'upload.pendingPairing.token';

export async function getDraftToken(draftId: string): Promise<string | null> {
  return (await SecureStore.getItemAsync(draftTokenKey(draftId))) ?? null;
}

export async function setDraftToken(draftId: string, token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(draftTokenKey(draftId), token);
  else await SecureStore.deleteItemAsync(draftTokenKey(draftId));
}

export async function deleteDraftToken(draftId: string): Promise<void> {
  await SecureStore.deleteItemAsync(draftTokenKey(draftId));
}

export async function getPendingPairingToken(): Promise<string | null> {
  return (await SecureStore.getItemAsync(PENDING_PAIRING_TOKEN_KEY)) ?? null;
}

export async function setPendingPairingToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(PENDING_PAIRING_TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(PENDING_PAIRING_TOKEN_KEY);
}

export async function deletePendingPairingToken(): Promise<void> {
  await SecureStore.deleteItemAsync(PENDING_PAIRING_TOKEN_KEY);
}
