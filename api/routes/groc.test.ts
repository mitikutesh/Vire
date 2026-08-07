// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { starterPlan } from '@/content/starter-plan';
import { UnauthorizedError, userIdFromClaims, type VerifiedClaims } from '../auth/identity';
import type { TokenVerifier } from '../auth/verifier';
import { MemoryStore } from '../db/memory-store';
import { ValidatingStore } from '../db/validating-store';
import { grocRoutes } from './groc';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = 'plan-abc123';

const verifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedClaims> {
    const sub = token.startsWith('token-') ? token.slice('token-'.length) : '';
    if (!sub) throw new UnauthorizedError('Invalid token');
    return { sub };
  },
};

function setup() {
  const store = new ValidatingStore(new MemoryStore());
  const app = grocRoutes({ store, verifier });

  const get = (planId = PLAN_ID, sub = ALICE) =>
    app.request(`/groc/${planId}`, { headers: { authorization: `Bearer token-${sub}` } });

  const put = (state: unknown, planId = PLAN_ID, sub = ALICE) =>
    app.request(`/groc/${planId}`, {
      method: 'PUT',
      headers: { authorization: `Bearer token-${sub}`, 'content-type': 'application/json' },
      body: JSON.stringify(state),
    });

  return { app, store, get, put };
}

describe('reading grocery state', () => {
  it('starts as an empty basket rather than a 404', async () => {
    // Nothing ticked is the normal starting point for every new week.
    const { get } = setup();
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checked: {}, store: {} });
  });

  it('returns what was stored', async () => {
    const { get, put } = setup();
    await put({ checked: { lohifilee: true }, store: { kaurahiutaleet: 'K' } });
    expect(await (await get()).json()).toEqual({
      checked: { lohifilee: true },
      store: { kaurahiutaleet: 'K' },
    });
  });
});

describe('writing grocery state', () => {
  it('rejects a store tag that is not a chain', async () => {
    const { put } = setup();
    const response = await put({ checked: {}, store: { lohifilee: 'X' } });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: 'invalid_groc_state' });
  });

  it('rejects a state that is not one', async () => {
    const { put } = setup();
    expect((await put({ checked: 'yes' })).status).toBe(422);
  });

  it('rejects a body that is not JSON', async () => {
    const { app } = setup();
    const response = await app.request(`/groc/${PLAN_ID}`, {
      method: 'PUT',
      headers: { authorization: `Bearer token-${ALICE}`, 'content-type': 'application/json' },
      body: '{oops',
    });
    expect(response.status).toBe(400);
  });
});

describe('plan scoping', () => {
  it('keeps each plan’s state separate', async () => {
    // Review blocker #1: last week's ticks must not sit on ids that now mean
    // different food.
    const { get, put } = setup();
    await put({ checked: { lohifilee: true }, store: {} }, 'plan-one');
    expect(await (await get('plan-two')).json()).toEqual({ checked: {}, store: {} });
  });

  it('is cleared when a new plan is activated', async () => {
    // The transaction that writes the new plan deletes the old plan's state, so a
    // regenerate always starts from an empty basket.
    const { store, get, put } = setup();
    const alice = userIdFromClaims({ sub: ALICE });
    const first = await store.activatePlan(alice, starterPlan(1));
    await put({ checked: { lohifilee: true }, store: {} }, first.planId);

    await store.activatePlan(alice, starterPlan(2));
    expect(await (await get(first.planId)).json()).toEqual({ checked: {}, store: {} });
  });

  it('refuses a plan id that could not be one', async () => {
    // The id becomes a sort key; a path-shaped one has no business there.
    const { get } = setup();
    expect((await get('../../etc')).status).toBe(404); // not even a route match
    expect((await get('plan id')).status).toBe(400);
    expect((await get('a'.repeat(65))).status).toBe(400);
  });
});

describe('authorization', () => {
  it('refuses an unauthenticated request', async () => {
    const { app } = setup();
    expect((await app.request(`/groc/${PLAN_ID}`)).status).toBe(401);
    expect((await app.request(`/groc/${PLAN_ID}`, { method: 'PUT', body: '{}' })).status).toBe(401);
  });

  it('keeps one user’s basket out of another’s reach, even with the same plan id', async () => {
    // The partition comes from the token; the plan id is only a suffix inside it.
    const { get, put } = setup();
    await put({ checked: { lohifilee: true }, store: {} });
    expect(await (await get(PLAN_ID, BOB)).json()).toEqual({ checked: {}, store: {} });
  });
});
