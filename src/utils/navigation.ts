import { router } from 'expo-router';

/**
 * Close a presented screen (recorder / export) reliably.
 *
 * `router.back()` dispatches GO_BACK, which throws "The action 'GO_BACK' was not
 * handled by any navigator" when the screen is the ROOT of the stack — e.g. a cold
 * start or dev fast-refresh that lands straight on /recorder, with no /index beneath
 * it to pop to. Guard on canGoBack() and otherwise reset to home so the X always works.
 */
export function closeToHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
