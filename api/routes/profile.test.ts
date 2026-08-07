// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KCAL_FLOOR } from '@/content/plan';
import { calcTarget } from '@/domain/target';
import type { Profile } from '@/domain/schema';
import { UnauthorizedError, type VerifiedClaims } from '../auth/identity';
import type { TokenVerifier } from '../auth/verifier';
import { MemoryStore } from '../db/memory-store';
import { ValidatingStore } from '../db/validating-store';
import { profileRoutes, type ProfileInput } from './profile';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

/** Accepts `token-<sub>` and rejects everything else. */
const fakeVerifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedClaims> {
    const sub = token.startsWith('token-') ? token.slice('token-'.length) : '';
    if (!sub) throw new UnauthorizedError('Invalid token');
    return { sub };
  },
};

const input = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
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
  timezone: 'Europe/Helsinki',
  ...overrides,
});

function setup() {
  const store = new ValidatingStore(new MemoryStore());
  const app = profileRoutes({ store, verifier: fakeVerifier });

  const put = (body: unknown, token = `token-${ALICE}`) =>
    app.request('/profile', {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const get = (token = `token-${ALICE}`) =>
    app.request('/profile', { headers: { authorization: `Bearer ${token}` } });

  return { app, store, put, get };
}

describe('PUT /profile — server-side target (I5, guardrail 1)', () => {
  it('computes the target instead of trusting the client', async () => {
    const { put } = setup();
    const res = await put(input());
    expect(res.status).toBe(200);

    const profile = (await res.json()) as Profile;
    expect(profile.target).toBe(calcTarget(input()));
    expect(profile.target).toBe(1600);
  });

  it('ignores a target supplied by the client', async () => {
    // The attack this closes: a crafted request asking for a starvation budget.
    const { put } = setup();
    const res = await put({ ...input(), target: 600 });
    const profile = (await res.json()) as Profile;
    expect(profile.target).toBe(1600);
  });

  it('holds the calorie floor even when the numbers ask for less', async () => {
    const { put } = setup();
    const res = await put(input({ sex: 'f', age: 70, h: 150, w: 45, act: 1.2, pace: 750 }));
    const profile = (await res.json()) as Profile;
    // Unfloored this is roughly 300 kcal.
    expect(profile.target).toBe(KCAL_FLOOR.f);
  });

  it('holds the male floor too', async () => {
    const { put } = setup();
    const res = await put(input({ sex: 'm', age: 70, h: 150, w: 45, act: 1.2, pace: 750 }));
    expect(((await res.json()) as Profile).target).toBe(KCAL_FLOOR.m);
  });

  it('recomputes on every save, so the target cannot go stale', async () => {
    const { put } = setup();
    await put(input({ w: 80 }));
    const res = await put(input({ w: 74 }));
    const profile = (await res.json()) as Profile;
    expect(profile.target).toBe(calcTarget(input({ w: 74 })));
    expect(profile.target).not.toBe(calcTarget(input({ w: 80 })));
  });

  it('persists the profile it computed', async () => {
    const { put, get } = setup();
    await put(input({ name: 'Aino' }));
    const profile = (await (await get()).json()) as Profile;
    expect(profile.name).toBe('Aino');
    expect(profile.target).toBe(1600);
  });
});

describe('PUT /profile — validation', () => {
  it('rejects an out-of-range weight with the offending field named', async () => {
    const { put } = setup();
    const res = await put(input({ w: 5 }));
    expect(res.status).toBe(422);

    const body = (await res.json()) as { error: string; issues: { field: string }[] };
    expect(body.error).toBe('invalid_profile');
    expect(body.issues.map((i) => i.field)).toContain('w');
  });

  it('rejects an implausible age or height', async () => {
    const { put } = setup();
    expect((await put(input({ age: 3 }))).status).toBe(422);
    expect((await put(input({ h: 40 }))).status).toBe(422);
  });

  it('rejects a pace that is not one of the three offered', async () => {
    const { put } = setup();
    expect((await put(input({ pace: 1500 as unknown as 500 }))).status).toBe(422);
  });

  it('rejects a missing field rather than defaulting it', async () => {
    const { put } = setup();
    const { sex: _sex, ...withoutSex } = input();
    expect((await put(withoutSex)).status).toBe(422);
  });

  it('rejects malformed JSON', async () => {
    const { app } = setup();
    const res = await app.request('/profile', {
      method: 'PUT',
      headers: { authorization: `Bearer token-${ALICE}`, 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('profile routes — authorization', () => {
  it('refuses a request with no token', async () => {
    const { app } = setup();
    expect((await app.request('/profile')).status).toBe(401);
  });

  it('refuses a malformed Authorization header', async () => {
    const { app } = setup();
    for (const header of ['', 'token-abc', 'Basic abc', 'Bearer', 'Bearer   ']) {
      const res = await app.request('/profile', { headers: { authorization: header } });
      expect(res.status, header).toBe(401);
    }
  });

  it('refuses a token the verifier rejects', async () => {
    const { get } = setup();
    expect((await get('forged')).status).toBe(401);
  });

  it('keeps one user’s profile out of another’s reach', async () => {
    // The partition key comes from the verified token, so Bob's token cannot
    // reach Alice's row no matter what the request body says.
    const { put, get } = setup();
    await put(input({ name: 'Aino' }), `token-${ALICE}`);

    expect((await get(`token-${BOB}`)).status).toBe(404);

    await put(input({ name: 'Väinö', sex: 'm' }), `token-${BOB}`);
    const alice = (await (await get(`token-${ALICE}`)).json()) as Profile;
    expect(alice.name).toBe('Aino');
  });
});

describe('GET /profile', () => {
  it('reports no profile yet, which is what triggers first-run', async () => {
    const { get } = setup();
    const res = await get();
    expect(res.status).toBe(404);
    expect((await res.json()) as { error: string }).toEqual({ error: 'no_profile' });
  });
});
