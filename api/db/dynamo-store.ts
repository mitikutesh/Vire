import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { OFFER_TTL_MS } from '@/domain/offers';
import type { AiKey, AiKeyStatus, DailyLog, Plan, Profile, WeightEntry } from '@/domain/schema';
import { SK, SK_PREFIX, UNEXPORTABLE_SK, assertDateKey, pk, type UserId } from './keys';
import type {
  DatedLog,
  DatedWeight,
  GrocState,
  OfferScan,
  PlanDraft,
  StoredPlan,
  VireStore,
} from './store';

/** Cached offer scans expire on their own; nothing has to sweep them. */
// Derived from the shared window rather than restated: the client uses the same
// figure to decide whether to auto-scan, and a TTL that outlived "stale" would
// serve a cache the UI had already given up on.
const OFFERS_TTL_SECONDS = OFFER_TTL_MS / 1000;
/** Rate-limit counters only matter for the day they cover. */
const RATE_LIMIT_TTL_SECONDS = 48 * 60 * 60;
/**
 * Generation drafts are swept an hour after the failed run.
 *
 * The sweep is hygiene, not correctness: the route checks the draft's age
 * itself, because DynamoDB deletes on its own schedule and can hand back an
 * expired item for hours. Matches PLAN_DRAFT_TTL_MS in the route.
 */
const PLAN_DRAFT_TTL_SECONDS = 60 * 60;

const BATCH_DELETE_SIZE = 25; // DynamoDB's BatchWriteItem limit

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * DynamoDB single-table implementation (PLAN §4).
 *
 * On-demand billing keeps a single-household workload inside the perpetual free
 * tier, and — unlike a managed Postgres free tier — nothing here sleeps after a
 * week of inactivity, which matters for an app that is opened every day.
 */
export class DynamoStore implements VireStore {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client: DynamoDBClient = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  private async get<T>(userId: UserId, sk: string): Promise<T | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: pk(userId), sk } }),
    );
    return (Item as T | undefined) ?? null;
  }

  // `object` rather than Record<string, unknown>: the domain interfaces have no
  // index signature, and widening them just to satisfy this helper would weaken
  // them everywhere else.
  private async put(userId: UserId, sk: string, item: object): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.tableName, Item: { pk: pk(userId), sk, ...item } }),
    );
  }

  /** All items under one sort-key prefix — the single-table read pattern. */
  private async queryPrefix(userId: UserId, prefix: string, limit?: number) {
    const { Items } = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk(userId), ':prefix': prefix },
        // Sort keys embed ISO dates, so key order is date order: reading
        // backwards gives newest-first without sorting client-side.
        ScanIndexForward: false,
        ...(limit === undefined ? {} : { Limit: limit }),
      }),
    );
    return Items ?? [];
  }

  getProfile(userId: UserId): Promise<Profile | null> {
    return this.get<Profile>(userId, SK.profile);
  }

  async putProfile(userId: UserId, profile: Profile): Promise<void> {
    await this.put(userId, SK.profile, { ...profile, updatedAt: new Date().toISOString() });
  }

  getActivePlan(userId: UserId): Promise<StoredPlan | null> {
    return this.get<StoredPlan>(userId, SK.activePlan);
  }

  /**
   * One transaction: the new plan replaces the old one *and* the previous plan's
   * grocery state and cached offers are removed together.
   *
   * Split into separate writes, a failure in the middle would leave last week's
   * checked boxes and offer badges pointing at this week's food — the defect the
   * plan review flagged as a blocker.
   */
  async activatePlan(userId: UserId, plan: Plan): Promise<StoredPlan> {
    const previous = await this.getActivePlan(userId);
    const stored: StoredPlan = { ...plan, planId: randomUUID() };
    const partition = pk(userId);

    await this.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: { pk: partition, sk: SK.activePlan, ...stored },
            },
          },
          // Unconditional: a draft may exist with no previous plan at all (the
          // first week failed part-way), and a Delete on a missing item is a
          // no-op rather than an error.
          {
            Delete: {
              TableName: this.tableName,
              Key: { pk: partition, sk: SK.planDraft },
            },
          },
          ...(previous
            ? [
                {
                  Delete: {
                    TableName: this.tableName,
                    Key: { pk: partition, sk: SK.grocState(previous.planId) },
                  },
                },
                {
                  Delete: {
                    TableName: this.tableName,
                    Key: { pk: partition, sk: SK.offers(previous.planId) },
                  },
                },
              ]
            : []),
        ],
      }),
    );

    return stored;
  }

  getPlanDraft(userId: UserId): Promise<PlanDraft | null> {
    return this.get<PlanDraft>(userId, SK.planDraft);
  }

  async putPlanDraft(userId: UserId, draft: PlanDraft): Promise<void> {
    await this.put(userId, SK.planDraft, {
      ...draft,
      expiresAt: nowSeconds() + PLAN_DRAFT_TTL_SECONDS,
    });
  }

  async getGrocState(userId: UserId, planId: string): Promise<GrocState> {
    const state = await this.get<GrocState>(userId, SK.grocState(planId));
    return state ?? { checked: {}, store: {} };
  }

  async putGrocState(userId: UserId, planId: string, state: GrocState): Promise<void> {
    await this.put(userId, SK.grocState(planId), state);
  }

  getOffers(userId: UserId, planId: string): Promise<OfferScan | null> {
    return this.get<OfferScan>(userId, SK.offers(planId));
  }

  async putOffers(userId: UserId, planId: string, scan: OfferScan): Promise<void> {
    await this.put(userId, SK.offers(planId), {
      ...scan,
      expiresAt: nowSeconds() + OFFERS_TTL_SECONDS,
    });
  }

  getLog(userId: UserId, date: string): Promise<DailyLog | null> {
    return this.get<DailyLog>(userId, SK.log(assertDateKey(date)));
  }

  async putLog(userId: UserId, date: string, log: DailyLog): Promise<void> {
    await this.put(userId, SK.log(assertDateKey(date)), log);
  }

  async listLogs(userId: UserId, limit: number): Promise<DatedLog[]> {
    const items = await this.queryPrefix(userId, SK_PREFIX.log, limit);
    return items.map((item) => ({
      ...(item as DailyLog),
      date: String(item['sk']).slice(SK_PREFIX.log.length),
    }));
  }

  async putWeight(userId: UserId, date: string, entry: WeightEntry): Promise<void> {
    await this.put(userId, SK.weight(assertDateKey(date)), entry);
  }

  async listWeights(userId: UserId, limit: number): Promise<DatedWeight[]> {
    const items = await this.queryPrefix(userId, SK_PREFIX.weight, limit);
    return items
      .map((item) => ({
        ...(item as WeightEntry),
        date: String(item['sk']).slice(SK_PREFIX.weight.length),
      }))
      .reverse(); // oldest first, so a trend line reads left to right
  }

  /**
   * Atomic increment. Two generate requests arriving together must not both
   * read "0 used" and both proceed — the counter is what keeps AI spend bounded.
   */
  async bumpRateLimit(userId: UserId, action: string, day: string, by = 1): Promise<number> {
    const { Attributes } = await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { pk: pk(userId), sk: SK.rateLimit(action, assertDateKey(day)) },
        UpdateExpression: 'ADD #count :by SET #expiresAt = :expiresAt',
        ExpressionAttributeNames: { '#count': 'count', '#expiresAt': 'expiresAt' },
        ExpressionAttributeValues: {
          ':by': by,
          ':expiresAt': nowSeconds() + RATE_LIMIT_TTL_SECONDS,
        },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    return Number(Attributes?.['count'] ?? by);
  }

  async getAiKey(userId: UserId): Promise<AiKey | null> {
    return this.get<AiKey>(userId, SK.aiKey);
  }

  async putAiKey(userId: UserId, entry: AiKey): Promise<void> {
    await this.put(userId, SK.aiKey, entry);
  }

  async deleteAiKey(userId: UserId): Promise<void> {
    await this.deleteItem(userId, SK.aiKey);
  }

  async getAiKeyStatus(userId: UserId): Promise<AiKeyStatus> {
    const entry = await this.getAiKey(userId);
    return { set: entry !== null, provider: entry?.provider ?? null };
  }

  /** Every item in the partition, unfiltered. Internal — see the two callers. */
  private async allItems(userId: UserId): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let startKey: Record<string, unknown> | undefined;

    do {
      const page = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': pk(userId) },
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );
      items.push(...((page.Items ?? []) as Record<string, unknown>[]));
      startKey = page.LastEvaluatedKey;
    } while (startKey);

    return items;
  }

  async exportAll(userId: UserId): Promise<Record<string, unknown>[]> {
    // Filtered; `deleteAll` deliberately is not. Deriving deletion from the export
    // would mean anything withheld from the export also survived account deletion —
    // which for a billable credential is the worse of the two failures.
    return (await this.allItems(userId)).filter(
      (item) => !UNEXPORTABLE_SK.includes(String(item['sk'])),
    );
  }

  /** GDPR deletion: every item in the partition, in batches (I6). */
  async deleteAll(userId: UserId): Promise<void> {
    const items = await this.allItems(userId);
    const partition = pk(userId);

    for (let i = 0; i < items.length; i += BATCH_DELETE_SIZE) {
      const batch = items.slice(i, i + BATCH_DELETE_SIZE);
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: batch.map((item) => ({
              DeleteRequest: { Key: { pk: partition, sk: item['sk'] } },
            })),
          },
        }),
      );
    }
  }

  /** Single-item delete, used by the push-subscription cleanup in M5. */
  async deleteItem(userId: UserId, sk: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({ TableName: this.tableName, Key: { pk: pk(userId), sk } }),
    );
  }
}
