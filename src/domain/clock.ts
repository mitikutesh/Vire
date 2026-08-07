import { DAY_STRIP, GREETING_BOUNDS, SLOT_BOUNDS } from '@/content/plan';
import { t } from '@/content/strings';
import type { SlotKey, WeekdayIndex } from './schema';

/** Kitchen closed — before the day starts or after the evening bite. */
export const NIGHT = 'night' as const;
export type NowSlot = SlotKey | typeof NIGHT;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The log key for a date: `YYYY-MM-DD` in the *device's* local time.
 *
 * Deliberately local, not UTC (PLAN §3): a meal eaten at 23:30 belongs to the
 * day the user just lived, and in Helsinki winter a UTC key would file it under
 * tomorrow.
 */
export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Weekday with Monday = 0, because the plan and the shops both start there. */
export const weekdayIdx = (d: Date): WeekdayIndex => ((d.getDay() + 6) % 7) as WeekdayIndex;

/** Hours since midnight as a fraction — 13:30 → 13.5. */
export const hourOf = (d: Date): number => d.getHours() + d.getMinutes() / 60;

/**
 * Which meal is "now". This is what makes the Now tab answer the only question
 * the user actually has when they open the app mid-day.
 */
export function getSlotKey(hour: number): NowSlot {
  if (hour < SLOT_BOUNDS.dayStart) return NIGHT;
  if (hour < SLOT_BOUNDS.breakfastUntil) return 'b';
  if (hour < SLOT_BOUNDS.lunchUntil) return 'l';
  if (hour < SLOT_BOUNDS.snackUntil) return 's';
  if (hour < SLOT_BOUNDS.dinnerUntil) return 'd';
  if (hour < SLOT_BOUNDS.eveningUntil) return 'e';
  return NIGHT;
}

export function greetingFor(hour: number): string {
  const g = t.now.greeting;
  if (hour < GREETING_BOUNDS.quietUntil) return g.quiet;
  if (hour < GREETING_BOUNDS.morningUntil) return g.morning;
  if (hour < GREETING_BOUNDS.dayUntil) return g.day;
  if (hour < GREETING_BOUNDS.afternoonUntil) return g.afternoon;
  return g.evening;
}

/**
 * Where an hour sits on the DayStrip, as a 0–100 percentage of the 05–23 scale.
 * Clamped, so a 03:00 check-in doesn't draw the marker off the left edge.
 */
export function stripPct(hour: number): number {
  const span = DAY_STRIP.to - DAY_STRIP.from;
  return Math.max(0, Math.min(100, ((hour - DAY_STRIP.from) / span) * 100));
}

/** The next day's index, wrapping Sunday → Monday (the night card needs this). */
export const nextWeekday = (wd: WeekdayIndex): WeekdayIndex => ((wd + 1) % 7) as WeekdayIndex;

/** Shift a date by whole days, preserving local wall-clock time. */
export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}
