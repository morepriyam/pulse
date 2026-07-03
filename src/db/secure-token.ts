import * as SecureStore from 'expo-secure-store';

/**
 * Upload capability tokens are live bearer credentials (§ pulsevault protocol) — kept in
 * the Keychain/Keystore via expo-secure-store instead of the plain-SQLite `projects`/
 * `settings` tables, which are unencrypted at rest and readable from an unencrypted device
 * backup or a rooted/jailbroken device.
 */
const draftTokenKey = (draftId: string) => `upload.token.${draftId}`;
const destinationTokenKey = (id: string) => `upload.dest.token.${id}`;

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

export async function getDestinationToken(id: string): Promise<string | null> {
  return (await SecureStore.getItemAsync(destinationTokenKey(id))) ?? null;
}

export async function setDestinationToken(id: string, token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(destinationTokenKey(id), token);
  else await SecureStore.deleteItemAsync(destinationTokenKey(id));
}

export async function deleteDestinationToken(id: string): Promise<void> {
  await SecureStore.deleteItemAsync(destinationTokenKey(id));
}
