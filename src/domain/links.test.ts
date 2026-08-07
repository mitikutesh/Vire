import { describe, expect, it } from 'vitest';
import { CHAIN_DEALS, CHAIN_STORES, kLink, mapsLink, sLink, ytLink } from './links';

/**
 * Smoke tests for third-party URL shapes. They cannot detect that a chain
 * changed its site, but they do catch an accidental edit to a builder — and
 * they document the shape to compare against when a link stops working.
 */
describe('store search links', () => {
  it('builds an S-kaupat product search', () => {
    expect(sLink('lohifilee')).toBe('https://www.s-kaupat.fi/tuotehaku?queryString=lohifilee');
  });

  it('builds a K-Ruoka product search', () => {
    expect(kLink('lohifilee')).toBe('https://www.k-ruoka.fi/kauppa/tuotehaku?haku=lohifilee');
  });

  it('encodes Finnish diacritics and spaces', () => {
    // Raw "ä" or a bare space in a query string breaks the search.
    expect(sLink('täysjyvä pasta')).toBe(
      'https://www.s-kaupat.fi/tuotehaku?queryString=t%C3%A4ysjyv%C3%A4%20pasta',
    );
    expect(kLink('tonnikala vedessä')).toContain('vedess%C3%A4');
  });

  it('encodes characters that would otherwise split the query', () => {
    expect(sLink('kana & riisi')).toContain('kana%20%26%20riisi');
  });
});

describe('ytLink', () => {
  it('appends "recipe" so cooking results rank first', () => {
    expect(ytLink('lohikeitto')).toBe(
      'https://www.youtube.com/results?search_query=lohikeitto%20recipe',
    );
  });
});

describe('mapsLink', () => {
  it('searches for a chain near the user’s city', () => {
    expect(mapsLink('Prisma', 'Helsinki')).toBe(
      'https://www.google.com/maps/search/Prisma%20Helsinki',
    );
  });
});

describe('chain pages', () => {
  it('points at each chain’s own weekly offers', () => {
    // These are the authority the AI offer scan tells the user to verify against.
    expect(CHAIN_DEALS.S).toContain('s-kaupat.fi');
    expect(CHAIN_DEALS.K).toContain('k-ruoka.fi');
    expect(CHAIN_DEALS.L).toContain('lidl.fi');
    for (const url of Object.values(CHAIN_DEALS)) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it('offers one map chip per chain', () => {
    expect(CHAIN_STORES.map((s) => s.tag)).toEqual(['S', 'K', 'L']);
  });
});
