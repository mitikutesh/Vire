/**
 * Single-table key layout (PLAN §4).
 *
 * Every item a user owns lives under one partition, so a user's whole dataset
 * is one query — and an export or an account deletion is one scan of one
 * partition rather than a join across tables.
 *
 * The partition key is built from the Cognito subject and nothing else. It is
 * never assembled from request input; see api/auth/identity.ts for why.
 */

export const PK_PREFIX = 'USER#';

export type UserId = string & { readonly __brand: 'UserId' };

/** The user's partition. */
export const pk = (userId: UserId): string => `${PK_PREFIX}${userId}`;

export const SK = {
  profile: 'PROFILE',
  /** Exactly one active plan per user, so the sort key is a constant. */
  activePlan: 'PLAN#ACTIVE',
  notifyPrefs: 'PREFS#NOTIFY',

  /** Checked boxes and store tags, scoped to the plan they belong to. */
  grocState: (planId: string) => `GROCSTATE#${planId}`,
  /**
   * Cached offer scan, scoped to the plan. Plan-scoping is what stops a stale
   * badge landing on a different food after the week is regenerated — the
   * blocker the plan review caught.
   */
  offers: (planId: string) => `OFFERS#${planId}`,

  /** One log per client-local date, `YYYY-MM-DD`. */
  log: (date: string) => `LOG#${date}`,
  /** One weigh-in per date; a second entry for the same day replaces it. */
  weight: (date: string) => `WEIGHT#${date}`,
  /** Per-user, per-action, per-day counter for AI route rate limits. */
  rateLimit: (action: string, day: string) => `RL#${action}#${day}`,
  /** One item per push subscription endpoint. */
  push: (endpointHash: string) => `PUSH#${endpointHash}`,
} as const;

/** Sort-key prefixes, for range queries over one kind of item. */
export const SK_PREFIX = {
  log: 'LOG#',
  weight: 'WEIGHT#',
  grocState: 'GROCSTATE#',
  offers: 'OFFERS#',
  rateLimit: 'RL#',
  push: 'PUSH#',
} as const;

/** `LOG#2026-08-07` → `2026-08-07`. Returns null for any other sort key. */
export function dateFromLogKey(sortKey: string): string | null {
  return sortKey.startsWith(SK_PREFIX.log) ? sortKey.slice(SK_PREFIX.log.length) : null;
}

/** `WEIGHT#2026-08-07` → `2026-08-07`. */
export function dateFromWeightKey(sortKey: string): string | null {
  return sortKey.startsWith(SK_PREFIX.weight) ? sortKey.slice(SK_PREFIX.weight.length) : null;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dates arrive from the client (the log day is the device's local day), so the
 * format is checked before it becomes part of a key.
 */
export function assertDateKey(date: string): string {
  if (!DATE_KEY.test(date)) {
    throw new Error(`Invalid date key: ${JSON.stringify(date)} (expected YYYY-MM-DD)`);
  }
  return date;
}
