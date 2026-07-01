import { useEffect, useState } from 'react';

/**
 * Forces a re-render every `intervalMs` while `enabled`. For UI that has to react to wall-clock
 * time passing on its own — e.g. an upload button that must stop offering itself the moment a
 * pairing token's `exp` passes, even if the user never touches the screen.
 */
export function useTick(intervalMs: number, enabled = true): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
