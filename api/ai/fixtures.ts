import type { GeneratedDay, OfferScanResult } from './types';

/**
 * Recorded provider output, used by the contract suite.
 *
 * Every adapter is driven through the *same* fixtures, so "swapping provider is
 * a config change" is a tested claim rather than a hope: an adapter that mangles
 * a response, drops the items rows, or accepts a bad shape fails here.
 *
 * These are hand-built rather than captured verbatim so they can include the
 * awkward cases a happy-path capture would never contain: fenced JSON, prose
 * around the object, and a day that violates the schema.
 */

export const VALID_DAY: GeneratedDay = {
  b: {
    n: 'Blueberry oatmeal',
    fi: 'Kaurapuuro mustikoilla',
    k: 350,
    p: 12,
    c: 52,
    f: 11,
    ing: ['80 g rolled oats', '2 dl oat drink', '75 g blueberries'],
    st: ['Simmer the oats.', 'Top with blueberries.'],
    yt: 'creamy oatmeal blueberries',
  },
  l: {
    n: 'Light salmon soup',
    fi: 'Lohikeitto',
    k: 460,
    p: 32,
    c: 40,
    f: 18,
    ing: ['120 g salmon', '200 g potatoes', 'fresh dill'],
    st: ['Simmer the potatoes.', 'Add salmon and dill.'],
    yt: 'lohikeitto recipe',
  },
  s: {
    n: 'Apple + almonds',
    fi: null,
    k: 160,
    p: 4,
    c: 22,
    f: 9,
    ing: ['1 apple', '15 g almonds'],
  },
  d: {
    n: 'Chicken tray bake',
    fi: null,
    k: 510,
    p: 38,
    c: 44,
    f: 17,
    ing: ['150 g chicken breast', '200 g potatoes', '2 carrots'],
    st: ['Heat oven to 200 C.', 'Roast 30 min.'],
    yt: 'chicken tray bake',
  },
  e: { n: 'Skyr with berries', fi: null, k: 120, p: 15, c: 12, f: 1, ing: ['150 g skyr'] },
  items: [
    ['kaurahiutaleet', 'Rolled oats', 'grain', '80 g'],
    ['lohifilee', 'Salmon fillet', 'fish', '120 g'],
    ['peruna', 'Potatoes', 'produce', '400 g'],
    ['broilerin rintafilee', 'Chicken breast', 'fish', '150 g'],
    ['maitorahka', 'Skyr', 'dairy', '150 g'],
    ['rypsiöljy', 'Rapeseed oil', 'pantry', '1 tbsp', 1],
  ],
};

/** The same day, minified, as a bare JSON string. */
export const DAY_JSON = JSON.stringify(VALID_DAY);

/** Wrapped in a fenced block, which models do despite being asked not to. */
export const DAY_JSON_FENCED = `Here is the plan:\n\`\`\`json\n${DAY_JSON}\n\`\`\`\nEnjoy!`;

/** Missing the evening bite: a shape violation the adapter must reject. */
export const DAY_JSON_MISSING_SLOT = JSON.stringify({
  ...VALID_DAY,
  e: undefined,
});

/** Not JSON at all — a refusal or an apology. */
export const DAY_NOT_JSON = "I'm sorry, I can't help with that.";

export const VALID_OFFER_SCAN: OfferScanResult = {
  deals: [
    { id: 'lohifilee', store: 'S', deal: 'lohifilee 9,95 €/kg' },
    { id: 'peruna', store: 'K', deal: 'peruna 0,99 €/kg' },
  ],
  note: 'Fish is cheapest at Prisma this week.',
};

export const OFFER_JSON = JSON.stringify(VALID_OFFER_SCAN);

/** A week with no matches — the correct answer, not an error. */
export const EMPTY_OFFER_JSON = JSON.stringify({ deals: [], note: 'No matches this week.' });

/** An invented store code: the schema must reject it rather than render it. */
export const OFFER_JSON_BAD_STORE = JSON.stringify({
  deals: [{ id: 'lohifilee', store: 'Prisma', deal: 'salmon cheap' }],
  note: '',
});
