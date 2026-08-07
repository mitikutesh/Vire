import { Hono } from 'hono';
import { STORE_TAGS } from '@/domain/constants';
import type { StoreTag } from '@/domain/constants';
import { SCAN_LIMIT_PER_DAY } from '@/domain/offers';
import type { Deal, OfferScan } from '@/domain/schema';
import { UnauthorizedError, userIdFromClaims } from '../auth/identity';
import { bearerToken, type TokenVerifier } from '../auth/verifier';
import type { VireStore } from '../db/store';
import { OfferScanUnsupportedError, type AiProvider } from '../ai/types';

/**
 * The offer scan (E4.3, shim #6).
 *
 * There is no price API to call. S-Group publishes none, and Kesko's developer
 * portal only admits identities its Azure AD tenant has onboarded (PLAN §12), so
 * a model with a web-search tool reading the chains' own public offer pages is the
 * design rather than a stopgap. That is exactly why guardrail 5 exists: the result
 * is labelled best-effort, carries the time it was checked, and points at the
 * chains' price links to verify.
 *
 * Everything the model returns is clamped here, not trusted:
 *
 * - deals may only reference ids that are actually on **this** plan's list, so a
 *   hallucinated item cannot badge food the user is not buying;
 * - the store must be one of the three chains;
 * - one deal per item, at most fifteen, deal text truncated to 60 characters.
 *
 * Without that, a bad scan writes nonsense into a cache that then survives for
 * twelve hours.
 */

const MAX_DEALS = 15;
const MAX_DEAL_CHARS = 60;

const PLAN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface OfferRouteDeps {
  store: VireStore;
  verifier: TokenVerifier;
  /** The offer provider, which must have live web search (PLAN §3a). */
  provider: AiProvider;
  now?: () => Date;
}

/** Keep only deals that name a real item on this list and a real chain. */
export function clampDeals(raw: readonly Deal[], validIds: ReadonlySet<string>): Deal[] {
  const seen = new Set<string>();
  const kept: Deal[] = [];

  for (const deal of raw) {
    if (kept.length >= MAX_DEALS) break;
    if (!validIds.has(deal.id) || seen.has(deal.id)) continue;
    if (!STORE_TAGS.includes(deal.store as StoreTag)) continue;
    const text = deal.deal.trim().slice(0, MAX_DEAL_CHARS);
    if (!text) continue;

    seen.add(deal.id);
    kept.push({ id: deal.id, store: deal.store, deal: text });
  }
  return kept;
}

export function offerRoutes({ store, verifier, provider, now = () => new Date() }: OfferRouteDeps) {
  const app = new Hono();

  const requireUser = async (authorization: string | undefined) =>
    userIdFromClaims(await verifier.verify(bearerToken(authorization)));

  /** The cached scan, if there is one. The client decides whether it is stale. */
  app.get('/offers/:planId', async (c) => {
    const planId = c.req.param('planId');
    if (!PLAN_ID_PATTERN.test(planId)) return c.json({ error: 'invalid_plan_id' }, 400);
    try {
      const userId = await requireUser(c.req.header('authorization'));
      return c.json(await store.getOffers(userId, planId));
    } catch (error) {
      return unauthorizedOr500(c, error);
    }
  });

  app.post('/offers/:planId/scan', async (c) => {
    const planId = c.req.param('planId');
    if (!PLAN_ID_PATTERN.test(planId)) return c.json({ error: 'invalid_plan_id' }, 400);

    let userId;
    try {
      userId = await requireUser(c.req.header('authorization'));
    } catch (error) {
      return unauthorizedOr500(c, error);
    }

    const [profile, plan] = await Promise.all([
      store.getProfile(userId),
      store.getActivePlan(userId),
    ]);
    // The prompt needs the user's city — never a hardcoded Helsinki — and the
    // list is what the deals are clamped against.
    if (!profile) return c.json({ error: 'no_profile' }, 409);
    if (!plan || plan.planId !== planId) return c.json({ error: 'no_plan' }, 409);

    const used = await store.bumpRateLimit(userId, 'offers', dayKey(now()));
    if (used > SCAN_LIMIT_PER_DAY) {
      return c.json({ error: 'rate_limited', limit: SCAN_LIMIT_PER_DAY }, 429);
    }

    let result;
    try {
      result = await provider.scanOffers({
        items: plan.groc,
        city: profile.city,
        today: now(),
      });
    } catch (error) {
      if (error instanceof OfferScanUnsupportedError) {
        // A configuration error, not a bad week: the operator pointed
        // AI_PROVIDER_OFFERS at a provider with no web search.
        console.error('Offer scan attempted on a provider without web search', error);
        return c.json({ error: 'scan_unsupported' }, 501);
      }
      console.error('Offer scan failed', error);
      return c.json({ error: 'scan_failed' }, 502);
    }

    const scan: OfferScan = {
      checkedAt: now().getTime(),
      deals: clampDeals(result.deals, new Set(plan.groc.map((item) => item.id))),
      note: result.note.slice(0, 160),
    };

    // Cached with a TTL DynamoDB enforces itself, so nothing has to sweep it.
    await store.putOffers(userId, planId, scan);
    return c.json(scan);
  });

  return app;
}

/** UTC day, for the rate-limit counter only. */
const dayKey = (now: Date): string => now.toISOString().slice(0, 10);

/* eslint-disable @typescript-eslint/no-explicit-any -- Hono's context type is
   generic over the route; the handlers above supply it. */
function unauthorizedOr500(c: any, error: unknown) {
  if (error instanceof UnauthorizedError) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  console.error('Offers route failed', error);
  return c.json({ error: 'internal_error' }, 500);
}
