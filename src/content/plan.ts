import type { SlotKey, WeekdayIndex } from '@/domain/schema';
import { SLOT_KEYS } from '@/domain/schema';

/**
 * Versioned product content: the shape of a Vire week.
 *
 * This lives in code, not the database (PLAN §4) — it is a product decision
 * that changes by deploy, and keeping it here means it is reviewed like code.
 * Labels and copy live in src/content/strings.ts; this file holds structure
 * and numbers only.
 */

export const SLOTS = SLOT_KEYS;

/** When each slot happens, and its share of the daily calorie budget. */
export const SLOT_BUDGET_RATIO: Record<SlotKey, number> = {
  b: 0.22,
  l: 0.29,
  s: 0.1,
  d: 0.32,
  e: 0.07,
};

/**
 * Clock boundaries that decide which slot is "now" (hours, fractional).
 * Below the first bound and at/after the last, the kitchen is closed.
 */
export const SLOT_BOUNDS = {
  dayStart: 5,
  breakfastUntil: 10.5,
  lunchUntil: 14,
  snackUntil: 16.5,
  dinnerUntil: 20,
  eveningUntil: 23,
} as const;

/** Greeting boundaries (hours) — see strings.now.greeting. */
export const GREETING_BOUNDS = {
  quietUntil: 5,
  morningUntil: 11,
  dayUntil: 15,
  afternoonUntil: 19,
} as const;

/** The DayStrip: a 05–23 h scale with a dot per event. The app's signature. */
export const DAY_STRIP = {
  from: 5,
  to: 23,
  ticks: [5, 11, 17, 23],
  dots: [
    { at: 7.5, slot: 'b' },
    { at: 12, slot: 'l' },
    { at: 15, slot: 's' },
    { at: 17, slot: 'ex' },
    { at: 18.2, slot: 'd' },
    { at: 20.5, slot: 'e' },
  ],
} as const satisfies {
  from: number;
  to: number;
  ticks: readonly number[];
  dots: readonly { at: number; slot: SlotKey | 'ex' }[];
};

/** Movement nudge window on the Now tab; Sunday is the rest day. */
export const MOVE_WINDOW = { from: 16, to: 20, restDay: 6 } as const;

/** Water is tracked in glasses; the goal is stored in ml. */
export const WATER = { glassMl: 250, minGlasses: 4, defaultGoalMl: 2000 } as const;

/**
 * Calorie floors. A safety guardrail, not a preference: the computed target is
 * never allowed below these (CLAUDE.md health guardrails, PLAN §7).
 */
export const KCAL_FLOOR = { f: 1200, m: 1500 } as const;

/** Activity multipliers applied to BMR (values the profile stores). */
export const ACTIVITY_LEVELS = [1.2, 1.375, 1.55, 1.725] as const;

/** Daily deficits, in kcal, behind the three weight-loss paces. */
export const PACE_LEVELS = [250, 500, 750] as const;

/** Areas served — the store links and Maps chips are scoped to these. */
export const CITIES = ['Helsinki', 'Espoo', 'Vantaa', 'Kauniainen', 'Uusimaa'] as const;
export type City = (typeof CITIES)[number];

/** A weekly exercise rotation, Monday first. Sunday is deliberately rest. */
export interface Exercise {
  readonly n: string;
  readonly min: number;
  readonly k: number;
}

export const EX: readonly [Exercise, Exercise, Exercise, Exercise, Exercise, Exercise, Exercise] = [
  { n: 'Brisk walk', min: 35, k: 180 },
  { n: 'Strength training', min: 40, k: 260 },
  { n: 'Brisk walk', min: 35, k: 180 },
  { n: 'Cycling or swimming', min: 40, k: 300 },
  { n: 'Strength training', min: 30, k: 200 },
  { n: 'Long walk outdoors', min: 60, k: 300 },
  { n: 'Rest — easy stretching', min: 20, k: 80 },
];

/** One-tap additions for movement that wasn't on the plan. */
export const QUICK_EX: readonly Exercise[] = [
  { n: 'Walk 30 min', min: 30, k: 140 },
  { n: 'Walk 60 min', min: 60, k: 280 },
  { n: 'Gym 45 min', min: 45, k: 280 },
  { n: 'Bike 40 min', min: 40, k: 300 },
];

export const exerciseFor = (wd: WeekdayIndex): Exercise => EX[wd];

/**
 * Day themes handed to the AI provider, one per weekday, so a generated week
 * has deliberate variety instead of seven variations on the same day
 * (consumed by the generation route in E2.1).
 */
export const THEMES: readonly [string, string, string, string, string, string, string] = [
  'Finnish classic: oat porridge breakfast, creamy-light salmon soup (lohikeitto) lunch, poultry tray bake dinner',
  'Egg-and-rye breakfast, legume soup lunch (lentil or bean), oven-baked salmon (uunilohi style) dinner',
  'Overnight oats breakfast, chicken grain bowl lunch, wholegrain pasta with canned fish dinner',
  'Skyr bowl breakfast, Finnish pea soup (hernekeitto) lunch, Mediterranean chicken salad dinner',
  'Warm oatmeal breakfast, smoked-fish wrap lunch, vegetarian chickpea or bean stew dinner',
  'Vegetable omelette breakfast, rainbow trout with dill potatoes lunch, lean turkey mince dinner with lingonberry',
  'Weekend oat pancakes breakfast, roast chicken lunch, Mediterranean fish & tomato stew with barley dinner',
];
