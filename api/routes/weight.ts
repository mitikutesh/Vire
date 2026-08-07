import { Hono } from 'hono';
import { z } from 'zod';
import { weightEntrySchema } from '@/domain/schema';
import { calcTarget } from '@/domain/target';
import { UnauthorizedError, userIdFromClaims } from '../auth/identity';
import { bearerToken, type TokenVerifier } from '../auth/verifier';
import type { VireStore } from '../db/store';

/**
 * Weigh-ins (I1).
 *
 * The improvement this exists for: the prototype computed the calorie target once
 * from the weight typed at setup and never revisited it. Lose five kilos and the
 * target is quietly too high — the app would be working against its own goal.
 *
 * Applying a weigh-in to the profile is opt-in per weigh-in, because a target that
 * moves without being asked is a target the user stops trusting. Either way the
 * new target is computed **here**, never accepted from the client: the calorie
 * floors are a health guardrail (PLAN §7, guardrail 1).
 */

/** How much history the trend line reads. Twelve weeks of weekly weigh-ins. */
export const WEIGHT_HISTORY_LIMIT = 12;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

export const weighInSchema = weightEntrySchema.extend({
  /** True when the user tapped "update my target". */
  applyToProfile: z.boolean(),
});

export interface WeightRouteDeps {
  store: VireStore;
  verifier: TokenVerifier;
}

export function weightRoutes({ store, verifier }: WeightRouteDeps) {
  const app = new Hono();

  const requireUser = async (authorization: string | undefined) =>
    userIdFromClaims(await verifier.verify(bearerToken(authorization)));

  /** The trend, oldest first. */
  app.get('/weight', async (c) => {
    try {
      const userId = await requireUser(c.req.header('authorization'));
      return c.json(await store.listWeights(userId, WEIGHT_HISTORY_LIMIT));
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  app.put('/weight/:date', async (c) => {
    const date = c.req.param('date');
    if (!isValidDate(date)) return c.json({ error: 'invalid_date' }, 400);
    try {
      const userId = await requireUser(c.req.header('authorization'));

      const parsed = weighInSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json(
          {
            error: 'invalid_weight',
            issues: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          422,
        );
      }
      const { kg, applyToProfile } = parsed.data;

      const profile = await store.getProfile(userId);
      // Without a profile there is nothing to recompute a target against, and no
      // sane place to put the weight.
      if (!profile) return c.json({ error: 'no_profile' }, 409);

      // The weigh-in itself is always recorded. Declining the new target is a
      // decision about the target, not about whether the weighing happened.
      await store.putWeight(userId, date, { kg });

      if (!applyToProfile) return c.json({ entry: { kg }, profile });

      const updated = { ...profile, w: kg };
      const withTarget = { ...updated, target: calcTarget(updated) };
      await store.putProfile(userId, withTarget);
      return c.json({ entry: { kg }, profile: withTarget });
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  return app;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Hono's context type is
   generic over the route; the handlers above supply it. */
function unauthorizedOr500(c: any, error: unknown) {
  if (error instanceof UnauthorizedError) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  if (error instanceof SyntaxError) {
    return c.json({ error: 'invalid_json' }, 400);
  }
  console.error('Weight route failed', error);
  return c.json({ error: 'internal_error' }, 500);
}
