import { useEffect, useState } from 'react';

/**
 * Wall-clock `Date.now()` as reactive state, refreshed every `intervalMs`. Unlike `useTick`
 * (which only forces a re-render), this returns the timestamp itself as a *stable* value for the
 * render — so callers can derive time-based UI (expiry countdowns) and use it in memo/effect
 * dependencies without calling the impure `Date.now()` in render, and without recomputing on
 * every unrelated render. The time only moves forward on each interval tick.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
