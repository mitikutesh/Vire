import {
  aiKeySchema,
  dailyLogSchema,
  planSchema,
  profileSchema,
  weightEntrySchema,
} from '@/domain/schema';
import type { AiKey, AiKeyStatus, DailyLog, Plan, Profile, WeightEntry } from '@/domain/schema';
import { assertDateKey, type UserId } from './keys';
import type {
  DatedLog,
  DatedWeight,
  GrocState,
  OfferScan,
  PlanDraft,
  StoredPlan,
  VireStore,
} from './store';

/**
 * Validation at the write boundary.
 *
 * Wrapping any `VireStore` — rather than validating inside each implementation —
 * means "every write is validated" holds for DynamoDB, the in-memory store, and
 * anything added later, and cannot be forgotten in one of them.
 *
 * Why it matters here specifically: the daily calorie target is recomputed from
 * profile numbers, so an out-of-range weight is not a cosmetic bug, it is a bad
 * calorie budget. Reads are deliberately *not* validated — a schema change must
 * not make existing data unreadable and lock the user out of their own history.
 *
 * Every method is `async` so a validation failure surfaces as a rejected
 * promise. As a plain method, `schema.parse` would throw synchronously *before*
 * the promise existed, and a caller's `.catch()` would never run.
 */
export class ValidatingStore implements VireStore {
  constructor(private readonly inner: VireStore) {}

  async getProfile(userId: UserId): Promise<Profile | null> {
    return this.inner.getProfile(userId);
  }

  async putProfile(userId: UserId, profile: Profile): Promise<void> {
    return this.inner.putProfile(userId, profileSchema.parse(profile));
  }

  async getAiKey(userId: UserId): Promise<AiKey | null> {
    return this.inner.getAiKey(userId);
  }

  async putAiKey(userId: UserId, entry: AiKey): Promise<void> {
    return this.inner.putAiKey(userId, aiKeySchema.parse(entry));
  }

  async deleteAiKey(userId: UserId): Promise<void> {
    return this.inner.deleteAiKey(userId);
  }

  async getAiKeyStatus(userId: UserId): Promise<AiKeyStatus> {
    return this.inner.getAiKeyStatus(userId);
  }

  async getActivePlan(userId: UserId): Promise<StoredPlan | null> {
    return this.inner.getActivePlan(userId);
  }

  async activatePlan(userId: UserId, plan: Plan): Promise<StoredPlan> {
    // A malformed plan would leave the user with a week they cannot cook.
    return this.inner.activatePlan(userId, planSchema.parse(plan));
  }

  async getPlanDraft(userId: UserId): Promise<PlanDraft | null> {
    return this.inner.getPlanDraft(userId);
  }

  // Deliberately not re-validated. Every day in a draft has already been through
  // `generatedDaySchema` at the AI boundary, which is the untrusted edge; and the
  // risk a draft actually carries is a stale *allergy* profile, which no schema
  // can see. The fingerprint in the generation route is what guards that.
  async putPlanDraft(userId: UserId, draft: PlanDraft): Promise<void> {
    return this.inner.putPlanDraft(userId, draft);
  }

  async getGrocState(userId: UserId, planId: string): Promise<GrocState> {
    return this.inner.getGrocState(userId, planId);
  }

  async putGrocState(userId: UserId, planId: string, state: GrocState): Promise<void> {
    return this.inner.putGrocState(userId, planId, state);
  }

  async getOffers(userId: UserId, planId: string): Promise<OfferScan | null> {
    return this.inner.getOffers(userId, planId);
  }

  async putOffers(userId: UserId, planId: string, scan: OfferScan): Promise<void> {
    return this.inner.putOffers(userId, planId, scan);
  }

  async getLog(userId: UserId, date: string): Promise<DailyLog | null> {
    return this.inner.getLog(userId, assertDateKey(date));
  }

  async putLog(userId: UserId, date: string, log: DailyLog): Promise<void> {
    return this.inner.putLog(userId, assertDateKey(date), dailyLogSchema.parse(log));
  }

  async listLogs(userId: UserId, limit: number): Promise<DatedLog[]> {
    return this.inner.listLogs(userId, limit);
  }

  async putWeight(userId: UserId, date: string, entry: WeightEntry): Promise<void> {
    return this.inner.putWeight(userId, assertDateKey(date), weightEntrySchema.parse(entry));
  }

  async listWeights(userId: UserId, limit: number): Promise<DatedWeight[]> {
    return this.inner.listWeights(userId, limit);
  }

  async bumpRateLimit(userId: UserId, action: string, day: string, by?: number): Promise<number> {
    return this.inner.bumpRateLimit(userId, action, assertDateKey(day), by);
  }

  async exportAll(userId: UserId): Promise<Record<string, unknown>[]> {
    return this.inner.exportAll(userId);
  }

  async deleteAll(userId: UserId): Promise<void> {
    return this.inner.deleteAll(userId);
  }
}
