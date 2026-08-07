import { Hono } from 'hono';
import { dailyLogSchema } from '@/domain/schema';
import { UnauthorizedError, userIdFromClaims } from '../auth/identity';
import { bearerToken, type TokenVerifier } from '../auth/verifier';
import type { VireStore } from '../db/store';

/**
 * Daily log routes.
 *
 * One item per **client-local** date, which is why the date is a path parameter
 * rather than something the server derives from its own clock: a Lambda in
 * eu-north-1 and a phone in Helsinki disagree for an hour twice a year, and a
 * user logging dinner at 23:30 must not have it land on tomorrow.
 *
 * The whole log is written at once rather than patched field by field. It is a
 * handful of small fields belonging to one screen and one user, and a
 * last-write-wins document avoids a merge protocol for a conflict that needs two
 * of the user's own devices to happen at the same second.
 */

/** ISO calendar date, as `dateKey` produces it. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reject a date that is not a real day.
 *
 * The pattern alone would accept 2026-02-31 and 2026-13-01, and a nonsense key
 * would sit in the table forever — the log is stored under whatever the client
 * sends.
 */
function isValidDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

export interface LogRouteDeps {
  store: VireStore;
  verifier: TokenVerifier;
}

/** How far back the adherence summary looks (I3). One week, no streaks. */
export const ADHERENCE_DAYS = 7;

export function logRoutes({ store, verifier }: LogRouteDeps) {
  const app = new Hono();

  const requireUser = async (authorization: string | undefined) =>
    userIdFromClaims(await verifier.verify(bearerToken(authorization)));

  /**
   * The recent days, newest first, for the adherence summary.
   *
   * A fixed window rather than a client-supplied limit: there is exactly one
   * caller and one question, and an open limit is a way to ask for the whole
   * history in one request.
   */
  app.get('/logs', async (c) => {
    try {
      const userId = await requireUser(c.req.header('authorization'));
      return c.json(await store.listLogs(userId, ADHERENCE_DAYS));
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  app.get('/log/:date', async (c) => {
    const date = c.req.param('date');
    if (!isValidDate(date)) return c.json({ error: 'invalid_date' }, 400);
    try {
      const userId = await requireUser(c.req.header('authorization'));
      const log = await store.getLog(userId, date);
      // An unlogged day is an empty day, not an error: 200 with null keeps the
      // client from having to treat "nothing yet" as a failure.
      return c.json(log);
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  app.put('/log/:date', async (c) => {
    const date = c.req.param('date');
    if (!isValidDate(date)) return c.json({ error: 'invalid_date' }, 400);
    try {
      const userId = await requireUser(c.req.header('authorization'));

      const parsed = dailyLogSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        return c.json(
          {
            error: 'invalid_log',
            issues: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          422,
        );
      }

      await store.putLog(userId, date, parsed.data);
      // The parsed log, not the request body: the schema fills defaults, and the
      // client's optimistic copy should converge on what was actually stored.
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
  console.error('Log route failed', error);
  return c.json({ error: 'internal_error' }, 500);
}
