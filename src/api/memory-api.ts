import { WEEKDAYS, type WeekdayIndex } from '@/domain/constants';
import type { ReportedDayState } from '@/domain/plan-stream';
import { dailyLogSchema, grocStateSchema, profileSchema, weightEntrySchema } from '@/domain/schema';
import type { DailyLog, GrocState, OfferScan, Profile, StoredPlan } from '@/domain/schema';
import { emptyGrocState } from '@/domain/groc-state';
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
  private readonly grocStates = new Map<string, GrocState>();
  private readonly offers = new Map<string, OfferScan>();
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

  async getGrocState(planId: string): Promise<GrocState> {
    const state = this.grocStates.get(planId);
    return state ? structuredClone(state) : emptyGrocState();
  }

  async saveGrocState(planId: string, state: GrocState): Promise<GrocState> {
    const parsed = grocStateSchema.safeParse(state);
    if (!parsed.success) throw new ApiError(422, 'invalid_groc_state');
    this.grocStates.set(planId, parsed.data);
    return structuredClone(parsed.data);
  }

  async getOffers(planId: string): Promise<OfferScan | null> {
    const scan = this.offers.get(planId);
    return scan ? structuredClone(scan) : null;
  }

  /**
   * A plausible scan without a provider: the first two items of the plan, one per
   * chain. Enough to drive the badge, the apply action and the footer in dev.
   */
  async scanOffers(planId: string): Promise<OfferScan> {
    const items = this.plan?.groc.slice(0, 2) ?? [];
    const scan: OfferScan = {
      checkedAt: Date.now(),
      deals: items.map((item, i) => ({
        id: item.id,
        store: i === 0 ? ('S' as const) : ('K' as const),
        deal: `−20 % this week`,
      })),
      note: 'Fake scan — no provider is configured in this build.',
    };
    this.offers.set(planId, scan);
    return structuredClone(scan);
  }

  async exportData(): Promise<unknown> {
    return {
      v: 1,
      exportedAt: new Date().toISOString(),
      items: [
        ...(this.profile ? [{ sk: 'PROFILE', ...this.profile }] : []),
        ...(this.plan ? [{ sk: 'PLAN#ACTIVE', ...this.plan }] : []),
        ...[...this.logs.entries()].map(([date, log]) => ({ sk: `LOG#${date}`, ...log })),
        ...[...this.weights.entries()].map(([date, kg]) => ({ sk: `WEIGHT#${date}`, kg })),
      ],
    };
  }

  async deleteAccount(confirm: string): Promise<void> {
    if (confirm.trim().toUpperCase() !== 'DELETE') throw new ApiError(400, 'confirmation_required');
    this.profile = null;
    this.plan = null;
    this.logs.clear();
    this.weights.clear();
    this.grocStates.clear();
    this.offers.clear();
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
