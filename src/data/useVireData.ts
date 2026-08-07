import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DatedWeight, VireApi } from '@/api/types';
import { emptyLog } from '@/domain/log';
import { emptyGrocState } from '@/domain/groc-state';
import type { DailyLog, GrocState, Profile, StoredPlan } from '@/domain/schema';
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
interface DocWrite<T> {
  next: T;
  previous: T | null;
}

/** What a caller gets back from `useOptimisticDoc`. */
export interface DocHandle<T> {
  value: T;
  /** Apply a change to the freshest value there is, optimistically. */
  update: (change: (previous: T) => T) => void;
  /** False until the document has been read at least once. */
  ready: boolean;
  /** A write was rolled back; the UI owes the user an explanation. */
  saveFailed: boolean;
  dismissSaveError: () => void;
}

/**
 * One small document, read once and written optimistically.
 *
 * Both things this app writes constantly — the day's log and the grocery list —
 * want the same behaviour: the tap lands immediately, the request follows, and a
 * failure puts the previous value back and says so. Sharing the implementation is
 * mostly about two details that are easy to get wrong and were both wrong here
 * once:
 *
 * 1. The optimistic write happens **synchronously in `update`**, not in
 *    `onMutate`. `onMutate` can only run after an await, which puts the cache
 *    behind the tap — and two taps in the same frame would then both compute from
 *    the pre-tap value, the second erasing the first. Writing the cache here makes
 *    each tap see the one before it, which is why the rollback value has to travel
 *    with the mutation instead of being read inside it.
 * 2. `cancelQueries` reverts a query to its pre-fetch data by default, which
 *    asynchronously undoes the very write it is meant to protect. Hence
 *    `revert: false`.
 */
function useOptimisticDoc<T>(options: {
  queryKey: readonly unknown[];
  read: () => Promise<T | null>;
  write: (next: T) => Promise<T>;
  /** What an absent document reads as. */
  empty: () => T;
  onSaved?: () => void;
  onError?: (error: unknown) => void;
}): DocHandle<T> {
  const queryClient = useQueryClient();
  const { queryKey, read, write, empty, onSaved, onError } = options;

  const query = useQuery({ queryKey, queryFn: read });

  const mutation = useMutation({
    mutationFn: ({ next }: DocWrite<T>) => write(next),
    onError: (error, { previous }) => {
      // A tap that silently did nothing is worse than one that visibly failed,
      // which is why `saveFailed` is part of the handle.
      queryClient.setQueryData(queryKey, previous);
      onError?.(error);
    },
    onSuccess: (stored) => {
      // The server's parsed copy, so the client converges on the real defaults.
      queryClient.setQueryData(queryKey, stored);
      onSaved?.();
    },
  });

  const update = (change: (previous: T) => T) => {
    // See note 2 above: without `revert: false` this undoes the write below.
    void queryClient.cancelQueries({ queryKey }, { revert: false });

    const previous = queryClient.getQueryData<T | null>(queryKey) ?? null;
    const next = change(previous ?? empty());
    queryClient.setQueryData(queryKey, next);
    mutation.mutate({ next, previous });
  };

  return {
    value: query.data ?? empty(),
    update,
    ready: !query.isPending,
    saveFailed: mutation.isError,
    dismissSaveError: mutation.reset,
  };
}

export interface DailyLogHandle extends DocHandle<DailyLog> {
  log: DailyLog;
  /** The date this handle is reading and writing. */
  date: string;
}

/**
 * The log for one client-local date.
 *
 * The date is part of the query key, so midnight passing while the app is open
 * simply changes the key and the new day's log loads on its own.
 */
export function useDailyLog(api: VireApi, date: string): DailyLogHandle {
  const queryClient = useQueryClient();
  const doc = useOptimisticDoc<DailyLog>({
    queryKey: queryKeys.log(date),
    read: () => api.getLog(date),
    write: (next) => api.saveLog(date, next),
    empty: emptyLog,
    // The adherence summary counts this day, so it is now stale.
    onSaved: () => void queryClient.invalidateQueries({ queryKey: queryKeys.logs }),
    onError: (error) => console.error('[vire] Saving the day’s log failed', error),
  });

  return { ...doc, log: doc.value, date };
}

export interface GrocStateHandle extends DocHandle<GrocState> {
  groc: GrocState;
}

/**
 * The grocery list's ticks and store tags, scoped to a plan (E4.1).
 *
 * The plan id is in the query key, so activating a new week reads fresh state
 * rather than showing last week's ticks against this week's food.
 */
export function useGrocState(api: VireApi, planId: string): GrocStateHandle {
  const doc = useOptimisticDoc<GrocState>({
    queryKey: queryKeys.groc(planId),
    read: () => api.getGrocState(planId),
    write: (next) => api.saveGrocState(planId, next),
    empty: emptyGrocState,
    onError: (error) => console.error('[vire] Saving the grocery list failed', error),
  });

  return { ...doc, groc: doc.value };
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
