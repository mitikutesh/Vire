// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { starterPlan } from '@/content/starter-plan';
import type { WeekdayIndex } from '@/domain/constants';
import type { ReportedDayState } from '@/domain/plan-stream';
import type { StoredPlan } from '@/domain/schema';
import { HttpVireApi } from './http-api';
import { ApiError, PlanGenerationError } from './types';

/**
 * The streaming client, against a stubbed fetch.
 *
 * Node environment on purpose: this exercises ReadableStream and TextDecoder,
 * not the DOM.
 */

const PLAN: StoredPlan = { ...starterPlan(1_700_000_000_000), planId: 'plan-1' };

/** A response body that emits the given strings as separate chunks. */
function sseBody(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

/** Stub fetch with one handler per path. */
function stubFetch(handlers: Record<string, () => Response>) {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace('https://api.test', '');
    const handler = handlers[path];
    if (!handler) throw new Error(`Unexpected request to ${path}`);
    return Promise.resolve(handler());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const api = () => new HttpVireApi('https://api.test', async () => 'token-abc');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generatePlan', () => {
  it('reports each day and resolves with the plan', async () => {
    stubFetch({
      '/plan/generate': () =>
        new Response(
          sseBody([
            frame({ type: 'day', day: 0, state: 'run' }),
            frame({ type: 'day', day: 0, state: 'done' }),
            frame({ type: 'plan', plan: PLAN }),
          ]),
          { status: 200 },
        ),
    });

    const seen: [WeekdayIndex, ReportedDayState][] = [];
    const plan = await api().generatePlan((day, state) => seen.push([day, state]));

    expect(seen).toEqual([
      [0, 'run'],
      [0, 'done'],
    ]);
    expect(plan.planId).toBe('plan-1');
  });

  it('reports days that arrive split across chunks', async () => {
    // A day event torn in half by a chunk boundary must still be one event, not
    // two dropped ones.
    const whole = frame({ type: 'day', day: 4, state: 'done' });
    stubFetch({
      '/plan/generate': () =>
        new Response(
          sseBody([whole.slice(0, 12), whole.slice(12), frame({ type: 'plan', plan: PLAN })]),
          { status: 200 },
        ),
    });

    const seen: WeekdayIndex[] = [];
    await api().generatePlan((day) => seen.push(day));
    expect(seen).toEqual([4]);
  });

  it('raises the failed days when the week came back short', async () => {
    stubFetch({
      '/plan/generate': () =>
        new Response(sseBody([frame({ type: 'error', error: 'partial', failedDays: [2, 5] })]), {
          status: 200,
        }),
    });

    const error = await api()
      .generatePlan(() => {})
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PlanGenerationError);
    expect((error as PlanGenerationError).reason).toBe('partial');
    expect((error as PlanGenerationError).failedDays).toEqual([2, 5]);
  });

  it('distinguishes a failed write from failed meals', async () => {
    // Different advice: a failed write is worth retrying at once, a bad week is not.
    stubFetch({
      '/plan/generate': () =>
        new Response(sseBody([frame({ type: 'error', error: 'not_saved' })]), { status: 200 }),
    });
    await expect(api().generatePlan(() => {})).rejects.toMatchObject({ reason: 'not_saved' });
  });

  it('adopts a plan that was stored before the stream dropped', async () => {
    // The expensive failure: the week generated and saved, then the connection
    // died before the final event. Asking costs one GET; not asking costs the
    // user another 30 seconds and another slice of the daily allowance.
    const fetchMock = stubFetch({
      '/plan/generate': () =>
        new Response(sseBody([frame({ type: 'day', day: 0, state: 'done' })]), { status: 200 }),
      '/plan': () => new Response(JSON.stringify(PLAN), { status: 200 }),
    });

    const plan = await api().generatePlan(() => {});
    expect(plan.planId).toBe('plan-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a dropped stream when nothing was stored', async () => {
    stubFetch({
      '/plan/generate': () => new Response(sseBody([]), { status: 200 }),
      '/plan': () => new Response(JSON.stringify({ error: 'no_plan' }), { status: 404 }),
    });
    await expect(api().generatePlan(() => {})).rejects.toMatchObject({ reason: 'dropped' });
  });

  it('surfaces a refusal as a status, not a stream failure', async () => {
    // The rate limit and the missing profile are decided before the stream opens.
    stubFetch({
      '/plan/generate': () =>
        new Response(JSON.stringify({ error: 'rate_limited', limit: 10 }), { status: 429 }),
    });

    const error = await api()
      .generatePlan(() => {})
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).message).toBe('rate_limited');
  });
});

describe('getPlan', () => {
  it('reads no plan as null, which is what shows the gate', async () => {
    stubFetch({ '/plan': () => new Response('{"error":"no_plan"}', { status: 404 }) });
    expect(await api().getPlan()).toBeNull();
  });
});

describe('adoptStarterPlan', () => {
  it('returns the stored starter week', async () => {
    stubFetch({
      '/plan/starter': () =>
        new Response(JSON.stringify({ ...PLAN, starter: true }), { status: 200 }),
    });
    const plan = await api().adoptStarterPlan();
    expect(plan.starter).toBe(true);
  });
});
