import { z } from 'zod';

/**
 * Plan-shaped domain schemas.
 *
 * Defined with Zod rather than as bare TS types so there is exactly one source
 * of truth: the same schemas type the static starter content here, validate AI
 * provider output server-side (E2.1), and gate DynamoDB writes (E0.6). Shapes
 * are kept identical to the prototype's (CLAUDE.md: keep shapes unless there
 * is a reason not to) so the frozen prototype stays a readable reference.
 */

/** Meal slots, in the order they occur through the day. */
export const SLOT_KEYS = ['b', 'l', 's', 'd', 'e'] as const;
export const slotKeySchema = z.enum(SLOT_KEYS);
export type SlotKey = z.infer<typeof slotKeySchema>;

/** Grocery aisles, in the fixed order the Shop tab renders them. */
export const GROC_CATS = [
  'Fish & meat',
  'Dairy & eggs',
  'Fruit & vegetables',
  'Bread & grains',
  'Pantry & cans',
] as const;
export const grocCatSchema = z.enum(GROC_CATS);
export type GrocCat = z.infer<typeof grocCatSchema>;

export const storeTagSchema = z.enum(['S', 'K', 'L']);
export type StoreTag = z.infer<typeof storeTagSchema>;

/**
 * One meal. `fi` carries the Finnish dish name where one exists — the UI is
 * English but the food vocabulary is local, which is what makes the shopping
 * links work. Snacks are assembly-only: no steps, no video.
 */
export const mealSchema = z.object({
  n: z.string().min(1), // English name
  fi: z.string().nullable().optional(), // Finnish dish name, when there is one
  k: z.number().int().nonnegative(), // kcal
  p: z.number().int().nonnegative(), // protein g
  c: z.number().int().nonnegative(), // carbs g
  f: z.number().int().nonnegative(), // fat g
  ing: z.array(z.string().min(1)).min(1).max(10), // ingredients, metric amounts
  st: z.array(z.string().min(1)).max(4).optional(), // ≤3 short steps; absent for snacks
  yt: z.string().min(1).optional(), // YouTube search term; absent for snacks
});
export type Meal = z.infer<typeof mealSchema>;

/** One day: exactly the five slots. */
export const dayPlanSchema = z.object({
  b: mealSchema,
  l: mealSchema,
  s: mealSchema,
  d: mealSchema,
  e: mealSchema,
});
export type DayPlan = z.infer<typeof dayPlanSchema>;

/**
 * A grocery line. `id` is a content-stable slug of the Finnish name, never a
 * positional index: offer badges and checked-state must not migrate to a
 * different food when the list is regenerated (PLAN §4).
 */
export const grocItemSchema = z.object({
  id: z.string().min(1),
  cat: grocCatSchema,
  n: z.string().min(1), // English name
  fi: z.string().min(1), // Finnish shopping name — drives the store search links
  q: z.string().min(1), // quantity for the week
  st: z.boolean().optional(), // pantry staple: skip if already owned
});
export type GrocItem = z.infer<typeof grocItemSchema>;

/** A week: 7 days (Monday first) plus the aggregated shopping list. */
export const planSchema = z.object({
  v: z.literal(1),
  created: z.number().int().positive(),
  starter: z.boolean(),
  days: z.tuple([
    dayPlanSchema,
    dayPlanSchema,
    dayPlanSchema,
    dayPlanSchema,
    dayPlanSchema,
    dayPlanSchema,
    dayPlanSchema,
  ]),
  groc: z.array(grocItemSchema),
});
export type Plan = z.infer<typeof planSchema>;

/** A weekday index, Monday = 0 — matches the prototype's `weekdayIdx`. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/* ───────────────────────────── profile ───────────────────────────── */

export const sexSchema = z.enum(['f', 'm']);
export type Sex = z.infer<typeof sexSchema>;

/**
 * The profile. Ranges are enforced here rather than only in the UI: the target
 * is recomputed from these numbers server-side, so a nonsense weight would
 * become a nonsense calorie budget (PLAN §6, I5).
 */
export const profileSchema = z.object({
  name: z.string().max(80).default(''),
  sex: sexSchema,
  age: z.number().int().min(13).max(120),
  h: z.number().int().min(100).max(250), // height, cm
  w: z.number().min(30).max(300), // weight, kg
  goalW: z.number().min(30).max(300),
  act: z.number().min(1.2).max(1.725), // activity multiplier
  pace: z.union([z.literal(250), z.literal(500), z.literal(750)]), // kcal deficit
  city: z.string().min(1),
  allergies: z.string().max(500).default(''),
  waterMl: z.number().int().min(500).max(6000),
  /** Always recomputed server-side — never trusted from the client. */
  target: z.number().int().positive(),
  /** IANA zone, so server-side reminders can find the user's local windows. */
  timezone: z.string().min(1).default('Europe/Helsinki'),
});
export type Profile = z.infer<typeof profileSchema>;

/** What `calcTarget` needs — a profile subset, so callers can't over-share. */
export type TargetInput = Pick<Profile, 'sex' | 'age' | 'h' | 'w' | 'act' | 'pace'>;

/* ───────────────────────────── daily log ───────────────────────────── */

/** A swap: the user ate something other than the planned meal. */
export const swapSchema = z.object({
  n: z.string().max(120), // may be empty — "something else" is a valid answer
  k: z.number().int().positive(),
});
export type Swap = z.infer<typeof swapSchema>;

/**
 * One meal slot's state, in the prototype's wire shape:
 *   false / absent → not eaten
 *   true           → eaten as planned
 *   { n, k }       → ate something else instead, replacing the planned kcal
 * Use `isSwap` / `isEaten` rather than inspecting the union at call sites.
 */
export const slotEntrySchema = z.union([z.boolean(), swapSchema]);
export type SlotEntry = z.infer<typeof slotEntrySchema>;

/** A logged activity or an extra bite: a name and a calorie figure. */
export const kcalEntrySchema = z.object({
  n: z.string().min(1).max(120),
  k: z.number().int().positive(),
});
export type KcalEntry = z.infer<typeof kcalEntrySchema>;

export const dailyLogSchema = z.object({
  // Spelled out per slot rather than as a record: every slot is independently
  // optional (an unlogged slot is simply absent), which a record type of an
  // enum key cannot express.
  m: z
    .object({
      b: slotEntrySchema.optional(),
      l: slotEntrySchema.optional(),
      s: slotEntrySchema.optional(),
      d: slotEntrySchema.optional(),
      e: slotEntrySchema.optional(),
    })
    .default({}),
  water: z.number().int().min(0).max(40), // glasses
  ex: z.boolean().default(false), // the day's planned movement, done?
  exx: z.array(kcalEntrySchema).max(30).default([]), // extra movement
  extra: z.array(kcalEntrySchema).max(30).default([]), // extra food
});
export type DailyLog = z.infer<typeof dailyLogSchema>;

/** A weigh-in (I1). One per date; a later entry for the same day replaces it. */
export const weightEntrySchema = z.object({
  kg: z.number().min(30).max(300),
});
export type WeightEntry = z.infer<typeof weightEntrySchema>;
