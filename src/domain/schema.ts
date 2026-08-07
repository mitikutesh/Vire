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
