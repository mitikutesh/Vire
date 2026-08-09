import { DAY_STRIP, PREP } from '@/content/plan';
import type { DayPlan, Meal, PrepStage, SlotKey, WeekdayIndex } from './schema';
import { addDays, dateKey, weekdayIdx } from './clock';

/**
 * When to start cooking (E7.7 / E7.8).
 *
 * The whole feature in one idea: a prep stage is a **window**, not a moment. It
 * may begin anywhere between `serve − leadMax` and `serve − lead`, and this
 * module picks a point inside that window. It never moves a stage outside it.
 *
 * That is a correction, not the original design. The first version computed one
 * ideal instant and clamped it into waking hours when it landed at night, which
 * broke in two ways:
 *
 *  1. **It contradicted itself.** "Never move later, or the food is late" fails
 *     for any lead longer than serve-minus-last-night: a 24 h brine for a 12:00
 *     lunch ideally starts at noon the day before, and clamping it to 21:30 that
 *     evening is 9.5 hours *later*, quietly cutting the brine to 14.5 h.
 *  2. **It fired instructions written for another hour.** "Cook the potatoes for
 *     tomorrow's salad" is fine 90 minutes ahead and dangerous overnight, and no
 *     amount of reframing the notification fixes the sentence.
 *
 * With windows both disappear: the model states how far a stage stretches and
 * guarantees the text holds across it (see `PREP_RULE` in api/ai/prompts.ts), so
 * anywhere inside is safe by construction and nothing needs clamping.
 */

/** A stage placed on the clock, ready to render or schedule. */
export interface PlacedPrep {
  slot: SlotKey;
  /** Which day's meal this belongs to, so the card can say "tomorrow's lunch". */
  weekday: WeekdayIndex;
  mealName: string;
  stage: PrepStage;
  /** When to start. Local wall-clock instant in the user's zone. */
  start: Date;
  /** True when `start` is the evening before the meal rather than the same day. */
  tonight: boolean;
}

/** Why a stage produced nothing to show. */
export type PrepPlacement =
  | { kind: 'placed'; at: Date; tonight: boolean }
  /** No instant in the window is inside a waking window. Surfaced at plan time. */
  | { kind: 'unschedulable' }
  /** The window has already closed. The card offers a swap rather than guilt. */
  | { kind: 'passed' };

/** Serving times, from the DayStrip so there is exactly one such table. */
export const serveHour = (slot: SlotKey): number =>
  DAY_STRIP.dots.find((dot) => dot.slot === slot)?.at ?? 12;

/**
 * Round to the nearest 5 minutes.
 *
 * `DAY_STRIP.dots` are chart positions — dinner sits at 18.2 because that is
 * where the dot looks right — so unrounded arithmetic produces "17:12", which
 * reads like a machine wrote it rather than a person choosing a time.
 */
export function roundTo5(date: Date): Date {
  const out = new Date(date);
  out.setSeconds(0, 0);
  out.setMinutes(Math.round(out.getMinutes() / 5) * 5);
  return out;
}

/** Wall-clock hour as a fraction, in the given zone. 13:30 → 13.5. */
export function hourInZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour + minute / 60;
}

/** Is this instant inside the user's waking window, in their own zone? */
export const isAwake = (instant: Date, timeZone: string): boolean => {
  const hour = hourInZone(instant, timeZone);
  return hour >= PREP.wakeFrom && hour <= PREP.wakeUntil;
};

/**
 * Place one stage on the clock.
 *
 * Order matters and encodes the rules:
 *  1. The ideal start (`serve − lead − buffer`) wins whenever the user is awake
 *     for it.
 *  2. Otherwise walk back through the window for the latest waking instant. In
 *     practice that lands in the previous evening, which is exactly the owner's
 *     "tell me tonight about tomorrow's lunch".
 *  3. A window with no waking instant is unschedulable — reported, never fired.
 *     E7.7's prompt rule and parse clamp make this rare.
 */
export function placeStage(
  stage: PrepStage,
  serve: Date,
  now: Date,
  timeZone: string,
  bufferMin: number,
): PrepPlacement {
  const minus = (minutes: number) => new Date(serve.getTime() - minutes * 60_000);

  // The safe window. `latest` is the last moment the food still comes out on
  // time; `earliest` is the furthest ahead the stage stays good.
  const latest = minus(stage.lead);
  const earliest = minus(stage.leadMax ?? stage.lead);

  // The buffer is slack the user asked for, so it shifts the start earlier —
  // but only as far as the window already allows. A rigid stage has no room for
  // it, and inventing some would mean starting the stage before it is safe to.
  const preferred = new Date(Math.max(earliest.getTime(), minus(stage.lead + bufferMin).getTime()));

  // Prefer the slack; otherwise take the latest waking moment still in the
  // window, which loses buffer but never makes the meal late.
  const candidate = isAwake(preferred, timeZone)
    ? preferred
    : pickWakingInstant(latest, earliest, timeZone);
  if (!candidate) return { kind: 'unschedulable' };
  if (candidate.getTime() < now.getTime()) return { kind: 'passed' };

  const at = roundTo5(candidate);
  return {
    kind: 'placed',
    at,
    // "Tonight" means the start falls on an earlier local date than the meal.
    tonight: dateKey(at) !== dateKey(serve),
  };
}

/**
 * The latest waking instant at or before `ideal`, no earlier than `earliest`.
 *
 * Stepped rather than solved because the answer must respect the user's zone
 * across a DST boundary, where an hour can vanish or repeat. Fifteen-minute
 * steps over a window capped at 24 h is at most 96 checks — cheap, and it cannot
 * produce an instant outside the window, which is the property that matters.
 */
function pickWakingInstant(ideal: Date, earliest: Date, timeZone: string): Date | null {
  const STEP_MS = 15 * 60_000;
  for (let t = ideal.getTime(); t >= earliest.getTime(); t -= STEP_MS) {
    const candidate = new Date(t);
    if (isAwake(candidate, timeZone)) return candidate;
  }
  return null;
}

/**
 * Every stage of one day's meals, placed.
 *
 * Snacks are skipped rather than filtered later: they are assembly-only by
 * schema, and `sanitisePrep` already refuses prep on them, so reading it here
 * would only reintroduce a case that cannot happen.
 */
export function placeDay(
  day: DayPlan,
  weekday: WeekdayIndex,
  serveDate: Date,
  now: Date,
  timeZone: string,
  bufferMin: number,
): { placed: PlacedPrep[]; unschedulable: PlacedPrep[] } {
  const placed: PlacedPrep[] = [];
  const unschedulable: PlacedPrep[] = [];

  for (const slot of ['b', 'l', 'd'] as const) {
    const meal: Meal = day[slot];
    for (const stage of meal.prep ?? []) {
      const serve = atHour(serveDate, serveHour(slot));
      const placement = placeStage(stage, serve, now, timeZone, bufferMin);
      if (placement.kind === 'placed') {
        placed.push({
          slot,
          weekday,
          mealName: meal.n,
          stage,
          start: placement.at,
          tonight: placement.tonight,
        });
      } else if (placement.kind === 'unschedulable') {
        unschedulable.push({
          slot,
          weekday,
          mealName: meal.n,
          stage,
          start: serve,
          tonight: false,
        });
      }
      // 'passed' is deliberately dropped here; the card derives its own
      // too-late state from the meal, where it can offer a swap.
    }
  }
  return { placed, unschedulable };
}

/** A date at a given fractional local hour. */
export function atHour(date: Date, hour: number): Date {
  const out = new Date(date);
  out.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return out;
}

/**
 * What the user should be told about right now.
 *
 * Looks at today and tomorrow, because a head start is by definition something
 * whose meal has not happened yet, and the longest lead the schema allows is
 * 24 hours.
 */
export function headStarts(
  days: readonly DayPlan[],
  now: Date,
  timeZone: string,
  bufferMin: number,
): PlacedPrep[] {
  const out: PlacedPrep[] = [];
  for (const offset of [0, 1]) {
    const serveDate = addDays(now, offset);
    const weekday = weekdayIdx(serveDate);
    const day = days[weekday];
    if (!day) continue;
    out.push(...placeDay(day, weekday, serveDate, now, timeZone, bufferMin).placed);
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * The evening digest: everything to do tonight for tomorrow.
 *
 * This is the primary channel rather than a fallback. One predictable message at
 * a time the user chose beats several alarms at times arithmetic chose, it is
 * computable a day ahead so it survives feed refresh lag, and it structurally
 * cannot land at 04:00. It also matches the temperament the app already commits
 * to by refusing streaks: one nudge, not a stream of them.
 */
export function eveningDigest(
  days: readonly DayPlan[],
  now: Date,
  timeZone: string,
  bufferMin: number,
): PlacedPrep[] {
  return headStarts(days, now, timeZone, bufferMin).filter(
    (item) => item.tonight && dateKey(item.start) === dateKey(now),
  );
}
