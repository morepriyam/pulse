import { router } from 'expo-router';
import { useEffect } from 'react';

import { isOnboardingComplete } from '@/db/settings';

/** Flip to `true` to force the onboarding flow on every launch while developing. */
const FORCE_ONBOARDING_IN_DEV = true;

/**
 * Runs once on home-screen mount: if the user hasn't completed onboarding, push
 * the flow on top of home (as a full-screen modal). Home stays mounted beneath,
 * so its live queries keep running while the tour is shown.
 */
export function useOnboardingRedirect(): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const complete = await isOnboardingComplete();
      if (cancelled) return;
      if (!complete || (__DEV__ && FORCE_ONBOARDING_IN_DEV)) {
        router.push('/onboarding');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
