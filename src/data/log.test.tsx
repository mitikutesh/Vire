import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryVireApi } from '@/api/memory-api';
import { ApiError, type VireApi } from '@/api/types';
import { emptyLog } from '@/domain/log';
import type { DailyLog } from '@/domain/schema';
import { createQueryClient, queryKeys } from './query';
import { useDailyLog } from './useVireData';

const MONDAY = '2026-08-10';
const TUESDAY = '2026-08-11';

/** No retries: a rollback test should not wait out a retry it did not ask for. */
function harness() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
}

function render(api: VireApi, date = MONDAY) {
  const { wrapper, client } = harness();
  const rendered = renderHook(({ day }: { day: string }) => useDailyLog(api, day), {
    wrapper,
    initialProps: { day: date },
  });
  return { ...rendered, client };
}

/**
 * A save that does not resolve until released, so the window between "the user
 * tapped" and "the server answered" is long enough to make assertions in. That
 * window is the whole subject of this suite.
 */
function heldSave() {
  const stored = new MemoryVireApi();
  let release: (ok: boolean) => void = () => {};
  const gate = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  const api: VireApi = Object.assign(new MemoryVireApi(), {
    saveLog: async (date: string, log: DailyLog) => {
      if (!(await gate)) throw new ApiError(0, 'network');
      return stored.saveLog(date, log);
    },
  });
  return { api, stored, succeed: () => release(true), fail: () => release(false) };
}

describe('reading the day', () => {
  it('starts from an empty log, so the first tap has something to change', async () => {
    const { result } = render(new MemoryVireApi());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.log).toEqual(emptyLog());
  });

  it('loads what was stored for that date', async () => {
    const api = new MemoryVireApi();
    await api.saveLog(MONDAY, { ...emptyLog(), water: 4 });

    const { result } = render(api);
    await waitFor(() => expect(result.current.log.water).toBe(4));
  });

  it('follows the date across midnight', async () => {
    // The AC's rollover case: the app is open when the day changes, so the key
    // changes and the new day's log loads on its own.
    const api = new MemoryVireApi();
    await api.saveLog(MONDAY, { ...emptyLog(), water: 6 });
    await api.saveLog(TUESDAY, { ...emptyLog(), water: 1 });

    const { result, rerender } = render(api);
    await waitFor(() => expect(result.current.log.water).toBe(6));

    rerender({ day: TUESDAY });
    await waitFor(() => expect(result.current.log.water).toBe(1));
  });
});

describe('writing', () => {
  it('shows the change while the request is still in flight', async () => {
    // The definition of optimistic, and not something a write-then-refetch
    // implementation could pass.
    const { api, stored, succeed } = heldSave();
    const { result } = render(api);
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.update((prev) => ({ ...prev, water: 3 })));
    await waitFor(() => expect(result.current.log.water).toBe(3));
    expect(await stored.getLog(MONDAY)).toBeNull(); // nothing saved yet

    succeed();
    await waitFor(async () => expect((await stored.getLog(MONDAY))?.water).toBe(3));
  });

  it('writes the cache synchronously, so the tap owes nothing to a render', async () => {
    // The cache is what the next tap reads; if it lagged, taps would compound
    // onto stale values.
    const { api, succeed } = heldSave();
    const { result, client } = render(api);
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.update((prev) => ({ ...prev, water: 2 })));
    expect(client.getQueryData<DailyLog>(queryKeys.log(MONDAY))?.water).toBe(2);
    succeed();
  });

  it('does not lose the first of two taps in the same frame', async () => {
    // Both changes read the cache rather than a captured render value, so the
    // second is computed from the first instead of erasing it.
    const { api, succeed } = heldSave();
    const { result } = render(api);
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.update((prev) => ({ ...prev, water: prev.water + 1 }));
      result.current.update((prev) => ({ ...prev, m: { ...prev.m, b: true } }));
    });

    await waitFor(() => expect(result.current.log.m.b).toBe(true));
    expect(result.current.log.water).toBe(1);
    succeed();
  });

  it('converges on the server’s parsed copy', async () => {
    // The schema fills defaults; the client should end up holding those rather
    // than its own partial guess.
    const api = new MemoryVireApi();
    const { result } = render(api);
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.update(() => ({ m: { b: true }, water: 2 }) as DailyLog));
    await waitFor(() =>
      expect(result.current.log).toEqual({
        m: { b: true },
        water: 2,
        ex: false,
        exx: [],
        extra: [],
      }),
    );
  });
});

describe('a write that fails', () => {
  it('puts the previous log back rather than leaving a lie on screen', async () => {
    const { api, fail } = heldSave();
    const { result } = render(api);
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.update((prev) => ({ ...prev, water: 5 })));
    await waitFor(() => expect(result.current.log.water).toBe(5));

    fail();
    await waitFor(() => expect(result.current.saveFailed).toBe(true));
    // Rolled back: a tap that silently did nothing is worse than one that
    // visibly failed, which is what the toast is for.
    expect(result.current.log.water).toBe(0);
  });

  it('rolls back to what was there before, not to empty', async () => {
    const { api, fail } = heldSave();
    const withHistory: VireApi = Object.assign(api, {
      getLog: async () => ({ ...emptyLog(), water: 4 }),
    });
    const { result } = render(withHistory);
    await waitFor(() => expect(result.current.log.water).toBe(4));

    act(() => result.current.update((prev) => ({ ...prev, water: 9 })));
    await waitFor(() => expect(result.current.log.water).toBe(9));

    fail();
    await waitFor(() => expect(result.current.saveFailed).toBe(true));
    expect(result.current.log.water).toBe(4);
  });

  it('clears the failure when dismissed', async () => {
    const { api, fail } = heldSave();
    const { result } = render(api);
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.update((prev) => ({ ...prev, water: 1 })));
    fail();
    await waitFor(() => expect(result.current.saveFailed).toBe(true));

    act(() => result.current.dismissSaveError());
    await waitFor(() => expect(result.current.saveFailed).toBe(false));
  });

  it('logs the failure, so a CORS or URL mistake is findable', async () => {
    // The user only sees "that didn't save", which hides the actual cause.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api, fail } = heldSave();
    const { result } = render(api);
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.update((prev) => ({ ...prev, water: 1 })));
    fail();
    await waitFor(() => expect(logged).toHaveBeenCalled());
    logged.mockRestore();
  });
});
