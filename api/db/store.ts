import type {
  DailyLog,
  GrocState,
  OfferScan,
  Plan,
  Profile,
  StoredPlan,
  WeightEntry,
} from '@/domain/schema';
import type { UserId } from './keys';

/**
 * The data layer's port.
 *
 * Routes depend on this interface, not on DynamoDB. Two payoffs: the
 * authorization tests run against an in-memory implementation with no AWS
 * account and no network, and a route cannot reach around the repository to
 * build its own key (which is where isolation bugs come from).
 *
 * Every method takes a `UserId`, which can only be produced from verified token
 * claims — see api/auth/identity.ts.
 */

// GrocState lives in @/domain/schema: the client reads and writes it too, and
// one declaration is the only way the two stay in agreement.
export type { GrocState };

// OfferScan lives in @/domain/schema for the same reason as GrocState: the client
// reads it, and one declaration is the only way the two stay in agreement.
export type { OfferScan };

// StoredPlan lives in @/domain/schema: it is a wire shape the client reads too,
// and one declaration is the only way the two stay in agreement.
export type { StoredPlan };

export interface DatedWeight extends WeightEntry {
  date: string;
}

export interface DatedLog extends DailyLog {
  date: string;
}

export interface VireStore {
  getProfile(userId: UserId): Promise<Profile | null>;
  putProfile(userId: UserId, profile: Profile): Promise<void>;

  getActivePlan(userId: UserId): Promise<StoredPlan | null>;
  /**
   * Replace the active plan atomically: write the new plan and delete the
   * previous plan's grocery state and cached offers in one transaction.
   *
   * Doing this as one transaction is the fix for the plan-review blocker. Split
   * into separate writes, a failure between them leaves last week's checked
   * boxes and offer badges attached to this week's food.
   */
  activatePlan(userId: UserId, plan: Plan): Promise<StoredPlan>;

  getGrocState(userId: UserId, planId: string): Promise<GrocState>;
  putGrocState(userId: UserId, planId: string, state: GrocState): Promise<void>;

  getOffers(userId: UserId, planId: string): Promise<OfferScan | null>;
  putOffers(userId: UserId, planId: string, scan: OfferScan): Promise<void>;

  getLog(userId: UserId, date: string): Promise<DailyLog | null>;
  putLog(userId: UserId, date: string, log: DailyLog): Promise<void>;
  /** Most recent first, for the 7-day adherence summary (I3). */
  listLogs(userId: UserId, limit: number): Promise<DatedLog[]>;

  putWeight(userId: UserId, date: string, entry: WeightEntry): Promise<void>;
  /** Oldest first, so the trend line reads left to right (I1). */
  listWeights(userId: UserId, limit: number): Promise<DatedWeight[]>;

  /**
   * Increment and return today's count for a rate-limited action. Atomic,
   * because two concurrent generate requests must not both see "0 used".
   */
  bumpRateLimit(userId: UserId, action: string, day: string): Promise<number>;

  /** Everything under the user's partition — powers export and deletion (I6). */
  exportAll(userId: UserId): Promise<Record<string, unknown>[]>;
  deleteAll(userId: UserId): Promise<void>;
}
