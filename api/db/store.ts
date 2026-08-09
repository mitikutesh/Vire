import type {
  AiKey,
  AiKeyStatus,
  DailyLog,
  GrocState,
  OfferScan,
  Plan,
  Profile,
  StoredPlan,
  WeightEntry,
} from '@/domain/schema';
import type { GeneratedDay } from '../ai/types';
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

/**
 * A week that did not finish generating.
 *
 * Holds `GeneratedDay`, not `DayPlan`: the grocery list is aggregated from every
 * day's `items` at once, so a day that arrives without them cannot contribute to
 * the shopping list and would have to be generated again anyway.
 */
export interface PlanDraft {
  /**
   * Fingerprint of the profile inputs these days were generated against.
   *
   * The reason this type has a fingerprint at all: if the user edits their
   * allergies after a failed run, the days already in hand were generated under
   * the old ones. Serving them would put a stated allergen in front of someone
   * who just told us to exclude it, which is the worst thing this app can do.
   * A mismatch discards the draft rather than resuming it.
   */
  fp: string;
  /** Epoch ms of the run that produced these days; drives the age check. */
  created: number;
  /** Index is the weekday, Monday first. `null` means that day still needs generating. */
  days: (GeneratedDay | null)[];
}

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
   * Replace the active plan atomically: write the new plan, delete the previous
   * plan's grocery state and cached offers, and drop any generation draft, all
   * in one transaction.
   *
   * Doing this as one transaction is the fix for the plan-review blocker. Split
   * into separate writes, a failure between them leaves last week's checked
   * boxes and offer badges attached to this week's food.
   *
   * The draft goes here rather than in the generation route so that no path to
   * an active plan can leave one behind — adopting the starter plan clears it
   * too, which is what stops an abandoned half-week resuming days later.
   */
  activatePlan(userId: UserId, plan: Plan): Promise<StoredPlan>;

  /**
   * The unfinished week from a failed run, if there is one (E2.1).
   *
   * Callers must still check `fp` and `created` — neither store enforces them,
   * and the DynamoDB TTL is a sweeper rather than a read-time guarantee.
   */
  getPlanDraft(userId: UserId): Promise<PlanDraft | null>;
  putPlanDraft(userId: UserId, draft: PlanDraft): Promise<void>;

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
   *
   * `by` exists because generation is metered in provider calls, not requests: a
   * resumed run that regenerates one day must not cost the same slice of the
   * allowance as a full seven-day week.
   */
  bumpRateLimit(userId: UserId, action: string, day: string, by?: number): Promise<number>;

  /**
   * The user's own AI provider key (E7.6).
   *
   * `getAiKey` is for the server's own use when building a provider — never for a
   * response. Anything the client is allowed to see comes from `getAiKeyStatus`.
   */
  getAiKey(userId: UserId): Promise<AiKey | null>;
  putAiKey(userId: UserId, entry: AiKey): Promise<void>;
  deleteAiKey(userId: UserId): Promise<void>;
  getAiKeyStatus(userId: UserId): Promise<AiKeyStatus>;

  /**
   * Everything under the user's partition — powers export and deletion (I6).
   *
   * Excludes anything in `UNEXPORTABLE_SK`: the AI key is a billable credential,
   * and an export that carried it would be a way to exfiltrate one.
   */
  exportAll(userId: UserId): Promise<Record<string, unknown>[]>;
  deleteAll(userId: UserId): Promise<void>;
}
