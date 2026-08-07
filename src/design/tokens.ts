/**
 * The locked palette, mirrored from src/index.css for programmatic use.
 *
 * Tailwind utilities (`bg-paper`, `text-cloud`, …) cover static styling. These
 * constants exist for the cases utilities can't express: SVG `stroke`/`fill` on
 * the kcal Ring, the DayStrip's computed dot and line colors, and the
 * over-budget colour switches that flip on a value at runtime.
 *
 * src/design/tokens.test.ts asserts these stay in sync with the CSS and that
 * the retired green accent never returns.
 */
export const C = {
  paper: '#F1F2ED',
  card: '#FFFFFF',
  ink: '#14342B',
  sub: '#5F6E66',
  line: '#DFE4DC',
  cloud: '#DD8F1F',
  cloudSoft: '#FAF0DC',
  lake: '#3E7FA5',
  lakeSoft: '#E3EEF5',
  berry: '#B5484D',
  berrySoft: '#F6E4E4',
} as const;

/** Chain tags keep the chains' own brand colors — functional, not app accent. */
export const STORE_STYLE = {
  S: { bg: '#E3F0E0', fg: '#2E7D32', label: 'S' },
  K: { bg: '#FBE9DC', fg: '#D35400', label: 'K' },
  L: { bg: '#E1EAF6', fg: '#1A5FA8', label: 'L' },
} as const;

export type StoreTag = keyof typeof STORE_STYLE;

/**
 * Retired at the user's request: the app has NO green accent. Kept here only
 * so the token test can assert these values are absent from the stylesheet —
 * do not use them.
 */
export const RETIRED_TOKENS = {
  pine: '#226B4F',
  pineSoft: '#E4EFE8',
} as const;
