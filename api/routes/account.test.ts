// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { starterPlan } from '@/content/starter-plan';
import { emptyLog } from '@/domain/log';
import type { Profile } from '@/domain/schema';
import { UnauthorizedError, userIdFromClaims, type VerifiedClaims } from '../auth/identity';
import { MemoryIdentityAdmin } from '../auth/identity-admin';
import type { TokenVerifier } from '../auth/verifier';
import { MemoryStore } from '../db/memory-store';
import { ValidatingStore } from '../db/validating-store';
import { DELETE_CONFIRMATION, EXPORT_VERSION, accountRoutes } from './account';

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
  city: 'Helsinki',
  allergies: 'peanuts',
  waterMl: 2000,
  target: 1600,
  timezone: 'Europe/Helsinki',
};

async function setup(options: { identity?: MemoryIdentityAdmin; seed?: boolean } = {}) {
  const store = new ValidatingStore(new MemoryStore());
  const identity = options.identity ?? new MemoryIdentityAdmin();
  const app = accountRoutes({ store, verifier, identity, now: () => NOW });

  const alice = userIdFromClaims({ sub: ALICE });
  const bob = userIdFromClaims({ sub: BOB });

  if (options.seed !== false) {
    await store.putProfile(alice, PROFILE);
    await store.activatePlan(alice, starterPlan(1_700_000_000));
    await store.putLog(alice, '2026-08-07', { ...emptyLog(), water: 5 });
    await store.putWeight(alice, '2026-08-07', { kg: 79 });
    // Bob's data must be untouched by anything Alice does.
    await store.putProfile(bob, PROFILE);
  }

  const exportData = (sub = ALICE) =>
    app.request('/export', { headers: { authorization: `Bearer token-${sub}` } });

  const deleteAccount = (body: unknown, sub = ALICE) =>
    app.request('/account/delete', {
      method: 'POST',
      headers: { authorization: `Bearer token-${sub}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  return { app, store, identity, alice, bob, exportData, deleteAccount };
}

describe('GET /export', () => {
  it('returns a versioned, timestamped envelope', async () => {
    // A future importer needs to know what it is holding.
    const { exportData } = await setup();
    const body = (await (await exportData()).json()) as { v: number; exportedAt: string };
    expect(body.v).toBe(EXPORT_VERSION);
    expect(body.exportedAt).toBe(NOW.toISOString());
  });

  it('includes every kind of item the account holds', async () => {
    // Raw items rather than a curated shape: a hand-picked subset is a promise
    // that quietly rots as new item types are added.
    const { exportData } = await setup();
    const body = (await (await exportData()).json()) as { items: { sk: string }[] };
    const kinds = body.items.map((item) => item.sk);

    expect(kinds).toContain('PROFILE');
    expect(kinds).toContain('PLAN#ACTIVE');
    expect(kinds).toContain('LOG#2026-08-07');
    expect(kinds).toContain('WEIGHT#2026-08-07');
  });

  it('leaves the partition key out', async () => {
    // It embeds the Cognito subject — an identifier for the account, not data
    // about the user.
    const { exportData } = await setup();
    const body = (await (await exportData()).json()) as { items: Record<string, unknown>[] };
    for (const item of body.items) expect(item).not.toHaveProperty('pk');
  });

  it('carries the real values, not placeholders', async () => {
    const { exportData } = await setup();
    const body = (await (await exportData()).json()) as { items: Record<string, unknown>[] };
    const profile = body.items.find((item) => item['sk'] === 'PROFILE');
    expect(profile).toMatchObject({ allergies: 'peanuts', target: 1600 });
  });

  it('exports nothing for an account with nothing', async () => {
    const { exportData } = await setup({ seed: false });
    const body = (await (await exportData()).json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('exports only the caller’s own data', async () => {
    const { exportData } = await setup();
    const body = (await (await exportData()).json()) as { items: { sk: string }[] };
    // Bob has only a profile; Alice's export should not be one item long.
    expect(body.items.length).toBeGreaterThan(1);

    const bobs = (await (await exportData(BOB)).json()) as { items: { sk: string }[] };
    expect(bobs.items.map((i) => i.sk)).toEqual(['PROFILE']);
  });

  it('refuses an unauthenticated request', async () => {
    const { app } = await setup();
    expect((await app.request('/export')).status).toBe(401);
  });
});

describe('POST /account/delete', () => {
  it('requires the confirmation word', async () => {
    // Deletion has no undo, so a stray POST must not be enough.
    const { deleteAccount, store, alice } = await setup();
    const response = await deleteAccount({});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'confirmation_required' });
    expect(await store.getProfile(alice)).not.toBeNull();
  });

  it('rejects a near miss', async () => {
    const { deleteAccount, store, alice } = await setup();
    expect((await deleteAccount({ confirm: 'delete my account' })).status).toBe(400);
    expect(await store.getProfile(alice)).not.toBeNull();
  });

  it('accepts the word whatever case it was typed in', async () => {
    const { deleteAccount } = await setup();
    expect((await deleteAccount({ confirm: ' delete ' })).status).toBe(200);
  });

  it('removes every item and the account itself', async () => {
    const { deleteAccount, store, identity, alice } = await setup();
    await deleteAccount({ confirm: DELETE_CONFIRMATION });

    expect(await store.exportAll(alice)).toEqual([]);
    expect(await store.getProfile(alice)).toBeNull();
    expect(identity.deleted).toEqual([alice]);
  });

  it('deletes the data before the account', async () => {
    // The other order can strand items under a subject that can never sign in
    // again: data nobody can reach and nobody can remove.
    const failing = new MemoryIdentityAdmin(new Error('Cognito is down'));
    const { deleteAccount, store, alice } = await setup({ identity: failing });

    const response = await deleteAccount({ confirm: DELETE_CONFIRMATION });
    // The data is gone even though the account survived, which is the recoverable
    // direction: the user can simply ask again.
    expect(await store.exportAll(alice)).toEqual([]);
    // And it says so specifically, because "nothing was removed" would be a lie.
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: 'account_not_closed' });
  });

  it('leaves other accounts alone', async () => {
    const { deleteAccount, store, bob } = await setup();
    await deleteAccount({ confirm: DELETE_CONFIRMATION });
    expect(await store.getProfile(bob)).not.toBeNull();
  });

  it('rejects a body that is not JSON', async () => {
    const { app } = await setup();
    const response = await app.request('/account/delete', {
      method: 'POST',
      headers: { authorization: `Bearer token-${ALICE}`, 'content-type': 'application/json' },
      body: 'nope',
    });
    expect(response.status).toBe(400);
  });

  it('refuses an unauthenticated request', async () => {
    const { app } = await setup();
    const response = await app.request('/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm: DELETE_CONFIRMATION }),
    });
    expect(response.status).toBe(401);
  });
});
