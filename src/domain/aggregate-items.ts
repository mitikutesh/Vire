import { GROC_CATS, type GrocCat, type GrocItem } from './schema';
import { grocId } from './groc-id';

/**
 * Turns the per-day ingredient lines a model returns into one week's shopping
 * list: same food on three days becomes one line with the amounts added up.
 *
 * Input rows are `[finnishName, englishName, category, quantity, staple?]`.
 * They arrive from an AI provider, so every field is coerced and anything
 * unusable is skipped rather than trusted — a malformed row must not cost the
 * user their whole grocery list.
 */

/** The short category codes the generation prompt asks for. */
const CAT_MAP: Record<string, GrocCat> = {
  fish: 'Fish & meat',
  dairy: 'Dairy & eggs',
  produce: 'Fruit & vegetables',
  grain: 'Bread & grains',
  pantry: 'Pantry & cans',
};

const FALLBACK_CAT: GrocCat = 'Pantry & cans';

/** Quantities we can add up. Anything else is carried through as free text. */
const QUANTITY = /^([\d.,]+)\s*(g|kg|ml|dl|l|tbsp|tsp|kpl|pcs|cans?|slices?)?\.?$/i;

/** Unitless counts ("2 onions") share this pseudo-unit. */
const COUNT = 'x';

interface Accumulated {
  fi: string;
  n: string;
  cat: GrocCat;
  staple: boolean;
  /** unit → summed amount */
  nums: Map<string, number>;
  /** quantities that resisted parsing, e.g. "smallest pack" */
  texts: string[];
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * "cans" and "can" are the same unit. The prototype kept them apart, which
 * split one shopping line in two whenever the model varied its plural.
 */
function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'cans') return 'can';
  if (u === 'slices') return 'slice';
  return u;
}

function formatAmount(unit: string, amount: number): string {
  // 1200 g is a number nobody shops by; 1.2 kg is.
  if (unit === 'g' && amount >= 1000) {
    return `${Math.round(amount / 100) / 10} kg`;
  }
  const rounded = Math.round(amount * 10) / 10;
  return unit === COUNT ? String(rounded) : `${rounded} ${unit}`;
}

export function aggregateItems(rows: readonly unknown[]): GrocItem[] {
  const merged = new Map<string, Accumulated>();

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 4) continue;

    const fi = str(row[0]);
    if (!fi) continue; // the Finnish name is what drives the store links

    // Merge on the same id the item will carry, so "Peruna" and "peruna" are
    // one line and the id stays stable across regeneration.
    const key = grocId(fi);
    const quantity = str(row[3]);
    const staple = row[4] === 1 || row[4] === true;

    let entry = merged.get(key);
    if (!entry) {
      entry = {
        fi,
        n: str(row[1]) || fi,
        cat: CAT_MAP[str(row[2]).toLowerCase()] ?? FALLBACK_CAT,
        staple,
        nums: new Map(),
        texts: [],
      };
      merged.set(key, entry);
    }
    // Staple-ness is sticky: if any day called it a pantry staple, it is one.
    if (staple) entry.staple = true;

    const match = QUANTITY.exec(quantity);
    const amount = match?.[1] ? Number.parseFloat(match[1].replace(',', '.')) : Number.NaN;
    if (match && Number.isFinite(amount)) {
      const unit = normalizeUnit(match[2] ?? COUNT);
      entry.nums.set(unit, (entry.nums.get(unit) ?? 0) + amount);
    } else if (quantity && !entry.texts.includes(quantity)) {
      entry.texts.push(quantity);
    }
  }

  const items: GrocItem[] = [...merged.entries()].map(([id, entry]) => {
    const parts = [...entry.nums].map(([unit, amount]) => formatAmount(unit, amount));
    // Two free-text notes is plenty; more turns the line into a paragraph.
    parts.push(...entry.texts.slice(0, 2));

    return {
      id,
      cat: entry.cat,
      n: entry.n,
      fi: entry.fi,
      q: parts.join(' + ') || 'as needed',
      ...(entry.staple ? { st: true } : {}),
    };
  });

  // Aisle order first, then alphabetical: the list should read like a walk
  // through the shop, not like the order the model happened to emit.
  items.sort(
    (a, b) => GROC_CATS.indexOf(a.cat) - GROC_CATS.indexOf(b.cat) || a.n.localeCompare(b.n),
  );

  return items;
}
