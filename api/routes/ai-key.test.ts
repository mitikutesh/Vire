// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { starterPlan } from '@/content/starter-plan';
import { UnauthorizedError, userIdFromClaims, type VerifiedClaims } from '../auth/identity';
import { MemoryIdentityAdmin } from '../auth/identity-admin';
import type { TokenVerifier } from '../auth/verifier';
import { MemoryStore } from '../db/memory-store';
import { ValidatingStore } from '../db/validating-store';
import { accountRoutes } from './account';
import { aiKeyRoutes } from './ai-key';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
/** Shaped like a real key, long enough to pass the length bound. */
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

const verifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedClaims> {
    const sub = token.startsWith('token-') ? token.slice('token-'.length) : '';
    if (!sub) throw new UnauthorizedError('Invalid token');
    return { sub };
  },
};

function setup() {
  const store = new ValidatingStore(new MemoryStore());
  const app = aiKeyRoutes({ store, verifier });
  const alice = userIdFromClaims({ sub: ALICE });

  const status = (sub = ALICE) =>
    app.request('/ai-key', { headers: { authorization: `Bearer token-${sub}` } });

  const set = (body: unknown, sub = ALICE) =>
    app.request('/ai-key', {
      method: 'PUT',
      headers: { authorization: `Bearer token-${sub}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const clear = (sub = ALICE) =>
    app.request('/ai-key', {
      method: 'DELETE',
      headers: { authorization: `Bearer token-${sub}` },
    });

  return { app, store, alice, status, set, clear };
}

describe('setting a key', () => {
  it('starts unset', async () => {
    const { status } = setup();
    expect(await (await status()).json()).toEqual({ set: false, provider: null });
  });

  it('stores it and reports which provider it is for', async () => {
    const { set, status } = setup();
    expect((await set({ provider: 'anthropic', key: KEY })).status).toBe(200);
    expect(await (await status()).json()).toEqual({ set: true, provider: 'anthropic' });
  });

  it('is available to the server for building a provider', async () => {
    // The one place the value may be read: server-side, to make a client.
    const { set, store, alice } = setup();
    await set({ provider: 'openai', key: KEY });
    expect(await store.getAiKey(alice)).toEqual({ provider: 'openai', key: KEY });
  });

  it('trims surrounding whitespace, which a paste often carries', async () => {
    const { set, store, alice } = setup();
    await set({ provider: 'anthropic', key: `  ${KEY}  ` });
    expect((await store.getAiKey(alice))?.key).toBe(KEY);
  });

  it('replaces an existing key', async () => {
    const { set, store, alice } = setup();
    await set({ provider: 'anthropic', key: KEY });
    await set({ provider: 'openai', key: `${KEY}zz` });
    expect(await store.getAiKey(alice)).toEqual({ provider: 'openai', key: `${KEY}zz` });
  });

  it('refuses an unknown provider', async () => {
    const { set } = setup();
    expect((await set({ provider: 'gemini', key: KEY })).status).toBe(422);
  });

  it('refuses something too short to be a key', async () => {
    const { set } = setup();
    expect((await set({ provider: 'anthropic', key: 'sk-nope' })).status).toBe(422);
  });
});

describe('never handing it back', () => {
  it('the status response carries no key, under any field name', async () => {
    // The invariant this whole route exists to hold: a stolen session must not
    // become a stolen credential.
    const { set, status } = setup();
    await set({ provider: 'anthropic', key: KEY });

    const body = await (await status()).text();
    expect(body).not.toContain(KEY);
    // Not even a fragment long enough to be useful.
    expect(body).not.toContain(KEY.slice(0, 20));
  });

  it('the write response carries no key either', async () => {
    const { set } = setup();
    const body = await (await set({ provider: 'anthropic', key: KEY })).text();
    expect(body).not.toContain(KEY);
  });

  it('a rejected key is not echoed in the validation issues', async () => {
    // Zod includes the received value in some messages; the route must not.
    const { set } = setup();
    const body = await (await set({ provider: 'anthropic', key: 'short' })).text();
    expect(body).not.toContain('short');
  });
});

describe('clearing it', () => {
  it('removes the key and reports unset', async () => {
    const { set, clear, status, store, alice } = setup();
    await set({ provider: 'anthropic', key: KEY });

    expect((await clear()).status).toBe(200);
    expect(await (await status()).json()).toEqual({ set: false, provider: null });
    expect(await store.getAiKey(alice)).toBeNull();
  });

  it('is harmless when there was none', async () => {
    const { clear } = setup();
    expect((await clear()).status).toBe(200);
  });
});

describe('authorization', () => {
  it('refuses unauthenticated requests on every verb', async () => {
    const { app } = setup();
    expect((await app.request('/ai-key')).status).toBe(401);
    expect((await app.request('/ai-key', { method: 'PUT', body: '{}' })).status).toBe(401);
    expect((await app.request('/ai-key', { method: 'DELETE' })).status).toBe(401);
  });

  it('keeps one user’s key out of another’s reach', async () => {
    const { set, status, store } = setup();
    await set({ provider: 'anthropic', key: KEY });

    expect(await (await status(BOB)).json()).toEqual({ set: false, provider: null });
    expect(await store.getAiKey(userIdFromClaims({ sub: BOB }))).toBeNull();
  });
});

describe('the export and deletion boundary (I6 × E7.6)', () => {
  /** The account routes share the store, so both features see the same data. */
  function withAccount() {
    const store = new ValidatingStore(new MemoryStore());
    const keys = aiKeyRoutes({ store, verifier });
    const account = accountRoutes({
      store,
      verifier,
      identity: new MemoryIdentityAdmin(),
      now: () => new Date('2026-08-09T10:00:00Z'),
    });
    return { store, keys, account, alice: userIdFromClaims({ sub: ALICE }) };
  }

  it('keeps the key out of the data export', async () => {
    // Otherwise the export feature becomes a way to exfiltrate a billable
    // credential — including for anyone who gets one request in as the user.
    const { store, keys, account, alice } = withAccount();
    await store.putProfile(alice, {
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
    });
    await keys.request('/ai-key', {
      method: 'PUT',
      headers: { authorization: `Bearer token-${ALICE}`, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'anthropic', key: KEY }),
    });

    const body = await (
      await account.request('/export', { headers: { authorization: `Bearer token-${ALICE}` } })
    ).text();

    expect(body).not.toContain(KEY);
    expect(body).not.toContain('AIKEY');
    // The rest of the export is intact — this is a filter, not a broken export.
    expect(body).toContain('PROFILE');
  });

  it('deletes the key when the account is deleted', async () => {
    // The counterpart risk: `deleteAll` must not derive its list from the export,
    // or anything withheld from the export would survive deletion.
    const { store, keys, account, alice } = withAccount();
    await store.activatePlan(alice, starterPlan(1));
    await keys.request('/ai-key', {
      method: 'PUT',
      headers: { authorization: `Bearer token-${ALICE}`, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'anthropic', key: KEY }),
    });
    expect(await store.getAiKey(alice)).not.toBeNull();

    await account.request('/account/delete', {
      method: 'POST',
      headers: { authorization: `Bearer token-${ALICE}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });

    expect(await store.getAiKey(alice)).toBeNull();
  });
});
