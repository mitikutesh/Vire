import type { WeekdayIndex } from './constants';
import type { StoredPlan } from './schema';

/**
 * The plan-generation stream contract.
 *
 * Generation takes ~30 s, so `POST /plan/generate` streams its progress rather
 * than making the user watch a spinner. The event shapes live here, in the
 * domain, because both ends need them: the route builds them and the plan gate
 * renders them, and a contract with two declarations is a contract that drifts.
 *
 * No Zod: this module is imported by browser code, and pulling the schema
 * library in for four object shapes costs more than hand-checking them.
 */

/**
 * How one day of a run is doing.
 *
 * `wait` never crosses the wire — it is the client's initial state for a day the
 * server has not spoken about yet, which is what makes the seven rows fill in
 * rather than appear all at once.
 */
export type DayState = 'wait' | 'run' | 'done' | 'fail';

/** The states the server actually reports. */
export type ReportedDayState = Exclude<DayState, 'wait'>;

export type PlanStreamEvent =
  | { type: 'day'; day: WeekdayIndex; state: ReportedDayState }
  | { type: 'plan'; plan: StoredPlan }
  /** At least one day never came back; nothing was stored. */
  | { type: 'error'; error: 'partial'; failedDays: number[] }
  /** Every day generated, but the write failed. */
  | { type: 'error'; error: 'not_saved' };

/**
 * Split an accumulating buffer into complete SSE frames.
 *
 * Chunk boundaries have nothing to do with frame boundaries, so a half-received
 * frame has to stay in `rest` until the remainder arrives — parsing it early is
 * how streaming clients end up reporting phantom failures under load.
 */
export function takeFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split('\n\n');
  // The last part is either empty (the buffer ended on a boundary) or partial.
  const rest = parts.pop() ?? '';
  return { frames: parts.filter((part) => part.trim().length > 0), rest };
}

/** The `data:` payload of one frame; SSE allows it to span several lines. */
export function dataOf(frame: string): string {
  return frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('');
}

const isWeekday = (value: unknown): value is WeekdayIndex =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;

const isDayState = (value: unknown): value is ReportedDayState =>
  value === 'run' || value === 'done' || value === 'fail';

/**
 * Parse one frame's payload.
 *
 * Returns null for anything unrecognised rather than throwing. A browser can
 * hold a cached bundle for weeks, so an older client will meet a newer server:
 * ignoring an event it does not know beats failing the generation it is in the
 * middle of.
 */
export function parsePlanEvent(data: string): PlanStreamEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const event = parsed as Record<string, unknown>;

  if (event['type'] === 'day' && isWeekday(event['day']) && isDayState(event['state'])) {
    return { type: 'day', day: event['day'], state: event['state'] };
  }

  if (event['type'] === 'plan' && isPlan(event['plan'])) {
    return { type: 'plan', plan: event['plan'] };
  }

  if (event['type'] === 'error') {
    if (event['error'] === 'partial') {
      const days = event['failedDays'];
      return { type: 'error', error: 'partial', failedDays: Array.isArray(days) ? days : [] };
    }
    if (event['error'] === 'not_saved') return { type: 'error', error: 'not_saved' };
  }

  return null;
}

/**
 * Enough of a shape check to know the payload is a week and not an error page.
 * The server validates against the schema before storing; this only guards
 * against rendering something that would throw inside a view.
 */
function isPlan(value: unknown): value is StoredPlan {
  if (typeof value !== 'object' || value === null) return false;
  const plan = value as Record<string, unknown>;
  return (
    plan['v'] === 1 &&
    typeof plan['planId'] === 'string' &&
    Array.isArray(plan['days']) &&
    plan['days'].length === 7 &&
    Array.isArray(plan['groc'])
  );
}
