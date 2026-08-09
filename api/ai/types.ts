import { z } from 'zod';
import { dayPlanSchema, storeTagSchema } from '@/domain/schema';
import type { GrocItem, Profile } from '@/domain/schema';
import type { WeekdayIndex } from '@/domain/constants';

/**
 * The AI provider port.
 *
 * Vire is not tied to one vendor (PLAN §3a, owner decision): the same interface
 * is implemented for Anthropic and OpenAI, and picked by environment variable.
 * Switching provider or model is configuration plus an eval run, never a
 * rewrite — which also means an outage or a price change at one vendor is a
 * config change away from being someone else's problem.
 *
 * Adapters differ only in transport and tool syntax. Prompt wording lives in
 * ./prompts so the allergy-exclusion rule and the calorie budgets cannot drift
 * apart between providers — a provider-specific allergy prompt would be a
 * health guardrail with two versions.
 */

/** What one day's generation needs to know. */
export interface DayConfig {
  /** Monday = 0. Selects the day's theme, so a week has variety. */
  weekday: WeekdayIndex;
  target: number;
  sex: Profile['sex'];
  age: number;
  /** Free text, exactly as the user typed it. Empty means no restrictions. */
  allergies: string;
  /**
   * Dishes the user already has, so a regenerated week is actually new (E2.4).
   *
   * Without this, regenerating asks the same question of the same model with the
   * same prompt and unsurprisingly gets the same answer back — which makes the
   * regenerate button look broken even when every part of it worked.
   */
  avoid?: readonly string[] | undefined;
}

/**
 * A generated day plus every purchasable ingredient in it.
 *
 * `items` rows are `[finnishName, englishName, category, quantity, staple?]`,
 * aggregated across the week by `aggregateItems`. Tuples rather than objects
 * because they are markedly cheaper in output tokens, and this is the bulkiest
 * part of the response.
 */
export const MAX_ITEMS_PER_DAY = 16;

/**
 * Prep-stage bounds (E7.7), enforced in `sanitisePrep` before validation.
 *
 * The floor is the interesting one: a head start is only worth a notification
 * where it exceeds a normal cooking window, and without it the model cheerfully
 * annotates "chop the onions, lead 15" on every meal of the week.
 */
export const MIN_PREP_LEAD_MIN = 60;
export const MAX_PREP_LEAD_MIN = 1440;
export const MAX_PREP_STAGES = 3;

export const generatedDaySchema = dayPlanSchema.extend({
  // The bounds are looser than the prompt asks for on purpose. The *meals* are
  // the health-relevant content and stay strict; the grocery rows are a
  // convenience the shopping list aggregates. `sanitiseItems` clamps and filters
  // this before validation, because throwing away a day with five good meals
  // because it listed seventeen ingredients is the wrong trade — and it is a
  // failure that shows up on some days and not others, which is worse than a
  // consistent one.
  items: z
    .array(
      z
        .array(z.union([z.string(), z.number()]))
        .min(4)
        .max(5),
    )
    .min(1)
    .max(MAX_ITEMS_PER_DAY),
});
export type GeneratedDay = z.infer<typeof generatedDaySchema>;

/** One matched supermarket offer. */
export const dealSchema = z.object({
  id: z.string().min(1),
  store: storeTagSchema,
  deal: z.string().min(1).max(60),
});
export type Deal = z.infer<typeof dealSchema>;

export const offerScanResultSchema = z.object({
  deals: z.array(dealSchema).max(15),
  note: z.string().max(160),
});
export type OfferScanResult = z.infer<typeof offerScanResultSchema>;

export interface OfferScanRequest {
  items: readonly GrocItem[];
  /** The user's city, from their profile — never hardcoded to Helsinki. */
  city: string;
  /** Today, for the prompt: "this week's offers" needs a reference date. */
  today: Date;
}

export interface AiProvider {
  /** Provider id, for logs and the health route. */
  readonly name: string;
  /** Model id actually in use, so a deployed stage can be identified. */
  readonly model: string;

  generateDay(config: DayConfig): Promise<GeneratedDay>;

  /**
   * Find current supermarket offers matching the shopping list.
   *
   * Requires a live web-search capability, which not every provider has —
   * notably Bedrock does not. A provider without it should throw
   * `OfferScanUnsupportedError` so the caller can fall back rather than
   * silently return an empty list that looks like "no offers this week".
   */
  scanOffers(request: OfferScanRequest): Promise<OfferScanResult>;
}

export class OfferScanUnsupportedError extends Error {
  constructor(providerName: string) {
    super(
      `Provider "${providerName}" has no web-search capability, so it cannot scan offers. ` +
        'Set AI_PROVIDER_OFFERS to a provider that does (anthropic or openai).',
    );
    this.name = 'OfferScanUnsupportedError';
  }
}

/**
 * The provider refused the request rather than answering it badly.
 *
 * Separated from `AiOutputError` because the right response differs: a rate limit
 * wants a real wait, a rejected key wants the user to fix the key, and neither is
 * "the meals came back wrong".
 */
export class AiRequestError extends Error {
  constructor(
    readonly kind: 'rate_limited' | 'unauthorized' | 'unavailable',
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'AiRequestError';
  }
}

/** Turn a provider SDK error into one of the kinds above, or null if it is not one. */
export function classifyProviderError(error: unknown): AiRequestError | null {
  const status = (error as { status?: unknown })?.status;
  if (typeof status !== 'number') return null;
  if (status === 429) {
    return new AiRequestError('rate_limited', 'The provider is rate-limiting requests', error);
  }
  if (status === 401 || status === 403) {
    return new AiRequestError('unauthorized', 'The provider rejected the API key', error);
  }
  if (status >= 500) {
    return new AiRequestError('unavailable', 'The provider is unavailable', error);
  }
  return null;
}

/** The model returned something that is not a usable plan. */
export class AiOutputError extends Error {
  constructor(message: string, cause?: unknown) {
    // Native `cause` rather than a own field: it survives logging, and
    // redeclaring it would shadow Error's own property.
    super(message, { cause });
    this.name = 'AiOutputError';
  }
}
