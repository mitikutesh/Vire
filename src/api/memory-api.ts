import { WEEKDAYS, type WeekdayIndex } from '@/domain/constants';
import type { ReportedDayState } from '@/domain/plan-stream';
import { dailyLogSchema, profileSchema, weightEntrySchema } from '@/domain/schema';
import type { DailyLog, Profile, StoredPlan } from '@/domain/schema';
import { calcTarget } from '@/domain/target';
import { starterPlan } from '@/content/starter-plan';
import {
  ApiError,
  PlanGenerationError,
  type DatedLog,
  type DatedWeight,
  type ProfileInput,
  type VireApi,
} from './types';

/**
 * In-memory API, for tests and for `npm run dev` before a Lambda exists.
 *
 * It computes the target with the *same* `calcTarget` the route uses, so the
 * floors behave identically here and in production — the point of the fake is to
 * remove the network, not to reimplement the rules.
 *
 * Generation returns the starter week's days, since there is no provider here.
 * It is marked `starter: false` because it stands in for a generated plan, and
 * the views branch on that flag.
 */
export interface MemoryApiOptions {
  /** Days to fail, so the plan gate's error path can be driven in a test. */
  failDays?: readonly WeekdayIndex[];
}

export class MemoryVireApi implements VireApi {
  private profile: Profile | null;
  private plan: StoredPlan | null = null;
  private readonly logs = new Map<string, DailyLog>();
  private readonly weights = new Map<string, number>();
  private planCount = 0;
  private readonly failDays: readonly WeekdayIndex[];

  constructor(profile: Profile | null = null, options: MemoryApiOptions = {}) {
    this.profile = profile;
    this.failDays = options.failDays ?? [];
  }

  async getProfile(): Promise<Profile | null> {
    return this.profile ? structuredClone(this.profile) : null;
  }

  async saveProfile(input: ProfileInput): Promise<Profile> {
    const candidate: Profile = { ...input, target: calcTarget(input) };

    const parsed = profileSchema.safeParse(candidate);
    if (!parsed.success) {
      // Mirrors the route's 422 so the form's error handling is exercised.
      throw new ApiError(
        422,
        'invalid_profile',
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    this.profile = parsed.data;
    return structuredClone(parsed.data);
  }

  async getPlan(): Promise<StoredPlan | null> {
    return this.plan ? structuredClone(this.plan) : null;
  }

  async generatePlan(
    onDay: (day: WeekdayIndex, state: ReportedDayState) => void,
  ): Promise<StoredPlan> {
    if (!this.profile) throw new ApiError(409, 'no_profile');

    for (const day of WEEKDAYS) onDay(day, 'run');
    // A microtask gap, so a caller that renders between events actually gets a
    // chance to — otherwise the seven rows would appear already finished.
    await Promise.resolve();
    for (const day of WEEKDAYS) onDay(day, this.failDays.includes(day) ? 'fail' : 'done');

    if (this.failDays.length > 0) throw new PlanGenerationError('partial', [...this.failDays]);

    return this.activate({ ...starterPlan(Date.now()), starter: false });
  }

  async adoptStarterPlan(): Promise<StoredPlan> {
    return this.activate(starterPlan(Date.now()));
  }

  async getLog(date: string): Promise<DailyLog | null> {
    const log = this.logs.get(date);
    return log ? structuredClone(log) : null;
  }

  async saveLog(date: string, log: DailyLog): Promise<DailyLog> {
    // Parsed with the same schema the route uses, so the defaults the client
    // converges on are the real ones.
    const parsed = dailyLogSchema.safeParse(log);
    if (!parsed.success) throw new ApiError(422, 'invalid_log');
    this.logs.set(date, parsed.data);
    return structuredClone(parsed.data);
  }

  async listLogs(): Promise<DatedLog[]> {
    return [...this.logs.entries()]
      .map(([date, log]) => ({ ...structuredClone(log), date }))
      .sort((a, b) => b.date.localeCompare(a.date)) // newest first, like the store
      .slice(0, 7);
  }

  async listWeights(): Promise<DatedWeight[]> {
    return [...this.weights.entries()]
      .map(([date, kg]) => ({ date, kg }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async saveWeighIn(
    date: string,
    kg: number,
    applyToProfile: boolean,
  ): Promise<{ entry: DatedWeight; profile: Profile }> {
    if (!weightEntrySchema.safeParse({ kg }).success) throw new ApiError(422, 'invalid_weight');
    if (!this.profile) throw new ApiError(409, 'no_profile');

    this.weights.set(date, kg);
    if (applyToProfile) {
      // Recomputed with the same `calcTarget` the route uses, floors included.
      const updated = { ...this.profile, w: kg };
      this.profile = { ...updated, target: calcTarget(updated) };
    }
    return { entry: { date, kg }, profile: structuredClone(this.profile) };
  }

  private activate(plan: Omit<StoredPlan, 'planId'>): StoredPlan {
    this.planCount += 1;
    this.plan = { ...plan, planId: `plan-memory-${this.planCount}` };
    return structuredClone(this.plan);
  }
}
