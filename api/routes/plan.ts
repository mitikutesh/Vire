import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { WEEKDAYS } from '@/domain/constants';
import type { PlanStreamEvent, ReportedDayState } from '@/domain/plan-stream';
import { aggregateItems } from '@/domain/aggregate-items';
import type { DayPlan, Plan } from '@/domain/schema';
import { UnauthorizedError, userIdFromClaims } from '../auth/identity';
import { bearerToken, type TokenVerifier } from '../auth/verifier';
import type { VireStore } from '../db/store';
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

/** Per user, per day. Generous for one household, ruinous for a stranger. */
export const GENERATE_LIMIT_PER_DAY = 10;

/** Attempts per day before the week is declared failed. */
const ATTEMPTS_PER_DAY = 2;

/**
 * Pause before retrying a day. Seven days generate in parallel, so the likeliest
 * transient failure is provider overload — and an immediate retry would hit the
 * same overload and lose the week in under a second.
 */
export const RETRY_DELAY_MS = 1_500;

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/** Server-side UTC day, for the rate-limit counter only. */
const rateLimitDay = (now: Date): string => now.toISOString().slice(0, 10);

export interface PlanRouteDeps {
  store: VireStore;
  verifier: TokenVerifier;
  /** Built per request so a provider swap needs no redeploy of this file. */
  provider: AiProvider;
  now?: () => Date;
  /** Overridden to 0 in tests, so a retry test does not wait out the backoff. */
  retryDelayMs?: number;
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
): Promise<GeneratedDay | null> {
  await onState('run');
  for (let attempt = 0; attempt < ATTEMPTS_PER_DAY; attempt += 1) {
    try {
      const day = await provider.generateDay(config);
      await onState('done');
      return day;
    } catch (error) {
      // Last attempt: report it. Earlier ones are retried silently, since a
      // transient malformed response is not news to the user.
      if (attempt === ATTEMPTS_PER_DAY - 1) {
        console.error(`Day ${config.weekday} failed after ${ATTEMPTS_PER_DAY} attempts`, error);
        await onState('fail');
      } else {
        await sleep(retryDelayMs);
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

export function planRoutes({
  store,
  verifier,
  provider,
  now = () => new Date(),
  retryDelayMs = RETRY_DELAY_MS,
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

    const used = await store.bumpRateLimit(userId, 'generate', rateLimitDay(now()));
    if (used > GENERATE_LIMIT_PER_DAY) {
      return c.json({ error: 'rate_limited', limit: GENERATE_LIMIT_PER_DAY }, 429);
    }

    // Progress is streamed, so the response has already started by the time a
    // day fails — which is why failures are stream events rather than statuses.
    return streamSSE(c, async (stream) => {
      // Typed against the shared contract, so an event shape the plan gate
      // cannot parse is a type error rather than a silent no-op in the browser.
      const send = (event: PlanStreamEvent) => stream.writeSSE({ data: JSON.stringify(event) });

      const results = await Promise.all(
        WEEKDAYS.map((weekday) =>
          generateDayWithRetry(
            provider,
            {
              weekday,
              target: profile.target,
              sex: profile.sex,
              age: profile.age,
              allergies: profile.allergies,
            },
            (state) => send({ type: 'day', day: weekday, state }),
            retryDelayMs,
          ),
        ),
      );

      if (results.some((day) => day === null)) {
        const failed = results.flatMap((day, i) => (day === null ? [i] : []));
        // The client offers the starter plan here; a partial week would be worse
        // than none, because a day with no food is a day the user cannot follow.
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
