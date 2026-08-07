// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KCAL_FLOOR } from '@/content/plan';
import type { Profile } from '@/domain/schema';
import { calcTarget } from '@/domain/target';
import { UnauthorizedError, userIdFromClaims, type VerifiedClaims } from '../auth/identity';
import type { TokenVerifier } from '../auth/verifier';
import { MemoryStore } from '../db/memory-store';
import { ValidatingStore } from '../db/validating-store';
import { WEIGHT_HISTORY_LIMIT, weightRoutes } from './weight';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const TODAY = '2026-08-08';

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
  city: 'Helsinki',
  allergies: '',
  waterMl: 2000,
  target: 1600,
  timezone: 'Europe/Helsinki',
};

async function setup(options: { profile?: Profile | null } = {}) {
  const store = new ValidatingStore(new MemoryStore());
  const app = weightRoutes({ store, verifier });
  const alice = userIdFromClaims({ sub: ALICE });

  const profile = options.profile === undefined ? PROFILE : options.profile;
  if (profile) await store.putProfile(alice, { ...profile, target: calcTarget(profile) });

  const weighIn = (body: unknown, date = TODAY, sub = ALICE) =>
    app.request(`/weight/${date}`, {
      method: 'PUT',
      headers: { authorization: `Bearer token-${sub}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const list = (sub = ALICE) =>
    app.request('/weight', { headers: { authorization: `Bearer token-${sub}` } });

  return { app, store, alice, weighIn, list };
}

describe('recording a weigh-in', () => {
  it('stores it whether or not the target is updated', async () => {
    // Declining the new target is a decision about the target, not about whether
    // the weighing happened.
    const { weighIn, store, alice } = await setup();
    const response = await weighIn({ kg: 78.4, applyToProfile: false });

    expect(response.status).toBe(200);
    expect(await store.listWeights(alice, 10)).toEqual([{ date: TODAY, kg: 78.4 }]);
  });

  it('leaves the target alone when the user declines', async () => {
    const { weighIn, store, alice } = await setup();
    const before = (await store.getProfile(alice))?.target;

    await weighIn({ kg: 70, applyToProfile: false });
    const after = await store.getProfile(alice);

    expect(after?.target).toBe(before);
    // And the profile weight is untouched too, so the next preview is honest.
    expect(after?.w).toBe(80);
  });

  it('recomputes the target server-side when the user accepts', async () => {
    const { weighIn, store, alice } = await setup();
    const response = await weighIn({ kg: 74, applyToProfile: true });

    const body = (await response.json()) as { profile: Profile };
    const expected = calcTarget({ ...PROFILE, w: 74 });
    expect(body.profile.w).toBe(74);
    expect(body.profile.target).toBe(expected);
    expect((await store.getProfile(alice))?.target).toBe(expected);
  });

  it('ignores a target the client tries to dictate', async () => {
    // Guardrail 1: a stale bundle, a replay or a curl command must not be able to
    // set the calorie target directly.
    const { weighIn, store, alice } = await setup();
    await weighIn({ kg: 74, applyToProfile: true, target: 600 });

    expect((await store.getProfile(alice))?.target).toBe(calcTarget({ ...PROFILE, w: 74 }));
  });

  it('keeps the calorie floor as weight drops', async () => {
    // The reason this story exists at all — and the reason the floor lives on the
    // server. A very light target must still not go below 1200 for a woman.
    const { weighIn } = await setup({ profile: { ...PROFILE, age: 70, act: 1.2, pace: 750 } });
    const response = await weighIn({ kg: 45, applyToProfile: true });

    const body = (await response.json()) as { profile: Profile };
    expect(body.profile.target).toBe(KCAL_FLOOR.f);
  });

  it('replaces an earlier weigh-in on the same day', async () => {
    const { weighIn, store, alice } = await setup();
    await weighIn({ kg: 79, applyToProfile: false });
    await weighIn({ kg: 78.6, applyToProfile: false });

    expect(await store.listWeights(alice, 10)).toEqual([{ date: TODAY, kg: 78.6 }]);
  });
});

describe('rejections', () => {
  it('refuses a weight outside the plausible range', async () => {
    const { weighIn } = await setup();
    expect((await weighIn({ kg: 5, applyToProfile: false })).status).toBe(422);
    expect((await weighIn({ kg: 400, applyToProfile: false })).status).toBe(422);
  });

  it('requires an explicit answer about the target', async () => {
    // Defaulting either way would silently decide for the user.
    const { weighIn } = await setup();
    expect((await weighIn({ kg: 78 })).status).toBe(422);
  });

  it('refuses a date that is not a real day', async () => {
    const { weighIn } = await setup();
    expect((await weighIn({ kg: 78, applyToProfile: false }, '2026-02-31')).status).toBe(400);
  });

  it('refuses a weigh-in with no profile to attach it to', async () => {
    const { weighIn } = await setup({ profile: null });
    expect((await weighIn({ kg: 78, applyToProfile: false })).status).toBe(409);
  });
});

describe('the trend', () => {
  it('reads oldest first, so a line goes left to right', async () => {
    const { weighIn, list } = await setup();
    await weighIn({ kg: 80, applyToProfile: false }, '2026-07-25');
    await weighIn({ kg: 79, applyToProfile: false }, '2026-08-01');
    await weighIn({ kg: 78, applyToProfile: false }, '2026-08-08');

    const entries = (await (await list()).json()) as { date: string; kg: number }[];
    expect(entries.map((e) => e.kg)).toEqual([80, 79, 78]);
  });

  it('keeps the most recent history rather than the first weeks', async () => {
    const { weighIn, list } = await setup();
    for (let i = 1; i <= WEIGHT_HISTORY_LIMIT + 2; i += 1) {
      const day = String(i).padStart(2, '0');
      await weighIn({ kg: 80 - i, applyToProfile: false }, `2026-08-${day}`);
    }

    const entries = (await (await list()).json()) as { date: string }[];
    expect(entries).toHaveLength(WEIGHT_HISTORY_LIMIT);
    // The newest entry is present; the first two have fallen off the front.
    expect(entries.at(-1)?.date).toBe(
      `2026-08-${String(WEIGHT_HISTORY_LIMIT + 2).padStart(2, '0')}`,
    );
    expect(entries[0]?.date).toBe('2026-08-03');
  });

  it('starts empty', async () => {
    const { list } = await setup();
    expect(await (await list()).json()).toEqual([]);
  });
});

describe('authorization', () => {
  it('refuses an unauthenticated request', async () => {
    const { app } = await setup();
    expect((await app.request('/weight')).status).toBe(401);
    expect((await app.request(`/weight/${TODAY}`, { method: 'PUT', body: '{}' })).status).toBe(401);
  });

  it('keeps one user’s weigh-ins out of another’s reach', async () => {
    const { weighIn, list } = await setup();
    await weighIn({ kg: 78, applyToProfile: false });
    // Bob has no profile, so his weigh-in is refused and his history is empty.
    expect(await (await list(BOB)).json()).toEqual([]);
  });
});
