/**
 * Domain constants with no runtime dependencies.
 *
 * Deliberately separate from schema.ts: importing a single constant from there
 * pulls Zod into whatever bundle does it, which put ~90 KB of validator into the
 * client just to render a list of grocery aisles. Zod belongs where validation
 * happens — API boundaries and write paths — not in the view layer.
 */

/** Meal slots, in the order they occur through the day. */
export const SLOT_KEYS = ['b', 'l', 's', 'd', 'e'] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

/** Grocery aisles, in the fixed order the Shop tab renders them. */
export const GROC_CATS = [
  'Fish & meat',
  'Dairy & eggs',
  'Fruit & vegetables',
  'Bread & grains',
  'Pantry & cans',
] as const;
export type GrocCat = (typeof GROC_CATS)[number];

export const STORE_TAGS = ['S', 'K', 'L'] as const;
export type StoreTag = (typeof STORE_TAGS)[number];

/** A weekday index, Monday = 0 — matches `weekdayIdx`. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
