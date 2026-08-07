import { randomUUID } from 'node:crypto';
import type { DailyLog, Plan, Profile, WeightEntry } from '@/domain/schema';
import { SK, SK_PREFIX, assertDateKey, pk, type UserId } from './keys';
import type { DatedLog, DatedWeight, GrocState, OfferScan, StoredPlan, VireStore } from './store';

/**
 * In-memory implementation of the store.
 *
 * Its job is to make the isolation and transaction behaviour testable without
 * an AWS account: it uses the *same* key builders as the DynamoDB
 * implementation, so a route that leaks across users here leaks there too.
 *
 * Also useful for `npm run dev` before any table exists.
 */
export class MemoryStore implements VireStore {
  /** partition key → sort key → item */
  private readonly partitions = new Map<string, Map<string, unknown>>();

  private partition(userId: UserId): Map<string, unknown> {
    const key = pk(userId);
    let p = this.partitions.get(key);
    if (!p) {
      p = new Map();
      this.partitions.set(key, p);
    }
    return p;
  }

  private read<T>(userId: UserId, sk: string): T | null {
    return (this.partition(userId).get(sk) as T | undefined) ?? null;
  }

  private write(userId: UserId, sk: string, item: unknown): void {
    // Structured-clone on write and read so a caller holding a reference cannot
    // mutate stored state — DynamoDB would have serialized it.
    this.partition(userId).set(sk, structuredClone(item));
  }

  async getProfile(userId: UserId): Promise<Profile | null> {
    return structuredClone(this.read<Profile>(userId, SK.profile));
  }

  async putProfile(userId: UserId, profile: Profile): Promise<void> {
    this.write(userId, SK.profile, profile);
  }

  async getActivePlan(userId: UserId): Promise<StoredPlan | null> {
    return structuredClone(this.read<StoredPlan>(userId, SK.activePlan));
  }

  async activatePlan(userId: UserId, plan: Plan): Promise<StoredPlan> {
    const partition = this.partition(userId);
    const previous = this.read<StoredPlan>(userId, SK.activePlan);

    // All-or-nothing, like the DynamoDB transaction: the new plan lands and the
    // old plan's derived state goes, or nothing changes.
    const stored: StoredPlan = { ...plan, planId: randomUUID() };
    partition.set(SK.activePlan, structuredClone(stored));
    if (previous) {
      partition.delete(SK.grocState(previous.planId));
      partition.delete(SK.offers(previous.planId));
    }
    return structuredClone(stored);
  }

  async getGrocState(userId: UserId, planId: string): Promise<GrocState> {
    return (
      structuredClone(this.read<GrocState>(userId, SK.grocState(planId))) ?? {
        checked: {},
        store: {},
      }
    );
  }

  async putGrocState(userId: UserId, planId: string, state: GrocState): Promise<void> {
    this.write(userId, SK.grocState(planId), state);
  }

  async getOffers(userId: UserId, planId: string): Promise<OfferScan | null> {
    return structuredClone(this.read<OfferScan>(userId, SK.offers(planId)));
  }

  async putOffers(userId: UserId, planId: string, scan: OfferScan): Promise<void> {
    this.write(userId, SK.offers(planId), scan);
  }

  async getLog(userId: UserId, date: string): Promise<DailyLog | null> {
    return structuredClone(this.read<DailyLog>(userId, SK.log(assertDateKey(date))));
  }

  async putLog(userId: UserId, date: string, log: DailyLog): Promise<void> {
    this.write(userId, SK.log(assertDateKey(date)), log);
  }

  async listLogs(userId: UserId, limit: number): Promise<DatedLog[]> {
    return this.collect<DailyLog>(userId, SK_PREFIX.log)
      .sort((a, b) => b.date.localeCompare(a.date)) // newest first
      .slice(0, limit);
  }

  async putWeight(userId: UserId, date: string, entry: WeightEntry): Promise<void> {
    this.write(userId, SK.weight(assertDateKey(date)), entry);
  }

  async listWeights(userId: UserId, limit: number): Promise<DatedWeight[]> {
    // Newest `limit` entries, then reversed for display. Taking the *oldest*
    // `limit` would agree with DynamoDB only while the history is shorter than
    // the limit — and then silently show the wrong end of it forever.
    return this.collect<WeightEntry>(userId, SK_PREFIX.weight)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
      .reverse(); // oldest first, so a trend line reads left to right
  }

  private collect<T>(userId: UserId, prefix: string): (T & { date: string })[] {
    const out: (T & { date: string })[] = [];
    for (const [sk, item] of this.partition(userId)) {
      if (sk.startsWith(prefix)) {
        out.push({ ...structuredClone(item as T), date: sk.slice(prefix.length) });
      }
    }
    return out;
  }

  async bumpRateLimit(userId: UserId, action: string, day: string): Promise<number> {
    const sk = SK.rateLimit(action, assertDateKey(day));
    const next = (this.read<{ count: number }>(userId, sk)?.count ?? 0) + 1;
    this.write(userId, sk, { count: next });
    return next;
  }

  async exportAll(userId: UserId): Promise<Record<string, unknown>[]> {
    return [...this.partition(userId).entries()].map(([sk, item]) => ({
      sk,
      ...structuredClone(item as Record<string, unknown>),
    }));
  }

  async deleteAll(userId: UserId): Promise<void> {
    this.partitions.delete(pk(userId));
  }
}
