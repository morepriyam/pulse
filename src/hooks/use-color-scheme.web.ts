import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

// On web the scheme is only known after the client hydrates; until then we render
// 'light' to match the static HTML and avoid a hydration mismatch.
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: flip on mount to pick up the real scheme post-hydration
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
