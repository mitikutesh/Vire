import { Hono } from 'hono';
import { aiKeySchema } from '@/domain/schema';
import { UnauthorizedError, userIdFromClaims } from '../auth/identity';
import { bearerToken, type TokenVerifier } from '../auth/verifier';
import type { VireStore } from '../db/store';

/**
 * The user's own AI provider key (E7.6).
 *
 * Users bring their own key, so nobody funds anyone else's generation — which is
 * also why the owner-level provider secrets are gone. The consequence is that Vire
 * stores a billable third-party credential, and that shapes every route here:
 *
 * - there is **no** endpoint that returns the key. `GET` answers whether one is
 *   set and for which provider, and nothing more. A "reveal" endpoint, even behind
 *   a fresh login, would turn a stolen session into a stolen credential.
 * - the value is never logged, never echoed in an error, and never included in the
 *   I6 export (see `UNEXPORTABLE_SK`).
 * - deleting the account deletes it, which is why `deleteAll` does not derive its
 *   list of items from the export.
 *
 * The key is not validated against the provider here. Whether it works is
 * something only Anthropic or OpenAI can say, and they say so on the first
 * generation — where the plan gate already has to handle a failure.
 */

export interface AiKeyRouteDeps {
  store: VireStore;
  verifier: TokenVerifier;
}

export function aiKeyRoutes({ store, verifier }: AiKeyRouteDeps) {
  const app = new Hono();

  const requireUser = async (authorization: string | undefined) =>
    userIdFromClaims(await verifier.verify(bearerToken(authorization)));

  /** Whether a key is set, and for which provider. Never the key. */
  app.get('/ai-key', async (c) => {
    try {
      const userId = await requireUser(c.req.header('authorization'));
      return c.json(await store.getAiKeyStatus(userId));
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  app.put('/ai-key', async (c) => {
    try {
      const userId = await requireUser(c.req.header('authorization'));

      const parsed = aiKeySchema.safeParse(await c.req.json());
      if (!parsed.success) {
        // Field names and messages only. The issues array must never carry the
        // value that failed, which is why nothing here echoes the input.
        return c.json(
          {
            error: 'invalid_ai_key',
            issues: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          422,
        );
      }

      await store.putAiKey(userId, { ...parsed.data, key: parsed.data.key.trim() });
      return c.json(await store.getAiKeyStatus(userId));
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  app.delete('/ai-key', async (c) => {
    try {
      const userId = await requireUser(c.req.header('authorization'));
      await store.deleteAiKey(userId);
      return c.json(await store.getAiKeyStatus(userId));
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
  // The error's name and message, never the error object or the request body: the
  // body holds the key, and a logged body is a logged credential. A bare
  // "route failed" with no reason was the first version, and it made a 500 here
  // undiagnosable — validation failures are answered as 422 above, so nothing
  // reaching this line carries the value that failed.
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
  console.error(`AI key route failed — ${reason}`);
  return c.json({ error: 'internal_error' }, 500);
}
