import { Hono } from 'hono';
import { UnauthorizedError, userIdFromClaims } from '../auth/identity';
import type { IdentityAdmin } from '../auth/identity-admin';
import { bearerToken, type TokenVerifier } from '../auth/verifier';
import type { VireStore } from '../db/store';

/**
 * Export and deletion (I6).
 *
 * Health-adjacent data the user cannot get out of the app, or cannot get rid of,
 * is data they never really owned. Both of these are single-partition operations
 * by design — the key layout puts everything a user has under one partition key
 * precisely so that "give me everything" and "delete everything" are one query
 * each rather than a join across tables (PLAN §4).
 */

/** The export envelope's version, so a future importer can tell what it has. */
export const EXPORT_VERSION = 1;

/**
 * What the user must type to delete their account.
 *
 * A typed word rather than a second button: deletion removes every log, every
 * weigh-in and the account itself, and there is no undo. Compared
 * case-insensitively but not trimmed of meaning — "delete" is the whole phrase.
 */
export const DELETE_CONFIRMATION = 'DELETE';

export interface AccountRouteDeps {
  store: VireStore;
  verifier: TokenVerifier;
  identity: IdentityAdmin;
  now?: () => Date;
}

export function accountRoutes({
  store,
  verifier,
  identity,
  now = () => new Date(),
}: AccountRouteDeps) {
  const app = new Hono();

  const requireUser = async (authorization: string | undefined) =>
    userIdFromClaims(await verifier.verify(bearerToken(authorization)));

  /**
   * Everything, as one JSON document.
   *
   * Raw items rather than a curated shape: the point is that nothing is withheld,
   * and a hand-picked subset is a promise that quietly rots as new item types are
   * added. The sort key of each item says what it is.
   */
  app.get('/export', async (c) => {
    try {
      const userId = await requireUser(c.req.header('authorization'));
      const items = await store.exportAll(userId);

      return c.json({
        v: EXPORT_VERSION,
        exportedAt: now().toISOString(),
        // The partition key is deliberately absent: it embeds the Cognito subject,
        // which is an identifier for the account rather than data about the user.
        items: items.map(({ pk: _pk, ...item }) => item),
      });
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  app.post('/account/delete', async (c) => {
    let userId;
    try {
      userId = await requireUser(c.req.header('authorization'));
    } catch (error) {
      return unauthorizedOr500(c, error);
    }

    let body: { confirm?: unknown };
    try {
      body = (await c.req.json()) as { confirm?: unknown };
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    const confirm = typeof body.confirm === 'string' ? body.confirm.trim().toUpperCase() : '';
    if (confirm !== DELETE_CONFIRMATION) {
      return c.json({ error: 'confirmation_required' }, 400);
    }

    /**
     * Data first, then the account.
     *
     * If the account went first and the data delete then failed, the leftover
     * items would sit under a subject that can never sign in again — data nobody
     * can reach and nobody can remove, which is the worst outcome for a deletion
     * request. This order fails the other way: the account survives with no data,
     * and the user can simply ask again.
     */
    await store.deleteAll(userId);

    try {
      await identity.deleteUser(userId);
    } catch (error) {
      // Its own status, because by this point the data really is gone. Reporting
      // a plain failure would tell the user nothing was removed, which would be a
      // lie — and `deleteUser` is idempotent, so retrying finishes the job.
      console.error('Data deleted but closing the account failed', error);
      return c.json({ error: 'account_not_closed' }, 500);
    }

    return c.json({ deleted: true });
  });

  return app;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Hono's context type is
   generic over the route; the handlers above supply it. */
function unauthorizedOr500(c: any, error: unknown) {
  if (error instanceof UnauthorizedError) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  console.error('Account route failed', error);
  return c.json({ error: 'internal_error' }, 500);
}
