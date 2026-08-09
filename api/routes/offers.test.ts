// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { SCAN_LIMIT_PER_DAY } from '@/domain/offers';
import { starterPlan } from '@/content/starter-plan';
import type { Deal, OfferScan, Profile } from '@/domain/schema';
import { UnauthorizedError, userIdFromClaims, type VerifiedClaims } from '../auth/identity';
import type { TokenVerifier } from '../auth/verifier';
import { MemoryStore } from '../db/memory-store';
import { ValidatingStore } from '../db/validating-store';
import { OfferScanUnsupportedError, type AiProvider } from '../ai/types';
import { clampDeals, offerRoutes } from './offers';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-08T10:00:00Z');

const verifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedClaims> {
    const sub = token.startsWith('token-') ? token.slice('token-'.length) : '';
    if (!sub) throw new UnauthorizedError('Invalid token');
    return { sub };
  },
};

const PROFILE: Profile = {
  name: 'Aino',
  sex: 'f',
  age: 35,
  h: 170,
  w: 80,
  goalW: 72,
  act: 1.375,
  pace: 500,
  city: 'Espoo',
  allergies: '',
  waterMl: 2000,
  target: 1600,
  timezone: 'Europe/Helsinki',
};

function fakeProvider(deals: Deal[], note = 'From the chains’ offer pages.'): AiProvider {
  return {
    name: 'fake',
    model: 'fake-1',
    generateDay: vi.fn(),
    scanOffers: vi.fn().mockResolvedValue({ deals, note }),
  };
}

async function setup(
  options: { provider?: AiProvider | null; profile?: Profile | null; withPlan?: boolean } = {},
) {
  const store = new ValidatingStore(new MemoryStore());
  // `null` models a user who has not set an AI key (E7.6).
  const provider = options.provider === null ? null : (options.provider ?? fakeProvider([]));
  const app = offerRoutes({ store, verifier, providerFor: async () => provider, now: () => NOW });
  const alice = userIdFromClaims({ sub: ALICE });

  const profile = options.profile === undefined ? PROFILE : options.profile;
  if (profile) await store.putProfile(alice, profile);

  const plan =
    options.withPlan === false ? null : await store.activatePlan(alice, starterPlan(1_700_000_000));
  const planId = plan?.planId ?? 'plan-none';

  const scan = (sub = ALICE, id = planId) =>
    app.request(`/offers/${id}/scan`, {
      method: 'POST',
      headers: { authorization: `Bearer token-${sub}` },
    });

  const get = (sub = ALICE, id = planId) =>
    app.request(`/offers/${id}`, { headers: { authorization: `Bearer token-${sub}` } });

  return { app, store, provider: provider as AiProvider, plan, planId, scan, get };
}

describe('clampDeals', () => {
  const valid = new Set(['lohifilee', 'kaurahiutaleet']);

  it('drops a deal for an item that is not on the list', () => {
    // A hallucinated item must not badge food the user is not buying.
    const kept = clampDeals([{ id: 'kaviaari', store: 'S', deal: '−30 %' }], valid);
    expect(kept).toEqual([]);
  });

  it('keeps one deal per item', () => {
    const kept = clampDeals(
      [
        { id: 'lohifilee', store: 'S', deal: '−20 %' },
        { id: 'lohifilee', store: 'K', deal: '−25 %' },
      ],
      valid,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]?.store).toBe('S');
  });

  it('truncates a long deal instead of storing it', () => {
    const kept = clampDeals([{ id: 'lohifilee', store: 'S', deal: 'x'.repeat(200) }], valid);
    expect(kept[0]?.deal).toHaveLength(60);
  });

  it('drops a deal whose text is only whitespace', () => {
    expect(clampDeals([{ id: 'lohifilee', store: 'S', deal: '   ' }], valid)).toEqual([]);
  });

  it('caps the list at fifteen', () => {
    const ids = new Set(Array.from({ length: 30 }, (_, i) => `item-${i}`));
    const many: Deal[] = [...ids].map((id) => ({ id, store: 'S' as const, deal: '−10 %' }));
    expect(clampDeals(many, ids)).toHaveLength(15);
  });
});

describe('running a scan', () => {
  it('passes the profile’s city, not a hardcoded Helsinki', async () => {
    const provider = fakeProvider([]);
    const { scan } = await setup({ provider });
    await scan();

    const request = (provider.scanOffers as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect((request as { city: string }).city).toBe('Espoo');
  });

  it('passes the plan’s own list, so the deals can be checked against it', async () => {
    const provider = fakeProvider([]);
    const { scan, plan } = await setup({ provider });
    await scan();

    const request = (provider.scanOffers as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      items: { id: string }[];
    };
    expect(request.items).toHaveLength(plan!.groc.length);
  });

  it('caches the clamped result', async () => {
    // One real item and one invention: only the real one survives into the cache.
    const { scan, get } = await setup({
      provider: fakeProvider([
        { id: 'lohifilee', store: 'S', deal: '−20 %' },
        { id: 'not-on-the-list', store: 'K', deal: '−50 %' },
      ]),
    });

    expect((await scan()).status).toBe(200);

    const cached = (await (await get()).json()) as OfferScan;
    expect(cached.deals.map((d) => d.id)).toEqual(['lohifilee']);
    expect(cached.checkedAt).toBe(NOW.getTime());
  });

  it('reports no scan yet before the first one', async () => {
    const { get } = await setup();
    expect(await (await get()).json()).toBeNull();
  });
});

describe('refusals', () => {
  it('refuses without a profile, since the prompt needs a city', async () => {
    const { scan } = await setup({ profile: null });
    expect((await scan()).status).toBe(409);
  });

  it('refuses a plan id that is not the active plan', async () => {
    // The deals are clamped against the active list; scanning against an old plan
    // would badge items that are no longer being bought.
    const { scan } = await setup();
    expect((await scan(ALICE, 'plan-stale')).status).toBe(409);
  });

  it('reports a provider without web search as a configuration error', async () => {
    // 501, not 502: nothing is wrong with the week — the operator pointed
    // AI_PROVIDER_OFFERS at an adapter that cannot search.
    const provider = fakeProvider([]);
    provider.scanOffers = vi.fn().mockRejectedValue(new OfferScanUnsupportedError('bedrock'));
    const { scan } = await setup({ provider });
    expect((await scan()).status).toBe(501);
  });

  it('reports a failed scan as a bad gateway', async () => {
    const provider = fakeProvider([]);
    provider.scanOffers = vi.fn().mockRejectedValue(new Error('search timed out'));
    const { scan } = await setup({ provider });
    expect((await scan()).status).toBe(502);
  });

  it('spends the daily allowance and then refuses', async () => {
    // The priciest request the app makes.
    const { scan } = await setup();
    for (let i = 0; i < SCAN_LIMIT_PER_DAY; i += 1) {
      expect((await scan()).status).toBe(200);
    }
    const blocked = await scan();
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: 'rate_limited' });
  });

  it('does not spend the allowance when there is no profile', async () => {
    const { scan, store } = await setup({ profile: null });
    await scan();
    const alice = userIdFromClaims({ sub: ALICE });
    expect(await store.bumpRateLimit(alice, 'offers', '2026-08-08')).toBe(1);
  });
});

describe('authorization', () => {
  it('refuses an unauthenticated request', async () => {
    const { app, planId } = await setup();
    expect((await app.request(`/offers/${planId}`)).status).toBe(401);
    expect((await app.request(`/offers/${planId}/scan`, { method: 'POST' })).status).toBe(401);
  });

  it('keeps one user’s scan out of another’s reach', async () => {
    const { scan, get } = await setup({
      provider: fakeProvider([{ id: 'lohifilee', store: 'S', deal: '−20 %' }]),
    });
    await scan();
    expect(await (await get(BOB)).json()).toBeNull();
  });

  it('refuses a plan id that could not be one', async () => {
    const { get } = await setup();
    expect((await get(ALICE, 'plan id')).status).toBe(400);
  });
});

describe('without an AI key (E7.6)', () => {
  it('refuses to scan', async () => {
    const { scan } = await setup({ provider: null });
    const response = await scan();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'no_ai_key' });
  });

  it('does not spend the daily allowance', async () => {
    const { scan, store } = await setup({ provider: null });
    await scan();
    const alice = userIdFromClaims({ sub: ALICE });
    expect(await store.bumpRateLimit(alice, 'offers', '2026-08-08')).toBe(1);
  });
});
