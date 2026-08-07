import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DatedWeight, VireApi } from '@/api/types';
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
  /** The date this handle is reading and writing. */
  date: string;
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
      // The adherence summary counts this day, so it is now stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.logs });
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
    date,
    update,
    ready: !query.isPending,
    saveFailed: mutation.isError,
    dismissSaveError: mutation.reset,
  };
}

/** The recent days, newest first, for the adherence summary (I3). */
export function useLogs(api: VireApi, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.logs, queryFn: () => api.listLogs(), enabled });
}

/**
 * Weigh-in history, oldest first (I1).
 *
 * Read on every session because the weekly prompt needs to know how long it has
 * been — which is also why it is not gated behind opening the Week tab.
 */
export function useWeights(api: VireApi, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.weights, queryFn: () => api.listWeights(), enabled });
}

export interface WeighInResult {
  entry: DatedWeight;
  profile: Profile;
}

/**
 * Record a weigh-in.
 *
 * Not optimistic, deliberately. Unlike a meal tick, this can move the calorie
 * target — and showing a new target that then fails to save would be worse than a
 * moment's wait. The profile the server returns is written into the cache, so the
 * whole app picks up the new target at once.
 */
export function useWeighIn(api: VireApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      date,
      kg,
      applyToProfile,
    }: {
      date: string;
      kg: number;
      applyToProfile: boolean;
    }) => api.saveWeighIn(date, kg, applyToProfile),
    onSuccess: ({ profile }) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.weights });
    },
  });
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
