import { Hono } from 'hono';
import { grocStateSchema } from '@/domain/schema';
import { UnauthorizedError, userIdFromClaims } from '../auth/identity';
import { bearerToken, type TokenVerifier } from '../auth/verifier';
import type { VireStore } from '../db/store';

/**
 * Grocery state: what is ticked off, and which chain each item is assigned to.
 *
 * Scoped to a **plan id**, not to the user. That is what review blocker #1 was
 * about: with per-user state, regenerating a week would leave last week's ticks
 * sitting on ids that now mean different food. `store.activatePlan` deletes the
 * old plan's state in the same transaction that writes the new plan, so the list
 * is always fresh after a regenerate.
 *
 * The plan id is taken from the path and only ever used as a sort-key suffix
 * inside the caller's own partition, which comes from the verified token — so an
 * unknown id yields an empty state rather than reaching anyone else's data.
 */

const PLAN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface GrocRouteDeps {
  store: VireStore;
  verifier: TokenVerifier;
}

export function grocRoutes({ store, verifier }: GrocRouteDeps) {
  const app = new Hono();

  const requireUser = async (authorization: string | undefined) =>
    userIdFromClaims(await verifier.verify(bearerToken(authorization)));

  app.get('/groc/:planId', async (c) => {
    const planId = c.req.param('planId');
    if (!PLAN_ID_PATTERN.test(planId)) return c.json({ error: 'invalid_plan_id' }, 400);
    try {
      const userId = await requireUser(c.req.header('authorization'));
      // An untouched list is empty state, not a 404: nothing ticked is the normal
      // starting point for every new week.
      return c.json(await store.getGrocState(userId, planId));
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  app.put('/groc/:planId', async (c) => {
    const planId = c.req.param('planId');
    if (!PLAN_ID_PATTERN.test(planId)) return c.json({ error: 'invalid_plan_id' }, 400);
    try {
      const userId = await requireUser(c.req.header('authorization'));

      const parsed = grocStateSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json(
          {
            error: 'invalid_groc_state',
            issues: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          422,
        );
      }

      await store.putGrocState(userId, planId, parsed.data);
      return c.json(parsed.data);
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
  console.error('Grocery route failed', error);
  return c.json({ error: 'internal_error' }, 500);
}
