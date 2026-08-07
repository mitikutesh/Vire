import { SLOTS, WATER, exerciseFor } from '@/content/plan';
import type {
  DailyLog,
  DayPlan,
  KcalEntry,
  SlotEntry,
  SlotKey,
  Swap,
  WeekdayIndex,
} from './schema';

export const emptyLog = (): DailyLog => ({ m: {}, water: 0, ex: false, exx: [], extra: [] });

/** The user ate something instead of the planned meal. */
export const isSwap = (entry: SlotEntry | undefined): entry is Swap =>
  typeof entry === 'object' && entry !== null;

/** The slot is accounted for — either as planned or swapped. */
export const isEaten = (entry: SlotEntry | undefined): boolean => Boolean(entry);

/**
 * Calories credited to one slot.
 *
 * A swap *replaces* the planned meal's calories rather than adding to them —
 * that distinction is the whole point of the swap flow, and confusing it with
 * "ate something extra" would silently inflate the day (see today.extraHelp).
 */
export function slotKcal(log: DailyLog, day: DayPlan, slot: SlotKey): number {
  const entry = log.m[slot];
  if (!entry) return 0;
  return isSwap(entry) ? entry.k : day[slot].k;
}

const sumKcal = (entries: readonly KcalEntry[]): number =>
  entries.reduce((total, entry) => total + entry.k, 0);

/** Everything eaten today: the five slots plus anything logged on top. */
export function eatenKcal(log: DailyLog, day: DayPlan): number {
  const meals = SLOTS.reduce((total, slot) => total + slotKcal(log, day, slot), 0);
  return meals + sumKcal(log.extra);
}

/** Movement burned today: the planned session if done, plus quick-adds. */
export function burnedKcal(log: DailyLog, wd: WeekdayIndex): number {
  const planned = log.ex ? exerciseFor(wd).k : 0;
  return planned + sumKcal(log.exx);
}

/**
 * Calories still available. Movement adds back to the budget, matching the
 * prototype: this is a household weight-loss tool, not an athletic model.
 * Negative means over budget — the UI switches to berry and says "over".
 */
export function remainingKcal(
  log: DailyLog,
  day: DayPlan,
  wd: WeekdayIndex,
  target: number,
): number {
  return target - eatenKcal(log, day) + burnedKcal(log, wd);
}

/** The water goal in glasses. Stored in ml, drunk in glasses; never below 4. */
export function waterGoalGlasses(waterMl: number): number {
  return Math.max(WATER.minGlasses, Math.round(waterMl / WATER.glassMl));
}

/** First name only — the greeting should read like a person, not a form field. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}
