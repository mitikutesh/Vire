import { SLOT_BUDGET_RATIO, SLOTS, THEMES } from '@/content/plan';
import { DAY_NAMES } from '@/content/strings';
import type { GrocItem } from '@/domain/schema';
import type { DayConfig, OfferScanRequest } from './types';

/**
 * Prompt text, shared by every provider adapter.
 *
 * Kept out of the adapters on purpose: the allergy-exclusion rule is a health
 * guardrail (PLAN §7, guardrail 3), and a guardrail with one wording per vendor
 * is a guardrail that will eventually differ per vendor. Adapters own transport
 * and tool syntax; this file owns what is asked.
 */

/** Per-slot kcal budgets, rounded to 10, from the daily target. */
export function slotBudgets(target: number): Record<string, number> {
  return Object.fromEntries(
    SLOTS.map((slot) => [slot, Math.round((target * SLOT_BUDGET_RATIO[slot]) / 10) * 10]),
  );
}

/**
 * The allergy line. Deliberately blunt and repeated in caps, because a missed
 * exclusion is the highest-severity failure this app can produce. The UI still
 * tells the user to check labels — this reduces risk, it does not remove it.
 */
export function allergyRule(allergies: string): string {
  const trimmed = allergies.trim();
  if (!trimmed) return '';
  return ` STRICT ALLERGY RULE: completely exclude and never use: ${trimmed}.`;
}

export function dayGenerationPrompt(config: DayConfig): string {
  const { weekday, target, sex, age, allergies, avoid } = config;
  const budget = slotBudgets(target);

  return (
    `Plan ${DAY_NAMES[weekday]}'s food for a Finnish home cook ` +
    `(${sex === 'm' ? 'male' : 'female'}, ${age} y, daily target ${target} kcal).` +
    ' Style: everyday Finnish + Mediterranean, cholesterol-friendly: fatty fish, oats, rye,' +
    ' legumes, vegetables, berries, rapeseed/olive oil; avoid red & processed meat, butter,' +
    ' cream, added sugar.' +
    allergyRule(allergies) +
    ` Day theme: ${THEMES[weekday]}.` +
    avoidRule(avoid) +
    ` Meal kcal near: breakfast ${budget['b']}, lunch ${budget['l']},` +
    ` afternoon snack ${budget['s']}, dinner ${budget['d']}, evening bite ${budget['e']};` +
    ` the five k values must sum within 5% of ${target}.` +
    ' Rules: k, p, c and f are numbers; ing is at most 8 short strings with metric amounts;' +
    ' st is at most 3 steps of at most 10 words; s and e are assembly-only snacks with no' +
    ' steps and no yt; items lists EVERY purchasable ingredient of the day as' +
    ' [finnishShopName, EnglishName, cat, quantity, optional 1 if a pantry staple such as oil' +
    ' or spice], where cat is exactly one of fish|dairy|produce|grain|pantry, at most 16 items' +
    ' (merge similar ones). Keep every string short.'
  );
}

/** Compact `id=finnishName` list — the model matches offers against these ids. */
export function offerItemList(items: readonly GrocItem[]): string {
  return items.map((item) => `${item.id}=${item.fi}`).join(', ');
}

export function offerScanPrompt({ items, city, today }: OfferScanRequest): string {
  return (
    `Today is ${today.toLocaleDateString('fi-FI')}.` +
    ` I buy groceries in ${city}, Finland.` +
    " Step 1: use web search (a few searches) to find THIS WEEK'S grocery discounts at Finnish" +
    ' chains: S-Group (Prisma / S-market, s-kaupat.fi kampanjat), K-Group (K-Citymarket /' +
    ' K-Supermarket, k-ruoka.fi tarjoukset) and Lidl Suomi (lidl.fi).' +
    ` Step 2: match found offers to my list of item codes (code=finnish name): ${offerItemList(items)}.` +
    ' Step 3: report only real current offers you actually found — an empty list is the correct' +
    ' answer if there are none. Never guess a price. store is exactly S, K or L; at most 15' +
    ' deals; each deal text under 8 words, including the price when known; note is one short' +
    ' sentence on where the best savings are this week.'
  );
}

/**
 * Ask for something other than what the user already has.
 *
 * Capped, because a long exclusion list crowds out the instructions that matter
 * and costs input tokens on every one of the seven calls.
 */
export function avoidRule(avoid: readonly string[] | undefined): string {
  const dishes = (avoid ?? [])
    .map((dish) => dish.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (dishes.length === 0) return '';
  return ` The user already has these dishes, so choose different ones: ${dishes.join('; ')}.`;
}
