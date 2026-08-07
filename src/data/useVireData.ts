import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VireApi } from '@/api/types';
import { emptyLog } from '@/domain/log';
import type { DailyLog, Profile, StoredPlan } from '@/domain/schema';
import { queryKeys } from './query';

/**
 * The app's data hooks.
 *
 * Profile and plan are plain reads — they change only when the user completes a
 * form or generates a week, and each of those already hands back the stored copy,
 * which is written straight into the cache rather than refetched.
 *
 * The log is the interesting one. Every tap on this app is a log write, so it
 * must land instantly and survive a bad network without lying: the cache is
 * updated first, the request follows, and a failure puts the previous log back
 * and says so.
 */

export function useProfile(api: VireApi) {
  return useQuery({ queryKey: queryKeys.profile, queryFn: () => api.getProfile() });
}

export function usePlan(api: VireApi, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.plan,
    queryFn: () => api.getPlan(),
    // Generation needs a profile, so a user without one cannot have a plan and
    // the request would be a guaranteed 404.
    enabled,
  });
}

/** One optimistic write, carrying what to restore if it fails. */
interface LogWrite {
  next: DailyLog;
  previous: DailyLog | null;
}

export interface DailyLogHandle {
  log: DailyLog;
  /** Apply a change to the freshest log there is, optimistically. */
  update: (change: (previous: DailyLog) => DailyLog) => void;
  /** False until the day's log has been read at least once. */
  ready: boolean;
  /** A write was rolled back; the UI owes the user an explanation. */
  saveFailed: boolean;
  dismissSaveError: () => void;
}

/**
 * The log for one client-local date.
 *
 * The date is part of the query key, so midnight passing while the app is open
 * simply changes the key and the new day's log loads on its own.
 */
export function useDailyLog(api: VireApi, date: string): DailyLogHandle {
  const queryClient = useQueryClient();
  const key = queryKeys.log(date);

  const query = useQuery({ queryKey: key, queryFn: () => api.getLog(date) });

  /**
   * The optimistic write happens in `update` below, not in `onMutate`.
   *
   * `onMutate` can only run after an await, which puts the cache update a
   * microtask behind the tap — and worse, two taps in the same frame would both
   * compute from the pre-tap log and the second would erase the first. Writing
   * the cache synchronously in `update` makes each tap see the one before it, so
   * the rollback value has to travel with the mutation instead of being read
   * inside it.
   */
  const mutation = useMutation({
    mutationFn: ({ next }: LogWrite) => api.saveLog(date, next),
    onError: (error, { previous }) => {
      // Put it back. A tap that silently did nothing is worse than one that
      // visibly failed, which is why `saveFailed` is part of the handle.
      queryClient.setQueryData(key, previous);
      console.error('[vire] Saving the day’s log failed', error);
    },
    onSuccess: (stored) => {
      // The server's parsed copy, so the client converges on the real defaults.
      queryClient.setQueryData(key, stored);
    },
  });

  const update = (change: (previous: DailyLog) => DailyLog) => {
    // Abort any read still in flight: it predates the tap, and letting it land
    // would overwrite what the user just did. `revert: false` is essential —
    // cancelling reverts the query to its pre-fetch data by default, which would
    // asynchronously undo the optimistic write two lines below.
    void queryClient.cancelQueries({ queryKey: key }, { revert: false });

    const previous = queryClient.getQueryData<DailyLog | null>(key) ?? null;
    const next = change(previous ?? emptyLog());
    queryClient.setQueryData(key, next);
    mutation.mutate({ next, previous });
  };

  return {
    log: query.data ?? emptyLog(),
    update,
    ready: !query.isPending,
    saveFailed: mutation.isError,
    dismissSaveError: mutation.reset,
  };
}

/** Write a freshly saved profile straight into the cache. */
export function useProfileWriter() {
  const queryClient = useQueryClient();
  return (profile: Profile) => queryClient.setQueryData(queryKeys.profile, profile);
}

/** Write a freshly activated plan straight into the cache. */
export function usePlanWriter() {
  const queryClient = useQueryClient();
  return (plan: StoredPlan) => queryClient.setQueryData(queryKeys.plan, plan);
}
