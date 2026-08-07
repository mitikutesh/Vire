import type { WeekdayIndex } from '@/domain/constants';
import type { ReportedDayState } from '@/domain/plan-stream';
import type { DailyLog, GrocState, Profile, StoredPlan } from '@/domain/schema';

/** A day's log with the date it belongs to. */
export interface DatedLog extends DailyLog {
  date: string;
}

/** A weigh-in as stored, with the date it belongs to. */
export interface DatedWeight {
  date: string;
  kg: number;
}

/** The profile without the target, which only the server may set. */
export type ProfileInput = Omit<Profile, 'target'>;

/**
 * The API port.
 *
 * Same reasoning as the auth and store ports: screens depend on this, so the
 * whole first-run and settings flow is testable with no Lambda, and `npm run
 * dev` works before anything is deployed.
 */
export interface VireApi {
  /** null when the user has no profile yet — what puts the app into first-run. */
  getProfile(): Promise<Profile | null>;

  /**
   * Save the profile and return it **as the server stored it**, including the
   * server-computed target. Callers must use the returned target rather than
   * their own preview: the two agree today, and the server's is authoritative
   * if they ever stop agreeing.
   */
  saveProfile(input: ProfileInput): Promise<Profile>;

  /** null when there is no active plan — what shows the plan gate. */
  getPlan(): Promise<StoredPlan | null>;

  /**
   * Generate a week, reporting each day as it lands so the gate can fill in
   * rather than spin. Resolves with the stored plan.
   *
   * Throws `PlanGenerationError` when the week did not come together, and
   * `ApiError` when the request was refused outright (no profile, rate limit).
   */
  generatePlan(onDay: (day: WeekdayIndex, state: ReportedDayState) => void): Promise<StoredPlan>;

  /**
   * Adopt the built-in starter week. No AI call, so this works with no key, no
   * quota left and a flaky provider — which is exactly when it gets used.
   */
  adoptStarterPlan(): Promise<StoredPlan>;

  /**
   * The log for one **client-local** date, or null if the day is untouched.
   *
   * The date is the caller's, never the server's: a Lambda in eu-north-1 and a
   * phone in Helsinki disagree for an hour twice a year, and dinner logged at
   * 23:30 must not land on tomorrow.
   */
  getLog(date: string): Promise<DailyLog | null>;

  /** Write the whole log for a date, returning it as the server parsed it. */
  saveLog(date: string, log: DailyLog): Promise<DailyLog>;

  /**
   * The grocery ticks and store tags for a plan.
   *
   * Scoped to the plan, not the user: regenerating a week must not leave last
   * week's ticks on ids that now mean different food.
   */
  getGrocState(planId: string): Promise<GrocState>;
  saveGrocState(planId: string, state: GrocState): Promise<GrocState>;

  /** The recent days, newest first, for the adherence summary (I3). */
  listLogs(): Promise<DatedLog[]>;

  /** Weigh-in history, oldest first, so a trend line reads left to right (I1). */
  listWeights(): Promise<DatedWeight[]>;

  /**
   * Record a weigh-in, and optionally let it move the calorie target.
   *
   * `applyToProfile` is explicit rather than defaulted: a target that changes
   * without being asked is a target the user stops trusting. The new target is
   * computed by the server either way — the client's preview is only a preview
   * (PLAN §7, guardrail 1).
   */
  saveWeighIn(
    date: string,
    kg: number,
    applyToProfile: boolean,
  ): Promise<{ entry: DatedWeight; profile: Profile }>;
}

/** A field-level validation failure the form can attribute to an input. */
export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Why generation did not produce a week.
 *
 * - `partial` — one or more days never came back; the server stored nothing.
 * - `not_saved` — every day generated, but the write failed.
 * - `dropped` — the stream ended without a verdict, and no plan had been stored
 *   by the time we checked. Its own case because the fix differs: a dropped
 *   connection is worth retrying immediately, a refused one is not.
 */
export type PlanFailure = 'partial' | 'not_saved' | 'dropped';

export class PlanGenerationError extends Error {
  constructor(
    readonly reason: PlanFailure,
    readonly failedDays: readonly number[] = [],
  ) {
    super(`plan_generation_${reason}`);
    this.name = 'PlanGenerationError';
  }
}
