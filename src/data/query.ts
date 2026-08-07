import { QueryClient } from '@tanstack/react-query';

/**
 * The query layer.
 *
 * Vire's data is a handful of small per-user documents that only ever change
 * through this app's own mutations, so the cache does not need to be clever — it
 * needs to make a tap feel instant and to put the day's log back the way it was
 * when a write fails. That is what the optimistic mutations in ./useVireData do.
 */

/** Query keys, in one place so an invalidation cannot miss by a typo. */
export const queryKeys = {
  profile: ['profile'] as const,
  plan: ['plan'] as const,
  log: (date: string) => ['log', date] as const,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Nothing changes server-side except through this client, so refetching
        // on every mount would be pure latency. Focus refetch stays on: a PWA
        // resumed after hours in the background genuinely may be stale.
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
      mutations: {
        // One retry, because the alternative is rolling back a tap the user made
        // over a momentary blip and asking them to make it again.
        retry: 1,
      },
    },
  });
}
