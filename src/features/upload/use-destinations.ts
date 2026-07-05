import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { deleteDestination, destinationsQuery } from '@/db/destinations';
import { getDestinationToken } from '@/db/secure-token';
import { useNow } from '@/hooks/use-now';

import {
  expiresAtMs,
  EXPIRY_CHECK_INTERVAL_MS,
  formatExpiry,
  isTokenExpired,
} from './capability-token';

/** One non-expired destination in the pool, ready to render (host/mode/expiry) or upload to. */
export type DestinationOption = {
  id: string;
  server: string;
  artifactId: string;
  uploadUnit: 'segment' | 'merged';
  token: string | null;
  /** Millisecond `exp` for a decodable token, else `null` (tokenless = no known expiry). */
  expiresAtMs: number | null;
  /** Preformatted expiry label ("No expiry" / "Expires in 4m" / …), so views don't read the clock. */
  expiryLabel: string;
};

/**
 * Shared read model over the device-wide destination pool (`upload_destinations`). Live-queries
 * the rows, loads each row's bearer token from expo-secure-store (which has no live-query
 * equivalent), filters out expired ones, and re-evaluates on a timer so expiry countdowns tick
 * and a token that lapses while the user is just sitting on screen drops out on its own.
 *
 * Consumed by both the home float (view/delete) and the export selector (select-and-upload), so
 * both surfaces agree on exactly which destinations are live.
 */
export function useDestinations() {
  const { data: rows } = useLiveQuery(destinationsQuery);
  // Reactive wall-clock so expiry filtering/labels re-evaluate as time passes, even without a DB
  // write — a token can lapse while the user just sits on the screen.
  const now = useNow(EXPIRY_CHECK_INTERVAL_MS);

  // Tokens live in secure-store keyed by row id; load them into a map keyed on id. Re-fires only
  // when the set of ids changes, not on every render.
  const idsKey = useMemo(() => rows.map((r) => r.id).join(','), [rows]);
  const [tokens, setTokens] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(',') : [];
    void Promise.all(ids.map((id) => getDestinationToken(id).then((t) => [id, t] as const))).then(
      (entries) => {
        if (!cancelled) setTokens(Object.fromEntries(entries));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const destinations: DestinationOption[] = useMemo(
    () =>
      rows
        .map((r) => ({ ...r, token: tokens[r.id] ?? null }))
        .filter((r) => !isTokenExpired(r.token, now))
        .map((r) => ({
          id: r.id,
          server: r.server,
          artifactId: r.artifactId,
          uploadUnit: r.uploadUnit,
          token: r.token,
          expiresAtMs: expiresAtMs(r.token),
          expiryLabel: formatExpiry(r.token, now),
        })),
    // `now` intentionally in deps so an expiry that passes between ticks re-filters the list.
    [rows, tokens, now],
  );

  // Garbage-collect rows whose token has actually lapsed so they don't linger as dead state.
  // Only acts on tokens we've loaded and can decode as expired (never on "unknown").
  useEffect(() => {
    for (const r of rows) {
      const token = tokens[r.id];
      if (token !== undefined && isTokenExpired(token, now)) {
        void deleteDestination(r.id);
      }
    }
  }, [rows, tokens, now]);

  return { destinations, deleteDestination };
}
