/**
 * Outbound links to Finnish grocery chains and recipe video search.
 *
 * Centralized on purpose: these URL shapes are the one part of the app that a
 * third party can break without warning, so there is a single place to fix and
 * a smoke test that fails loudly if a shape drifts (PLAN §10).
 */

const enc = encodeURIComponent;

/** S-kaupat (S-Group) product search — no public price API exists, so search. */
export const sLink = (finnishName: string): string =>
  `https://www.s-kaupat.fi/tuotehaku?queryString=${enc(finnishName)}`;

/** K-Ruoka (Kesko) product search. */
export const kLink = (finnishName: string): string =>
  `https://www.k-ruoka.fi/kauppa/tuotehaku?haku=${enc(finnishName)}`;

/** Recipe video search — "recipe" is appended so cooking results rank first. */
export const ytLink = (searchTerm: string): string =>
  `https://www.youtube.com/results?search_query=${enc(`${searchTerm} recipe`)}`;

/** Nearest branch of a chain, scoped to the user's city. */
export const mapsLink = (chain: string, city: string): string =>
  `https://www.google.com/maps/search/${enc(`${chain} ${city}`)}`;

/** The chains' own weekly-offer pages: the authority the AI scan defers to. */
export const CHAIN_DEALS = {
  S: 'https://www.s-kaupat.fi/tuotteet/kampanjat',
  K: 'https://www.k-ruoka.fi/tarjoukset',
  L: 'https://www.lidl.fi',
} as const;

/** Map chips on the Shop tab, one per chain. */
export const CHAIN_STORES = [
  { name: 'Prisma', tag: 'S' },
  { name: 'K-Citymarket', tag: 'K' },
  { name: 'Lidl', tag: 'L' },
] as const;
