import { useEffect, useState } from 'react';

/**
 * A clock that ticks while the app is open.
 *
 * The Now tab is built on the current time — which meal slot it is, where the
 * marker sits on the DayStrip, whether the movement window is open — so a static
 * timestamp taken at mount goes wrong within the hour. Thirty seconds is fine
 * enough for a timeline whose smallest unit is a meal.
 *
 * It also carries the app across midnight: callers derive the date from this, and
 * the day's log follows.
 */
export function useClock(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
