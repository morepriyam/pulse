import { AppState } from 'react-native';

/**
 * Resolves once the app is foregrounded — pass as `tus-client.ts`'s
 * `waitUntilForeground` so an in-flight upload pauses while backgrounded
 * instead of fighting the OS for network/CPU. Kept in its own module (not
 * inside `tus-client.ts`) so that module stays free of `react-native`
 * imports and testable under this project's pure-logic jest config.
 */
export function waitUntilAppForeground(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  }
  if (AppState.currentState === 'active') return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      subscription.remove();
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      subscription.remove();
      signal?.removeEventListener('abort', onAbort);
      resolve();
    });
    signal?.addEventListener('abort', onAbort);
  });
}
