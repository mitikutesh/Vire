// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { planSchema, type Profile } from '@/domain/schema';
import { grocId } from '@/domain/groc-id';
import { UnauthorizedError, type VerifiedClaims } from '../auth/identity';
import type { TokenVerifier } from '../auth/verifier';
import { MemoryStore } from '../db/memory-store';
import { ValidatingStore } from '../db/validating-store';
import { starterPlan } from '@/content/starter-plan';
import { VALID_DAY } from '../ai/fixtures';
import { AiOutputError, type AiProvider } from '../ai/types';
import { WEEKDAYS } from '@/domain/constants';
import { GENERATE_LIMIT_PER_DAY, PLAN_DRAFT_TTL_MS, draftFingerprint, planRoutes } from './plan';

/** Days in a generated week; the allowance is counted in provider calls. */
const WEEK_LENGTH = WEEKDAYS.length;

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

/** Accepts `token-<sub>`; the route is responsible for stripping "Bearer ". */
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

/** A provider that always returns the fixture day. */
const okProvider = (): AiProvider => ({
  name: 'fake',
  model: 'fake-1',
  generateDay: vi.fn().mockResolvedValue(VALID_DAY),
  scanOffers: vi.fn(),
});

/** Fails the given weekday `failures` times, then succeeds. */
function flakyProvider(weekday: number, failures: number): AiProvider {
  let seen = 0;
  return {
    name: 'fake',
    model: 'fake-1',
    generateDay: vi.fn(async (config: { weekday: number }) => {
      if (config.weekday !== weekday) return VALID_DAY;
      seen += 1;
      if (seen <= failures) throw new AiOutputError(`Day ${weekday} failed validation`);
      return VALID_DAY;
    }),
    scanOffers: vi.fn(),
  } as unknown as AiProvider;
}

async function setup(options: { provider?: AiProvider | null; profile?: Profile | null } = {}) {
  const store = new ValidatingStore(new MemoryStore());
  // `null` models a user who has not set an AI key (E7.6).
  const provider = options.provider === null ? null : (options.provider ?? okProvider());
  const profile = options.profile === undefined ? PROFILE : options.profile;

  const app = planRoutes({
    store,
    verifier,
    providerFor: async () => provider,
    now: () => new Date('2026-08-08T10:00:00Z'),
    // No backoff in tests; the delay itself is not what the retry tests assert.
    retryDelayMs: 0,
    rateLimitDelayMs: 0,
  });

  if (profile) {
    // Written straight to the store; the profile route has its own tests.
    await store.putProfile(
      (await import('../auth/identity')).userIdFromClaims({ sub: ALICE }),
      profile,
    );
  }

  const generate = (token = `token-${ALICE}`) =>
    app.request('/plan/generate', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });

  return { app, store, provider: provider as AiProvider, generate };
}

/**
 * Drive a generation to completion.
 *
 * The stream handler runs *while its body is read*, so a test that never
 * consumes the response asserts against a route that has not finished — and a
 * "nothing was written" assertion passes for the wrong reason.
 */
async function drain(response: Response): Promise<void> {
  await response.text();
}

/** Collect the JSON payloads out of an SSE response body. */
async function sseEvents(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice('data:'.length).trim()) as Record<string, unknown>);
}

describe('POST /plan/generate', () => {
  it('generates all seven days and stores the plan', async () => {
    const { generate, store } = await setup();
    const events = await sseEvents(await generate());

    const done = events.filter((e) => e['type'] === 'day' && e['state'] === 'done');
    expect(done).toHaveLength(7);

    const final = events.find((e) => e['type'] === 'plan');
    expect(final).toBeDefined();

    const userId = (await import('../auth/identity')).userIdFromClaims({ sub: ALICE });
    const stored = await store.getActivePlan(userId);
    expect(stored?.days).toHaveLength(7);
    expect(stored?.starter).toBe(false);
  });

  it('produces a plan that validates against the schema', async () => {
    // A stored plan that fails validation would be a week the app cannot render.
    const { generate } = await setup();
    const events = await sseEvents(await generate());
    const plan = events.find((e) => e['type'] === 'plan')?.['plan'];
    const { planId: _planId, ...rest } = plan as { planId: string };
    expect(planSchema.safeParse(rest).success).toBe(true);
  });

  it('reports each day as it lands, so the gate is not a blank spinner', async () => {
    const { generate } = await setup();
    const events = await sseEvents(await generate());

    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      expect(events).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'day', day, state: 'run' })]),
      );
    }
  });

  it('passes each day its own weekday, so the week has variety', async () => {
    const { generate, provider } = await setup();
    await sseEvents(await generate());

    const weekdays = (provider.generateDay as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as { weekday: number }).weekday,
    );
    expect([...weekdays].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('passes the profile’s allergies and target through to the provider', async () => {
    // Guardrail 3 is only real if the allergy text actually reaches the prompt.
    const { generate, provider } = await setup();
    await sseEvents(await generate());

    const config = (provider.generateDay as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(config['allergies']).toBe('peanuts');
    expect(config['target']).toBe(1600);
    expect(config['sex']).toBe('f');
  });

  it('aggregates the week’s ingredients into one grocery list', async () => {
    const { generate } = await setup();
    const events = await sseEvents(await generate());
    const plan = events.find((e) => e['type'] === 'plan')?.['plan'] as { groc: { id: string }[] };

    expect(plan.groc.length).toBeGreaterThan(0);
    // Content-stable ids, produced in one place, so offer badges cannot migrate.
    expect(plan.groc.map((item) => item.id)).toContain(grocId('lohifilee'));
  });

  it('drops the generation-only items field from the stored days', async () => {
    const { generate } = await setup();
    const events = await sseEvents(await generate());
    const plan = events.find((e) => e['type'] === 'plan')?.['plan'] as {
      days: Record<string, unknown>[];
    };
    expect(plan.days[0]).not.toHaveProperty('items');
  });
});

describe('per-day retry (I2)', () => {
  it('retries only the failing day', async () => {
    // The prototype threw away the whole week when one day came back malformed.
    const provider = flakyProvider(3, 1);
    const { generate } = await setup({ provider });
    const events = await sseEvents(await generate());

    expect(events.filter((e) => e['state'] === 'done')).toHaveLength(7);
    // Eight calls for seven days: the one retry, not a second full week.
    expect((provider.generateDay as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(8);
  });

  it('does not report a transient failure the retry recovered from', async () => {
    const { generate } = await setup({ provider: flakyProvider(2, 1) });
    const events = await sseEvents(await generate());
    expect(events.filter((e) => e['state'] === 'fail')).toHaveLength(0);
  });

  it('gives up on a day that keeps failing, and names it', async () => {
    const { generate } = await setup({ provider: flakyProvider(5, 99) });
    const events = await sseEvents(await generate());

    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'day', day: 5, state: 'fail' })]),
    );
    const error = events.find((e) => e['type'] === 'error');
    expect(error?.['error']).toBe('partial');
    expect(error?.['failedDays']).toEqual([5]);
  });

  it('stores nothing when a day is missing', async () => {
    // A week with a day of no food is worse than no week: the starter plan is one
    // tap away, and a half-plan cannot be followed.
    const { generate, store } = await setup({ provider: flakyProvider(0, 99) });
    await sseEvents(await generate());

    const userId = (await import('../auth/identity')).userIdFromClaims({ sub: ALICE });
    expect(await store.getActivePlan(userId)).toBeNull();
  });
});

describe('resuming a failed run (E2.1)', () => {
  /** A provider whose failing days can be changed between requests. */
  function controllable() {
    const failing = new Set<number>();
    const calls: number[] = [];
    const provider = {
      name: 'fake',
      model: 'fake-1',
      generateDay: vi.fn(async (config: { weekday: number; avoid?: readonly string[] }) => {
        calls.push(config.weekday);
        if (failing.has(config.weekday)) throw new AiOutputError('bad output');
        return VALID_DAY;
      }),
      scanOffers: vi.fn(),
    } as unknown as AiProvider;
    return { provider, failing, calls };
  }

  const aliceId = async () => (await import('../auth/identity')).userIdFromClaims({ sub: ALICE });

  it('regenerates only the day that failed', async () => {
    // The whole point: the user pays per provider call, so a week that lost one
    // day must cost one call to finish, not seven.
    const { provider, failing, calls } = controllable();
    const { generate, store } = await setup({ provider });

    failing.add(3);
    const first = await sseEvents(await generate());
    expect(first.at(-1)).toMatchObject({ type: 'error', error: 'partial', failedDays: [3] });

    failing.clear();
    calls.length = 0;
    const second = await sseEvents(await generate());

    expect(calls).toEqual([3]);
    expect(second.find((e) => e['type'] === 'plan')).toBeDefined();
    expect((await store.getActivePlan(await aliceId()))?.days).toHaveLength(7);
  });

  it('reports the carried days as done, so the gate is not seven blank rows', async () => {
    const { provider, failing } = controllable();
    const { generate } = await setup({ provider });

    failing.add(3);
    await drain(await generate());
    failing.clear();

    const events = await sseEvents(await generate());
    const done = events.filter((e) => e['type'] === 'day' && e['state'] === 'done');
    expect(done).toHaveLength(7);
    // The six carried days are announced before the one still being generated.
    expect(events[0]).toMatchObject({ type: 'day', day: 0, state: 'done' });
  });

  it('discards the draft when the allergies changed underneath it', async () => {
    // Health guardrail 3. Days generated before an allergen was added were asked
    // to exclude a different list, so reusing them could put it back on the plate.
    const { provider, failing, calls } = controllable();
    const { generate, store } = await setup({ provider });

    failing.add(3);
    await drain(await generate());

    await store.putProfile(await aliceId(), { ...PROFILE, allergies: 'peanuts, shellfish' });
    failing.clear();
    calls.length = 0;
    await drain(await generate());

    expect([...calls].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('discards a draft that changed the calorie target', async () => {
    const { provider, failing, calls } = controllable();
    const { generate, store } = await setup({ provider });

    failing.add(3);
    await drain(await generate());

    await store.putProfile(await aliceId(), { ...PROFILE, target: 1800 });
    failing.clear();
    calls.length = 0;
    await drain(await generate());

    expect(calls).toHaveLength(7);
  });

  it('does not resume a draft that has gone stale', async () => {
    const { provider, calls } = controllable();
    const { generate, store } = await setup({ provider });

    // Same fingerprint, but older than the window: only the age disqualifies it.
    await store.putPlanDraft(await aliceId(), {
      fp: draftFingerprint(PROFILE),
      created: new Date('2026-08-08T10:00:00Z').getTime() - PLAN_DRAFT_TTL_MS - 1,
      days: WEEKDAYS.map((weekday) => (weekday === 3 ? null : VALID_DAY)),
    });

    await drain(await generate());
    expect(calls).toHaveLength(7);
  });

  it('tells the retried day about the dishes already in the week', async () => {
    // Without this the resumed day can duplicate a dish from the very week it is
    // rejoining, which reads as a broken generator.
    const { provider, failing } = controllable();
    const { generate } = await setup({ provider });

    failing.add(3);
    await drain(await generate());
    failing.clear();
    (provider.generateDay as ReturnType<typeof vi.fn>).mockClear();
    await drain(await generate());

    const [config] = (provider.generateDay as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { weekday: number; avoid?: readonly string[] },
    ];
    expect(config.weekday).toBe(3);
    expect(config.avoid).toContain(VALID_DAY.b.n);
  });

  it('clears the draft once a plan is activated', async () => {
    const { provider, failing } = controllable();
    const { generate, store } = await setup({ provider });

    failing.add(3);
    await drain(await generate());
    expect(await store.getPlanDraft(await aliceId())).not.toBeNull();

    failing.clear();
    await drain(await generate());
    expect(await store.getPlanDraft(await aliceId())).toBeNull();
  });

  it('keeps the whole week when only the save failed, and retries without generating', async () => {
    // Seven provider calls to recover from a database error was the worst case
    // the old behaviour had.
    const { provider, calls } = controllable();
    const { generate, store } = await setup({ provider });

    const activate = vi
      .spyOn(store, 'activatePlan')
      .mockRejectedValueOnce(new Error('dynamo is having a day'));

    const first = await sseEvents(await generate());
    expect(first.at(-1)).toMatchObject({ type: 'error', error: 'not_saved' });
    expect(calls).toHaveLength(7);

    activate.mockRestore();
    calls.length = 0;
    const second = await sseEvents(await generate());

    expect(calls).toEqual([]);
    expect(second.find((e) => e['type'] === 'plan')).toBeDefined();
  });

  it('writes no draft when the very first day of a run fails', async () => {
    // Nothing salvageable: an all-null draft is a row that can only mislead.
    const { provider, failing } = controllable();
    const { generate, store } = await setup({ provider });

    for (const weekday of WEEKDAYS) failing.add(weekday);
    await drain(await generate());

    expect(await store.getPlanDraft(await aliceId())).toBeNull();
  });

  it('charges the allowance per day generated, so resuming is cheap', async () => {
    // If a resume cost a whole week's allowance, ten bad runs would lock the user
    // out for the day having generated almost nothing.
    const { provider, failing } = controllable();
    const { generate, store } = await setup({ provider });
    const bump = vi.spyOn(store, 'bumpRateLimit');

    failing.add(3);
    await drain(await generate());
    failing.clear();
    await drain(await generate());

    expect(bump.mock.calls.map((call) => call[3])).toEqual([WEEK_LENGTH, 1]);
    bump.mockRestore();
  });

  it('spends nothing when there is no day left to generate', async () => {
    const { provider } = controllable();
    const { generate, store } = await setup({ provider });
    vi.spyOn(store, 'activatePlan').mockRejectedValueOnce(new Error('write failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await drain(await generate());
    const bump = vi.spyOn(store, 'bumpRateLimit');
    await drain(await generate());

    // The second attempt only re-saves; charging for it would bill a database
    // error to the user's AI allowance.
    expect(bump).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('reports the failure even when the draft cannot be saved', async () => {
    // The draft is an optimisation; losing it must not cost the user the error
    // message that tells them what to do next.
    const { provider, failing } = controllable();
    const { generate, store } = await setup({ provider });
    vi.spyOn(store, 'putPlanDraft').mockRejectedValue(new Error('write failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    failing.add(3);
    const events = await sseEvents(await generate());
    expect(events.at(-1)).toMatchObject({ type: 'error', error: 'partial' });
    vi.restoreAllMocks();
  });
});

describe('rate limiting', () => {
  it('allows the daily allowance and refuses the next request', async () => {
    // This is the route that spends the owner's AI budget. The allowance is
    // counted in provider calls, so a full week costs seven of it.
    const { generate } = await setup();
    for (let i = 0; i < GENERATE_LIMIT_PER_DAY / WEEK_LENGTH; i += 1) {
      expect((await generate()).status).toBe(200);
    }
    const blocked = await generate();
    expect(blocked.status).toBe(429);
    expect((await blocked.json()) as { error: string }).toMatchObject({ error: 'rate_limited' });
  });

  it('counts per user, so one person cannot exhaust another’s allowance', async () => {
    const { generate, store } = await setup();
    for (let i = 0; i < GENERATE_LIMIT_PER_DAY / WEEK_LENGTH; i += 1) await generate();

    await store.putProfile(
      (await import('../auth/identity')).userIdFromClaims({ sub: BOB }),
      PROFILE,
    );
    expect((await generate(`token-${BOB}`)).status).toBe(200);
  });

  it('does not spend the allowance when there is no profile to generate against', async () => {
    const { generate, store } = await setup({ profile: null });
    expect((await generate()).status).toBe(409);

    const userId = (await import('../auth/identity')).userIdFromClaims({ sub: ALICE });
    // The counter was never touched, so a missing profile costs nothing.
    expect(await store.bumpRateLimit(userId, 'generate', '2026-08-08')).toBe(1);
  });
});

describe('authorization', () => {
  it('refuses an unauthenticated request', async () => {
    const { app } = await setup();
    expect((await app.request('/plan/generate', { method: 'POST' })).status).toBe(401);
    expect((await app.request('/plan')).status).toBe(401);
  });

  it('keeps one user’s plan out of another’s reach', async () => {
    const { generate, app } = await setup();
    await sseEvents(await generate());

    const bobsPlan = await app.request('/plan', {
      headers: { authorization: `Bearer token-${BOB}` },
    });
    expect(bobsPlan.status).toBe(404);
  });
});

describe('GET /plan', () => {
  it('reports no plan yet, which is what shows the plan gate', async () => {
    const { app } = await setup();
    const res = await app.request('/plan', {
      headers: { authorization: `Bearer token-${ALICE}` },
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /plan/starter', () => {
  it('adopts the built-in week without calling a provider', async () => {
    // The offline fallback: no key, no network, no rate limit.
    const { app, provider } = await setup();
    const res = await app.request('/plan/starter', {
      method: 'POST',
      headers: { authorization: `Bearer token-${ALICE}` },
    });

    expect(res.status).toBe(200);
    const plan = (await res.json()) as { starter: boolean; days: unknown[] };
    expect(plan.starter).toBe(true);
    expect(plan.days).toHaveLength(7);
    expect(provider.generateDay).not.toHaveBeenCalled();
  });

  it('replaces a generated plan, clearing its grocery state', async () => {
    const { app, store, generate } = await setup();
    await sseEvents(await generate());

    const userId = (await import('../auth/identity')).userIdFromClaims({ sub: ALICE });
    const generated = await store.getActivePlan(userId);
    await store.putGrocState(userId, generated!.planId, {
      checked: { lohifilee: true },
      store: {},
    });

    await app.request('/plan/starter', {
      method: 'POST',
      headers: { authorization: `Bearer token-${ALICE}` },
    });

    // The old plan's checked boxes are gone with it.
    expect(await store.getGrocState(userId, generated!.planId)).toEqual({
      checked: {},
      store: {},
    });
  });
});

describe('without an AI key (E7.6)', () => {
  it('refuses to generate, since there is no key to generate with', async () => {
    const { generate } = await setup({ provider: null });
    const response = await generate();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'no_ai_key' });
  });

  it('does not spend the daily allowance', async () => {
    // Being unable to generate at all must not cost a slice of the allowance.
    const { generate, store } = await setup({ provider: null });
    await generate();

    const userId = (await import('../auth/identity')).userIdFromClaims({ sub: ALICE });
    expect(await store.bumpRateLimit(userId, 'generate', '2026-08-08')).toBe(1);
  });

  it('still adopts the starter week, which needs no provider', async () => {
    // The whole point of the no-key state: the app works, just without generation.
    const { app } = await setup({ provider: null });
    const response = await app.request('/plan/starter', {
      method: 'POST',
      headers: { authorization: `Bearer token-${ALICE}` },
    });
    expect(response.status).toBe(200);
  });
});

describe('provider refusals (E7.6 follow-up)', () => {
  /** An SDK-shaped error: the classifier reads `status`, as both SDKs set it. */
  const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

  it('gives up immediately on a rejected key, rather than spending the quota', async () => {
    // A 401 will be a 401 however long we wait; retrying spends the user's own
    // allowance on a certainty.
    let calls = 0;
    const provider: AiProvider = {
      name: 'fake',
      model: 'fake-1',
      generateDay: vi.fn(async () => {
        calls += 1;
        throw httpError(401);
      }),
      scanOffers: vi.fn(),
    };
    const { generate } = await setup({ provider });
    await sseEvents(await generate());

    // One attempt per day, not three.
    expect(calls).toBe(7);
  });

  it('retries a rate limit rather than treating it as bad output', async () => {
    // 429 on the first attempt, fine on the second.
    const seen = new Map<number, number>();
    const provider: AiProvider = {
      name: 'fake',
      model: 'fake-1',
      generateDay: vi.fn(async (config: { weekday: number }) => {
        const n = (seen.get(config.weekday) ?? 0) + 1;
        seen.set(config.weekday, n);
        if (n === 1) throw httpError(429);
        return VALID_DAY;
      }),
      scanOffers: vi.fn(),
    } as unknown as AiProvider;

    const { generate } = await setup({ provider });
    const events = await sseEvents(await generate());

    expect(events.filter((e) => e['state'] === 'done')).toHaveLength(7);
    expect(events.find((e) => e['type'] === 'plan')).toBeDefined();
  });

  it('does not fire all seven requests at once', async () => {
    // Seven simultaneous requests is the surest way to trip a personal key's
    // per-minute allowance.
    let inFlight = 0;
    let peak = 0;
    const provider: AiProvider = {
      name: 'fake',
      model: 'fake-1',
      generateDay: vi.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return VALID_DAY;
      }),
      scanOffers: vi.fn(),
    } as unknown as AiProvider;

    const { generate } = await setup({ provider });
    await sseEvents(await generate());

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // still concurrent, just bounded
  });
});

describe('regenerating asks for something new', () => {
  it('sends the current week’s dishes as dishes to avoid', async () => {
    // The regenerate button is only meaningful if the second answer differs from
    // the first.
    const provider = okProvider();
    const { generate, store } = await setup({ provider });

    const userId = (await import('../auth/identity')).userIdFromClaims({ sub: ALICE });
    const existing = await store.activatePlan(userId, starterPlan(1));
    await sseEvents(await generate());

    const config = (provider.generateDay as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      avoid?: string[];
    };
    expect(config.avoid).toContain(existing.days[0].b.n);
  });

  it('sends nothing to avoid on a first generation', async () => {
    const provider = okProvider();
    const { generate } = await setup({ provider });
    await sseEvents(await generate());

    const config = (provider.generateDay as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      avoid?: string[];
    };
    expect(config.avoid).toEqual([]);
  });
});
