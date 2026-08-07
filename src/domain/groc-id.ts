/** Combining diacritical marks — what NFD splits off from ä, ö, å, é… */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Stable grocery-line identity.
 *
 * Ids are derived from the Finnish shopping name, never from the item's
 * position in the list. The prototype used positional ids (`g01`…`gNN`), which
 * silently re-pointed a cached offer badge or a checked box at a different food
 * whenever the week was regenerated (PLAN §4, review blocker #1).
 *
 * Two lines that slug to the same id are the same shopping line — that is what
 * lets `aggregateItems` merge a food that appears on several days.
 */
export function grocId(finnishName: string): string {
  const slug = finnishName
    .normalize('NFD') // ä → a + combining diaeresis
    .replace(COMBINING_MARKS, '') // …then drop the mark, leaving plain ASCII
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // A name made only of punctuation would otherwise produce an empty id.
  return slug || 'item';
}
