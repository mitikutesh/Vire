import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateKey } from '@/domain/clock';
import { useClock } from './useClock';

describe('useClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at the current time', () => {
    vi.setSystemTime(new Date('2026-08-10T08:30:00'));
    const { result } = renderHook(() => useClock());
    expect(result.current.getHours()).toBe(8);
  });

  it('moves on its own, so the Now tab does not go stale', () => {
    // Which meal slot it is, where the marker sits on the DayStrip and whether
    // the movement window is open all derive from this.
    vi.setSystemTime(new Date('2026-08-10T08:59:45'));
    const { result } = renderHook(() => useClock());

    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.getHours()).toBe(9);
  });

  it('crosses midnight into the next day', () => {
    // What makes the app follow the day: callers derive the date from this, and
    // the log query key follows.
    vi.setSystemTime(new Date('2026-08-10T23:59:45'));
    const { result } = renderHook(() => useClock());
    expect(dateKey(result.current)).toBe('2026-08-10');

    act(() => vi.advanceTimersByTime(30_000));
    expect(dateKey(result.current)).toBe('2026-08-11');
  });

  it('stops ticking when unmounted', () => {
    const { unmount } = renderHook(() => useClock());
    unmount();
    // Nothing left behind to fire into a torn-down component.
    expect(vi.getTimerCount()).toBe(0);
  });
});
