import { describe, expect, it } from 'vitest';
// `?raw` keeps this assertion in the browser TS program: reading the file with
// node:fs would force Node types into app code that must never use them.
import css from '../index.css?raw';
import { C, RETIRED_TOKENS, STORE_STYLE } from './tokens';

describe('design tokens', () => {
  it('defines every palette color in the stylesheet', () => {
    // Guards against the TS constants and the Tailwind theme drifting apart —
    // they are two views of one locked product decision.
    for (const [name, hex] of Object.entries(C)) {
      expect(css.toLowerCase(), `${name} (${hex}) missing from index.css`).toContain(
        hex.toLowerCase(),
      );
    }
  });

  it('defines every store chain brand color in the stylesheet', () => {
    for (const [tag, style] of Object.entries(STORE_STYLE)) {
      expect(css.toLowerCase(), `store ${tag} fg missing`).toContain(style.fg.toLowerCase());
      expect(css.toLowerCase(), `store ${tag} bg missing`).toContain(style.bg.toLowerCase());
    }
  });

  it('has NO green accent — pine was retired at the user’s request', () => {
    // CLAUDE.md: green was removed entirely. If a future change reintroduces
    // it, this fails rather than silently shipping a rejected design.
    // Comments are stripped first: prose *about* the retired tokens is fine,
    // an actual declaration is not.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '').toLowerCase();
    for (const [name, hex] of Object.entries(RETIRED_TOKENS)) {
      expect(declarations, `retired token ${name} (${hex}) is back in index.css`).not.toContain(
        hex.toLowerCase(),
      );
    }
  });

  it('uses the cloudberry accent for the focus ring', () => {
    expect(css).toMatch(/focus-visible[\s\S]*?outline:\s*2px solid var\(--color-cloud\)/);
  });

  it('exposes the display face as the .disp utility', () => {
    expect(css).toMatch(/@utility disp\s*\{[\s\S]*?--font-disp/);
    expect(css).toContain("'Bricolage Grotesque Variable'");
  });

  it('self-hosts the fonts rather than requesting Google Fonts', () => {
    expect(css).toContain('@fontsource-variable/bricolage-grotesque');
    expect(css).toContain('@fontsource-variable/instrument-sans');
    expect(css).not.toContain('fonts.googleapis.com');
  });

  it('honours prefers-reduced-motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
