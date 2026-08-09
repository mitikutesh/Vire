// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { C } from '../../src/design/tokens';

/**
 * The app icon set.
 *
 * Lives beside the asset it guards rather than under src/, because it reads files
 * from disk and src/ is the browser TypeScript program — no Node types there. That
 * mistake has now been made twice in this repo; tsconfig.node.json includes this
 * directory so it cannot be made a third time.
 *
 * Icons are the one asset a build will happily ship without: a missing file
 * becomes a broken-image favicon or, on iOS, a screenshot of the page used as the
 * home-screen icon. Nothing else in the suite would notice.
 */

const read = (path: string) => readFileSync(path, 'utf8');

describe('the mark', () => {
  it('uses only the locked palette', () => {
    // Paper ground, cloudberry leaves, deep-spruce stem — and nothing else, so a
    // stray colour cannot enter the brand through an asset.
    const svg = read('assets/logo/vire-mark.svg');
    const colours = [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]!.toUpperCase());
    expect(new Set(colours)).toEqual(
      new Set([C.paper.toUpperCase(), C.cloud.toUpperCase(), C.ink.toUpperCase()]),
    );
  });

  it('carries no retired green', () => {
    // The pine accent was retired at the owner's request; an asset is an easy
    // place for it to creep back in unnoticed.
    for (const file of ['assets/logo/vire-mark.svg', 'assets/logo/vire-mark-square.svg']) {
      expect(read(file).toUpperCase()).not.toContain('#226B4F');
    }
  });

  it('draws with fills only, never strokes', () => {
    // Stroke support is the first thing simple SVG renderers get wrong; the stem
    // vanished entirely under one of them while looking correct in a browser.
    const svg = read('assets/logo/vire-mark.svg');
    expect(svg).not.toMatch(/\sstroke=/);
  });

  it('depends on no font', () => {
    // The brand face ships as woff2 only, and a mark that needs a font renders
    // differently in every rasteriser — including the browser drawing the favicon.
    const svg = read('assets/logo/vire-mark.svg');
    expect(svg).not.toMatch(/<text|font-family/);
  });

  it('keeps square corners on the variant the platform masks', () => {
    // iOS and Android apply their own shape; baked-in corners show as a notch
    // inside it.
    expect(read('assets/logo/vire-mark-square.svg')).not.toMatch(/rx="/);
    expect(read('assets/logo/vire-mark.svg')).toMatch(/rx="/);
  });
});

describe('the shipped files', () => {
  const required = [
    'public/favicon.ico',
    'public/favicon.svg',
    'public/icon-192.png',
    'public/icon-512.png',
    'public/icon-maskable-512.png',
    'public/apple-touch-icon.png',
    'public/manifest.webmanifest',
  ];

  it('are all present', () => {
    for (const file of required) expect(existsSync(file), file).toBe(true);
  });

  it('are all referenced from the page or the manifest', () => {
    // A generated icon nobody links to is dead weight that still looks like
    // coverage.
    const html = read('index.html');
    const manifest = read('public/manifest.webmanifest');
    for (const file of required) {
      const name = file.replace('public/', '');
      expect(html.includes(name) || manifest.includes(name), name).toBe(true);
    }
  });

  it('declares the maskable purpose, so Android does not letterbox it', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
      icons: { purpose: string }[];
    };
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === 'any')).toBe(true);
  });

  it('matches the app background, so no white flash on launch', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
      background_color: string;
      theme_color: string;
    };
    expect(manifest.background_color.toUpperCase()).toBe(C.paper.toUpperCase());
    expect(manifest.theme_color.toUpperCase()).toBe(C.paper.toUpperCase());
  });
});
