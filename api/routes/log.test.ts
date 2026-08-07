// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyLog } from '@/domain/log';
import type { DailyLog } from '@/domain/schema';
import { UnauthorizedError, userIdFromClaims, type VerifiedClaims } from '../auth/identity';
import type { TokenVerifier } from '../auth/verifier';
import { MemoryStore } from '../db/memory-store';
import { ValidatingStore } from '../db/validating-store';
import { ADHERENCE_DAYS, logRoutes } from './log';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const DATE = '2026-08-08';

const verifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedClaims> {
    const sub = token.startsWith('token-') ? token.slice('token-'.length) : '';
    if (!sub) throw new UnauthorizedError('Invalid token');
    return { sub };
  },
};

function setup() {
  const store = new ValidatingStore(new MemoryStore());
  const app = logRoutes({ store, verifier });

  const get = (date = DATE, sub = ALICE) =>
    app.request(`/log/${date}`, { headers: { authorization: `Bearer token-${sub}` } });

  const put = (log: unknown, date = DATE, sub = ALICE) =>
    app.request(`/log/${date}`, {
      method: 'PUT',
      headers: { authorization: `Bearer token-${sub}`, 'content-type': 'application/json' },
      body: JSON.stringify(log),
    });

  const listLogs = (sub = ALICE) =>
    app.request('/logs', { headers: { authorization: `Bearer token-${sub}` } });

  return { app, store, get, put, listLogs };
}

const LOGGED: DailyLog = {
  ...emptyLog(),
  m: { b: true, l: { n: 'Ate out', k: 620 } },
  water: 5,
  ex: true,
};

describe('GET /log/:date', () => {
  it('reports an unlogged day as null rather than an error', async () => {
    // Most days start unlogged; treating that as a failure would put an error
    // state on the main screen every morning.
    const { get } = setup();
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it('returns what was stored', async () => {
    const { get, put } = setup();
    await put(LOGGED);
    expect(await (await get()).json()).toMatchObject({ water: 5, ex: true });
  });
});

describe('PUT /log/:date', () => {
  it('stores a log and echoes the parsed version', async () => {
    // Echoing the parsed log, not the request body, is what lets the client's
    // optimistic copy converge on the defaults the schema filled in.
    const { put } = setup();
    const response = await put({ m: { b: true }, water: 3 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      m: { b: true },
      water: 3,
      ex: false,
      exx: [],
      extra: [],
    });
  });

  it('keeps a swap’s calories, not just the fact of it', async () => {
    const { get, put } = setup();
    await put({ ...emptyLog(), m: { d: { n: 'Pizza', k: 900 } } });
    const stored = (await (await get()).json()) as DailyLog;
    expect(stored.m.d).toEqual({ n: 'Pizza', k: 900 });
  });

  it('rejects a log that is not one', async () => {
    const { put } = setup();
    const response = await put({ water: -1 });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: 'invalid_log' });
  });

  it('rejects a body that is not JSON', async () => {
    const { app } = setup();
    const response = await app.request(`/log/${DATE}`, {
      method: 'PUT',
      headers: { authorization: `Bearer token-${ALICE}`, 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(response.status).toBe(400);
  });
});

describe('the date', () => {
  it('refuses a date that is not a real day', async () => {
    // The log is stored under whatever the client sends, so a nonsense key would
    // sit in the table forever.
    const { get, put } = setup();
    for (const date of ['2026-02-31', '2026-13-01', 'today', '2026-8-8', '20260808']) {
      expect((await get(date)).status).toBe(400);
      expect((await put(LOGGED, date)).status).toBe(400);
    }
  });

  it('accepts a leap day that exists and refuses one that does not', async () => {
    const { put } = setup();
    expect((await put(LOGGED, '2028-02-29')).status).toBe(200);
    expect((await put(LOGGED, '2026-02-29')).status).toBe(400);
  });

  it('keeps each date separate', async () => {
    // Logging dinner at 23:30 must not land on tomorrow, which is why the client
    // sends its own local date.
    const { get, put } = setup();
    await put({ ...emptyLog(), water: 2 }, '2026-08-08');
    await put({ ...emptyLog(), water: 7 }, '2026-08-09');
    expect(await (await get('2026-08-08')).json()).toMatchObject({ water: 2 });
    expect(await (await get('2026-08-09')).json()).toMatchObject({ water: 7 });
  });
});

describe('authorization', () => {
  it('refuses an unauthenticated request', async () => {
    const { app } = setup();
    expect((await app.request(`/log/${DATE}`)).status).toBe(401);
    expect((await app.request(`/log/${DATE}`, { method: 'PUT', body: '{}' })).status).toBe(401);
  });

  it('keeps one user’s log out of another’s reach', async () => {
    const { get, put, store } = setup();
    await put(LOGGED);

    expect(await (await get(DATE, BOB)).json()).toBeNull();
    // And the store agrees: the partition came from the token, not the request.
    expect(await store.getLog(userIdFromClaims({ sub: BOB }), DATE)).toBeNull();
    expect(await store.getLog(userIdFromClaims({ sub: ALICE }), DATE)).not.toBeNull();
  });
});

describe('GET /logs', () => {
  it('starts empty', async () => {
    const { listLogs } = setup();
    expect(await (await listLogs()).json()).toEqual([]);
  });

  it('returns the recent days, newest first', async () => {
    const { put, listLogs } = setup();
    await put({ ...emptyLog(), water: 1 }, '2026-08-06');
    await put({ ...emptyLog(), water: 2 }, '2026-08-07');
    await put({ ...emptyLog(), water: 3 }, '2026-08-08');

    const days = (await (await listLogs()).json()) as { date: string }[];
    expect(days.map((d) => d.date)).toEqual(['2026-08-08', '2026-08-07', '2026-08-06']);
  });

  it('caps the window rather than taking a limit from the caller', async () => {
    // One caller, one question. An open limit is a way to ask for the whole
    // history in a single request.
    const { put, listLogs } = setup();
    for (let i = 1; i <= ADHERENCE_DAYS + 3; i += 1) {
      await put(emptyLog(), `2026-08-${String(i).padStart(2, '0')}`);
    }
    const days = (await (await listLogs()).json()) as unknown[];
    expect(days).toHaveLength(ADHERENCE_DAYS);
  });

  it('refuses an unauthenticated request', async () => {
    const { app } = setup();
    expect((await app.request('/logs')).status).toBe(401);
  });

  it('keeps one user’s days out of another’s reach', async () => {
    const { put, listLogs } = setup();
    await put(LOGGED);
    expect(await (await listLogs(BOB)).json()).toEqual([]);
  });
});
