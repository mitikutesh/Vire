import type { WeekdayIndex } from '@/domain/constants';
import type { ReportedDayState } from '@/domain/plan-stream';
import type { Profile, StoredPlan } from '@/domain/schema';

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
