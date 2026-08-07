import { Hono } from 'hono';
import { z } from 'zod';
import { profileSchema } from '@/domain/schema';
import type { Profile } from '@/domain/schema';
import { calcTarget } from '@/domain/target';
import { UnauthorizedError, userIdFromClaims } from '../auth/identity';
import { bearerToken, type TokenVerifier } from '../auth/verifier';
import type { VireStore } from '../db/store';

/**
 * Profile routes.
 *
 * The one rule this file exists to enforce: **the daily calorie target is
 * computed here, never accepted from the client** (PLAN §6, I5; §7 guardrail 1).
 * The floors that keep the target medically sane live in `calcTarget`, and a
 * client-side-only check is one a stale bundle, a replayed request or a curl
 * command can skip.
 */

/** What the client may send: the profile without the target it does not own. */
export const profileInputSchema = profileSchema.omit({ target: true });
export type ProfileInput = z.infer<typeof profileInputSchema>;

export interface ProfileRouteDeps {
  store: VireStore;
  verifier: TokenVerifier;
}

export function profileRoutes({ store, verifier }: ProfileRouteDeps) {
  const app = new Hono();

  /** Resolve the caller from the token alone. */
  const requireUser = async (authorization: string | undefined) => {
    const claims = await verifier.verify(bearerToken(authorization));
    return userIdFromClaims(claims);
  };

  app.get('/profile', async (c) => {
    try {
      const userId = await requireUser(c.req.header('authorization'));
      const profile = await store.getProfile(userId);
      // 404 rather than an empty object: "no profile yet" is what puts the app
      // into first-run, and an empty profile would silently look configured.
      return profile ? c.json(profile) : c.json({ error: 'no_profile' }, 404);
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  app.put('/profile', async (c) => {
    try {
      const userId = await requireUser(c.req.header('authorization'));

      const parsed = profileInputSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        // Field-level detail so the form can mark the offending input; the
        // ranges themselves are the schema's (age 13–120, weight 30–300, …).
        return c.json(
          {
            error: 'invalid_profile',
            issues: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          422,
        );
      }

      // Recomputed, not trusted. A request claiming `target: 600` is ignored
      // because the field is not even in the accepted shape.
      const profile: Profile = { ...parsed.data, target: calcTarget(parsed.data) };
      await store.putProfile(userId, profile);
      return c.json(profile);
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
  console.error('Profile route failed', error);
  return c.json({ error: 'internal_error' }, 500);
}
