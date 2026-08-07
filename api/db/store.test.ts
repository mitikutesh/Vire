// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { starterPlan } from '@/content/starter-plan';
import { emptyLog } from '@/domain/log';
import type { Profile } from '@/domain/schema';
import { userIdFromClaims } from '../auth/identity';
import { MemoryStore } from './memory-store';
import { ValidatingStore } from './validating-store';
import type { UserId, VireStore } from './index';

const alice = userIdFromClaims({ sub: '11111111-1111-4111-8111-111111111111' });
const bob = userIdFromClaims({ sub: '22222222-2222-4222-8222-222222222222' });

const profile = (overrides: Partial<Profile> = {}): Profile => ({
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
  ...overrides,
});

const store = (): VireStore => new ValidatingStore(new MemoryStore());

describe('per-user isolation', () => {
  /* DynamoDB has no row-level security. Isolation rests entirely on every key
     being derived from the token subject, so these are the tests that stand in
     for the RLS policies a relational database would have given us. */

  it('keeps profiles apart', async () => {
    const db = store();
    await db.putProfile(alice, profile({ name: 'Aino' }));
    await db.putProfile(bob, profile({ name: 'Väinö', sex: 'm', target: 1900 }));

    expect((await db.getProfile(alice))?.name).toBe('Aino');
    expect((await db.getProfile(bob))?.name).toBe('Väinö');
  });

  it('does not leak one user’s food log to another', async () => {
    const db = store();
    await db.putLog(alice, '2026-08-07', { ...emptyLog(), water: 6 });

    expect(await db.getLog(bob, '2026-08-07')).toBeNull();
    expect((await db.getLog(alice, '2026-08-07'))?.water).toBe(6);
  });

  it('does not leak plans, weigh-ins or rate limits', async () => {
    const db = store();
    await db.activatePlan(alice, starterPlan(1_700_000_000_000));
    await db.putWeight(alice, '2026-08-07', { kg: 79.4 });
    await db.bumpRateLimit(alice, 'generate', '2026-08-07');

    expect(await db.getActivePlan(bob)).toBeNull();
    expect(await db.listWeights(bob, 10)).toEqual([]);
    // Bob's counter starts at 1, not at Alice's value.
    expect(await db.bumpRateLimit(bob, 'generate', '2026-08-07')).toBe(1);
  });

  it('deletes only the requested user’s data', async () => {
    const db = store();
    await db.putProfile(alice, profile());
    await db.putProfile(bob, profile());

    await db.deleteAll(alice);

    expect(await db.getProfile(alice)).toBeNull();
    expect(await db.getProfile(bob)).not.toBeNull();
  });

  it('cannot be addressed by a forged subject that escapes its partition', () => {
    // `#` separates key segments, so a subject containing one could otherwise
    // be crafted to point at another user's items.
    expect(() => userIdFromClaims({ sub: 'attacker#USER' })).toThrow(/reserved character/i);
    expect(() => userIdFromClaims({ sub: '' })).toThrow(/no subject/i);
    expect(() => userIdFromClaims({ sub: '   ' })).toThrow(/no subject/i);
  });
});

describe('plan activation', () => {
  it('clears the previous plan’s grocery state and cached offers', async () => {
    // The plan-review blocker: stale checked boxes and offer badges must not
    // survive into the new week, where the same ids mean different food.
    const db = store();
    const first = await db.activatePlan(alice, starterPlan(1_000));
    await db.putGrocState(alice, first.planId, {
      checked: { peruna: true },
      store: { peruna: 'K' },
    });
    await db.putOffers(alice, first.planId, {
      checkedAt: 1_000,
      deals: [{ id: 'peruna', store: 'K', deal: 'peruna 0,99 €/kg' }],
      note: 'cheap potatoes',
    });

    const second = await db.activatePlan(alice, starterPlan(2_000));

    expect(second.planId).not.toBe(first.planId);
    expect(await db.getOffers(alice, first.planId)).toBeNull();
    expect(await db.getGrocState(alice, first.planId)).toEqual({ checked: {}, store: {} });
    // …and the new plan starts with nothing checked.
    expect(await db.getGrocState(alice, second.planId)).toEqual({ checked: {}, store: {} });
  });

  it('gives each plan its own id so state cannot be shared between weeks', async () => {
    const db = store();
    const a = await db.activatePlan(alice, starterPlan(1_000));
    const b = await db.activatePlan(alice, starterPlan(2_000));
    expect(a.planId).not.toBe(b.planId);
  });

  it('keeps exactly one active plan', async () => {
    const db = store();
    await db.activatePlan(alice, starterPlan(1_000));
    const second = await db.activatePlan(alice, starterPlan(2_000));
    expect((await db.getActivePlan(alice))?.planId).toBe(second.planId);
  });
});

describe('write validation', () => {
  it('rejects a profile weight outside the plausible range', async () => {
    // Not cosmetic: the calorie target is computed from these numbers.
    const db = store();
    await expect(db.putProfile(alice, profile({ w: 5 }))).rejects.toThrow();
    await expect(db.putProfile(alice, profile({ w: 700 }))).rejects.toThrow();
  });

  it('rejects an implausible age or height', async () => {
    const db = store();
    await expect(db.putProfile(alice, profile({ age: 3 }))).rejects.toThrow();
    await expect(db.putProfile(alice, profile({ h: 40 }))).rejects.toThrow();
  });

  it('rejects a pace that is not one of the three offered', async () => {
    const db = store();
    // @ts-expect-error deliberately invalid: the schema is the last line of defence
    await expect(db.putProfile(alice, profile({ pace: 1500 }))).rejects.toThrow();
  });

  it('rejects a malformed date key instead of writing a junk sort key', async () => {
    const db = store();
    await expect(db.putLog(alice, '07-08-2026', emptyLog())).rejects.toThrow(/date key/i);
    await expect(db.putLog(alice, 'LOG#2026-08-07', emptyLog())).rejects.toThrow(/date key/i);
  });

  it('rejects a weigh-in outside the plausible range', async () => {
    const db = store();
    await expect(db.putWeight(alice, '2026-08-07', { kg: 500 })).rejects.toThrow();
  });

  it('accepts a valid profile, log and weigh-in', async () => {
    const db = store();
    await expect(db.putProfile(alice, profile())).resolves.toBeUndefined();
    await expect(db.putLog(alice, '2026-08-07', emptyLog())).resolves.toBeUndefined();
    await expect(db.putWeight(alice, '2026-08-07', { kg: 79.4 })).resolves.toBeUndefined();
  });
});

describe('reads', () => {
  it('returns null for a day that was never logged', async () => {
    expect(await store().getLog(alice, '2026-01-01')).toBeNull();
  });

  it('returns an empty grocery state rather than null', async () => {
    // The Shop tab should render an unchecked list, not crash on a missing item.
    expect(await store().getGrocState(alice, 'plan-1')).toEqual({ checked: {}, store: {} });
  });

  it('lists logs newest first for the adherence summary', async () => {
    const db = store();
    // Written out of order on purpose — the read must impose the order.
    for (const date of ['2026-08-05', '2026-08-07', '2026-08-06']) {
      await db.putLog(alice, date, emptyLog());
    }
    const logs = await db.listLogs(alice, 7);
    expect(logs.map((l) => l.date)).toEqual(['2026-08-07', '2026-08-06', '2026-08-05']);
  });

  it('lists weigh-ins oldest first so a trend reads left to right', async () => {
    const db = store();
    await db.putWeight(alice, '2026-08-07', { kg: 79 });
    await db.putWeight(alice, '2026-07-31', { kg: 80 });
    const weights = await db.listWeights(alice, 10);
    expect(weights.map((w) => w.date)).toEqual(['2026-07-31', '2026-08-07']);
  });

  it('replaces a same-day weigh-in rather than adding a second', async () => {
    const db = store();
    await db.putWeight(alice, '2026-08-07', { kg: 79 });
    await db.putWeight(alice, '2026-08-07', { kg: 78.6 });
    const weights = await db.listWeights(alice, 10);
    expect(weights).toHaveLength(1);
    expect(weights[0]?.kg).toBe(78.6);
  });

  it('does not hand out references into stored state', async () => {
    // A caller mutating a returned object must not change the database.
    const db = store();
    await db.putLog(alice, '2026-08-07', { ...emptyLog(), water: 3 });
    const log = await db.getLog(alice, '2026-08-07');
    if (log) log.water = 99;
    expect((await db.getLog(alice, '2026-08-07'))?.water).toBe(3);
  });
});

describe('rate limits', () => {
  it('counts up per user, per action, per day', async () => {
    const db = store();
    expect(await db.bumpRateLimit(alice, 'generate', '2026-08-07')).toBe(1);
    expect(await db.bumpRateLimit(alice, 'generate', '2026-08-07')).toBe(2);
    // A different action and a different day each start fresh.
    expect(await db.bumpRateLimit(alice, 'offer_scan', '2026-08-07')).toBe(1);
    expect(await db.bumpRateLimit(alice, 'generate', '2026-08-08')).toBe(1);
  });
});

describe('export', () => {
  it('returns every item in the user’s partition', async () => {
    const db = store();
    await db.putProfile(alice, profile());
    await db.putLog(alice, '2026-08-07', emptyLog());
    await db.putWeight(alice, '2026-08-07', { kg: 79 });

    const dump = await db.exportAll(alice);
    const sortKeys = dump.map((item) => item['sk']);
    expect(sortKeys).toContain('PROFILE');
    expect(sortKeys).toContain('LOG#2026-08-07');
    expect(sortKeys).toContain('WEIGHT#2026-08-07');
  });

  it('exports nothing for a user with no data', async () => {
    expect(await store().exportAll(bob as UserId)).toEqual([]);
  });
});
