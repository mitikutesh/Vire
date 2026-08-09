import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { SLOTS } from '@/content/plan';
import { WEEKDAYS } from '@/domain/constants';
import type { PlanStreamEvent, ReportedDayState } from '@/domain/plan-stream';
import { aggregateItems } from '@/domain/aggregate-items';
import type { DayPlan, Plan, Profile } from '@/domain/schema';
import { UnauthorizedError, userIdFromClaims } from '../auth/identity';
import { bearerToken, type TokenVerifier } from '../auth/verifier';
import type { PlanDraft, VireStore } from '../db/store';
import type { ProviderForUser } from '../ai/for-user';
import { classifyProviderError } from '../ai/types';
import type { AiProvider, GeneratedDay } from '../ai/types';

/**
 * Plan generation.
 *
 * Three things make this route more than a loop over seven API calls:
 *
 * 1. **Per-day retry.** A week is seven independent calls, so one malformed day
 *    costs one more request, not a whole regeneration (PLAN §6, I2). The
 *    prototype failed the entire week on any single bad day.
 * 2. **Streamed progress.** Generation takes ~30 s, which is a long time to look
 *    at a spinner. Each day reports `run` / `done` / `fail` as it lands, which is
 *    what the plan gate's seven-row list renders.
 * 3. **A rate limit that actually holds.** The counter is an atomic DynamoDB
 *    increment, because this is the one route that spends the owner's AI budget.
 */

/**
 * Per user, per day, counted in **provider calls** rather than requests.
 *
 * Ten full weeks a day, which is generous for one household and ruinous for a
 * stranger. Counting calls rather than requests is what makes resuming cheap:
 * finishing a week that lost one day costs one, not seven.
 */
export const GENERATE_LIMIT_PER_DAY = 10 * WEEKDAYS.length;

/**
 * How long a failed run's days stay resumable.
 *
 * Long enough to cover making a coffee and tapping again, short enough that a
 * week abandoned yesterday is not silently half-stale when it comes back. The
 * DynamoDB TTL matches, but this check is the authoritative one: TTL deletion
 * runs on its own schedule and can return an expired item for hours.
 */
export const PLAN_DRAFT_TTL_MS = 60 * 60 * 1000;

/**
 * What the days in a draft were generated against.
 *
 * Compared before any day is reused. `allergies` is the reason this exists at
 * all: reusing a day generated before the user added an allergen would put that
 * allergen back on their plate, and the app's loudest promise is that generated
 * plans exclude what they listed. `target`, `age` and `sex` ride along because
 * they set the calorie budget each meal was written to.
 */
export function draftFingerprint(profile: Profile): string {
  return createHash('sha256')
    .update(JSON.stringify([profile.target, profile.sex, profile.age, profile.allergies.trim()]))
    .digest('hex');
}

/** Attempts per day before the week is declared failed. */
const ATTEMPTS_PER_DAY = 3;

/**
 * How many days generate at once.
 *
 * Seven at once was the prototype's shape, and it is the wrong shape for a
 * personal API key: a new key's per-minute allowance is modest, and seven
 * simultaneous requests are the easiest way to trip it. Three keeps the week well
 * inside the 45-second budget while leaving headroom — the budget was always a UX
 * target rather than a platform limit.
 */
const CONCURRENT_DAYS = 3;

/**
 * Pause before retrying a day. Seven days generate in parallel, so the likeliest
 * transient failure is provider overload — and an immediate retry would hit the
 * same overload and lose the week in under a second.
 */
export const RETRY_DELAY_MS = 1_500;

/**
 * The wait after a rate limit, as opposed to after bad output.
 *
 * A provider's limit window is measured in a minute, so retrying 1.5 s later is
 * very nearly guaranteed to be refused again — the original retry was tuned for
 * malformed output and silently useless for the failure it was most likely to
 * meet.
 */
export const RATE_LIMIT_DELAY_MS = 20_000;

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/** Server-side UTC day, for the rate-limit counter only. */
const rateLimitDay = (now: Date): string => now.toISOString().slice(0, 10);

export interface PlanRouteDeps {
  store: VireStore;
  verifier: TokenVerifier;
  /**
   * Resolves the caller's own provider (E7.6). Null when they have not set a key,
   * which is a 409 rather than a failure: the starter week needs no provider.
   */
  providerFor: ProviderForUser;
  now?: () => Date;
  /** Overridden to 0 in tests, so a retry test does not wait out the backoff. */
  retryDelayMs?: number;
  /** Likewise; a rate-limit wait is twenty seconds in production. */
  rateLimitDelayMs?: number;
}

/**
 * Generate one day, retrying it alone. Returns null when every attempt failed,
 * so the caller can report which days are missing rather than losing the week.
 */
async function generateDayWithRetry(
  provider: AiProvider,
  config: Parameters<AiProvider['generateDay']>[0],
  onState: (state: ReportedDayState) => Promise<void>,
  retryDelayMs: number,
  rateLimitDelayMs: number,
): Promise<GeneratedDay | null> {
  await onState('run');
  for (let attempt = 0; attempt < ATTEMPTS_PER_DAY; attempt += 1) {
    try {
      const day = await provider.generateDay(config);
      await onState('done');
      return day;
    } catch (error) {
      const refusal = classifyProviderError(error);
      // A rejected key will be rejected again, however long we wait. Retrying
      // spends the user's quota on a certainty.
      if (refusal?.kind === 'unauthorized') {
        console.error(`Day ${config.weekday}: provider rejected the API key`);
        await onState('fail');
        return null;
      }

      // Last attempt: report it. Earlier ones are retried silently, since a
      // transient malformed response is not news to the user.
      if (attempt === ATTEMPTS_PER_DAY - 1) {
        console.error(
          `Day ${config.weekday} failed after ${ATTEMPTS_PER_DAY} attempts: ` +
            `${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'}`,
        );
        await onState('fail');
      } else {
        // A rate limit needs a real wait; bad output needs only a moment.
        await sleep(refusal?.kind === 'rate_limited' ? rateLimitDelayMs : retryDelayMs);
      }
    }
  }
  return null;
}

/** Strip the generation-only `items` field, leaving a storable day. */
function toDayPlan(generated: GeneratedDay): DayPlan {
  const { items: _items, ...day } = generated;
  return day;
}

/**
 * Whether a stored draft may be resumed.
 *
 * Two independent reasons to refuse, and the fingerprint is the one that
 * matters: it is what stops a day generated under the user's old allergies
 * being served after they have added one. Age is the lesser check, for a week
 * someone walked away from.
 */
export function usableDraft(
  draft: PlanDraft | null,
  fingerprint: string,
  nowMs: number,
): draft is PlanDraft {
  if (!draft) return false;
  if (draft.fp !== fingerprint) return false;
  return nowMs - draft.created < PLAN_DRAFT_TTL_MS;
}

export function planRoutes({
  store,
  verifier,
  providerFor,
  now = () => new Date(),
  retryDelayMs = RETRY_DELAY_MS,
  rateLimitDelayMs = RATE_LIMIT_DELAY_MS,
}: PlanRouteDeps) {
  const app = new Hono();

  app.post('/plan/generate', async (c) => {
    let userId;
    try {
      userId = userIdFromClaims(await verifier.verify(bearerToken(c.req.header('authorization'))));
    } catch (error) {
      if (error instanceof UnauthorizedError) return c.json({ error: 'unauthorized' }, 401);
      throw error;
    }

    const profile = await store.getProfile(userId);
    // Generation needs the target, the allergies and the body: without a profile
    // there is nothing to generate against.
    if (!profile) return c.json({ error: 'no_profile' }, 409);

    // The caller's own key. Checked before the rate limit is spent: being unable
    // to generate at all should not cost a slice of the daily allowance.
    const provider = await providerFor(userId);
    if (!provider) return c.json({ error: 'no_ai_key' }, 409);

    /**
     * Days salvaged from a previous run that failed part-way (E2.1).
     *
     * `usableDraft` is where the health guardrail lives: a draft whose
     * fingerprint no longer matches the profile is discarded rather than
     * resumed, because its days were written against allergies or a calorie
     * target the user has since changed.
     */
    const fp = draftFingerprint(profile);
    const draft = await store.getPlanDraft(userId);
    const carried: (GeneratedDay | null)[] = usableDraft(draft, fp, now().getTime())
      ? // Length is normalised: a draft from an older shape must not silently
        // produce a six-day week further down.
        WEEKDAYS.map((weekday) => draft?.days[weekday] ?? null)
      : WEEKDAYS.map(() => null);

    const todo = WEEKDAYS.filter((weekday) => carried[weekday] == null);

    /**
     * What the user already has, so a regeneration is not a re-run.
     *
     * Both the plan being replaced *and* the days already carried: without the
     * latter, a resumed day can duplicate a dish from the same week it is about
     * to rejoin. On a first generation there is neither, and the prompt simply
     * omits the exclusion.
     */
    const current = await store.getActivePlan(userId);
    const avoid = [
      ...new Set([
        ...(current?.days.flatMap((day) => SLOTS.map((slot) => day[slot].n)) ?? []),
        ...carried.flatMap((day) => (day ? SLOTS.map((slot) => day[slot].n) : [])),
      ]),
    ];

    // Metered in provider calls, so finishing a week costs what it actually
    // spends. Skipped entirely when there is nothing to generate: a draft that
    // completed and only failed to *save* should not pay to be saved again.
    if (todo.length > 0) {
      const used = await store.bumpRateLimit(userId, 'generate', rateLimitDay(now()), todo.length);
      if (used > GENERATE_LIMIT_PER_DAY) {
        return c.json({ error: 'rate_limited', limit: GENERATE_LIMIT_PER_DAY }, 429);
      }
    }

    // Progress is streamed, so the response has already started by the time a
    // day fails — which is why failures are stream events rather than statuses.
    return streamSSE(c, async (stream) => {
      // Typed against the shared contract, so an event shape the plan gate
      // cannot parse is a type error rather than a silent no-op in the browser.
      const send = (event: PlanStreamEvent) => stream.writeSSE({ data: JSON.stringify(event) });

      /**
       * Persist what came back, for the next attempt to resume from.
       *
       * Swallows its own failure on purpose. This runs on the two paths that are
       * already reporting a problem, and turning a failed *optimisation* into a
       * failed response would replace a recoverable error with a worse one.
       */
      const saveDraft = async (days: (GeneratedDay | null)[], fingerprint: string) => {
        if (!days.some(Boolean)) return; // nothing salvageable; do not write an empty week
        try {
          await store.putPlanDraft(userId, {
            fp: fingerprint,
            created: now().getTime(),
            days,
          });
        } catch (error) {
          console.error('Saving the generation draft failed; the retry will regenerate', error);
        }
      };

      /**
       * Days run a few at a time rather than all seven at once.
       *
       * Each finished day still reports as soon as it lands, so the gate's list
       * fills in the same way; what changes is how many requests the provider sees
       * simultaneously. Seven at once is the surest way to trip a personal key's
       * per-minute allowance, and a rate-limited day costs a 20-second wait —
       * which is far more than the concurrency buys back.
       */
      const results: (GeneratedDay | null)[] = [...carried];
      const queue = [...todo];

      // Carried days are reported before any work starts, so a resumed run shows
      // six ticks and one spinner rather than seven rows that sit on "waiting"
      // and then finish impossibly fast.
      for (const weekday of WEEKDAYS) {
        if (results[weekday]) await send({ type: 'day', day: weekday, state: 'done' });
      }

      const worker = async () => {
        for (;;) {
          const weekday = queue.shift();
          if (weekday === undefined) return;
          results[weekday] = await generateDayWithRetry(
            provider,
            {
              weekday,
              target: profile.target,
              sex: profile.sex,
              age: profile.age,
              allergies: profile.allergies,
              avoid,
            },
            (state) => send({ type: 'day', day: weekday, state }),
            retryDelayMs,
            rateLimitDelayMs,
          );
        }
      };

      await Promise.all(Array.from({ length: CONCURRENT_DAYS }, worker));

      if (results.some((day) => day === null)) {
        const failed = results.flatMap((day, i) => (day === null ? [i] : []));
        // Keep whatever did come back, so "Try again" pays for the missing days
        // only. Best-effort: a draft that fails to save costs the user a repeat
        // of work they have already paid for, which is not worth losing the
        // failure they actually need to see.
        await saveDraft(results, fp);
        // The client still offers the starter plan here; a partial week would be
        // worse than none, because a day with no food is a day nobody can follow.
        await send({ type: 'error', error: 'partial', failedDays: failed });
        return;
      }

      const days = results as GeneratedDay[];
      const plan: Plan = {
        v: 1,
        created: now().getTime(),
        starter: false,
        days: days.map(toDayPlan) as Plan['days'],
        // Aggregated server-side so the ids the offer scan matches against are
        // produced in exactly one place.
        groc: aggregateItems(days.flatMap((day) => day.items)),
      };

      try {
        // One transaction: the new plan lands and the previous plan's grocery
        // state and cached offers go with it (see db/store.activatePlan).
        const stored = await store.activatePlan(userId, plan);
        await send({ type: 'plan', plan: stored });
      } catch (error) {
        console.error('Activating the generated plan failed', error);
        // The week is complete and only the write failed, so the draft holds all
        // seven days: retrying re-attempts the save and generates nothing. This
        // is the case where regenerating from scratch was most obviously wrong —
        // seven provider calls to recover from a database error.
        await saveDraft(results, fp);
        await send({ type: 'error', error: 'not_saved' });
      }
    });
  });

  app.get('/plan', async (c) => {
    try {
      const userId = userIdFromClaims(
        await verifier.verify(bearerToken(c.req.header('authorization'))),
      );
      const plan = await store.getActivePlan(userId);
      // 404 is what puts the client on the plan gate.
      return plan ? c.json(plan) : c.json({ error: 'no_plan' }, 404);
    } catch (error) {
      if (error instanceof UnauthorizedError) return c.json({ error: 'unauthorized' }, 401);
      throw error;
    }
  });

  /** Adopt the built-in starter week — no AI call, so no rate limit. */
  app.post('/plan/starter', async (c) => {
    try {
      const userId = userIdFromClaims(
        await verifier.verify(bearerToken(c.req.header('authorization'))),
      );
      const { starterPlan } = await import('@/content/starter-plan');
      const stored = await store.activatePlan(userId, starterPlan(now().getTime()));
      return c.json(stored);
    } catch (error) {
      if (error instanceof UnauthorizedError) return c.json({ error: 'unauthorized' }, 401);
      throw error;
    }
  });

  return app;
}
