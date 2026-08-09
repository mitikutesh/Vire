// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { STARTER_GROC } from '@/content/starter-plan';
import { THEMES } from '@/content/plan';
import { aggregateItems } from '@/domain/aggregate-items';
import { AnthropicProvider } from './anthropic-provider';
import { OpenAiProvider } from './openai-provider';
import { canScanOffers, defaultModelFor, parseProviderId, providerForKey } from './provider';
import { parseDay } from './parse';
import { MAX_ITEMS_PER_DAY } from './types';
import {
  allergyRule,
  avoidRule,
  dayGenerationPrompt,
  offerScanPrompt,
  slotBudgets,
} from './prompts';
import {
  DAY_JSON,
  DAY_JSON_FENCED,
  DAY_JSON_MISSING_SLOT,
  DAY_NOT_JSON,
  EMPTY_OFFER_JSON,
  OFFER_JSON,
  OFFER_JSON_BAD_STORE,
  VALID_DAY,
} from './fixtures';
import { AiOutputError, type AiProvider, type DayConfig } from './types';

const config: DayConfig = { weekday: 0, target: 1600, sex: 'f', age: 35, allergies: '' };
const offerRequest = {
  items: STARTER_GROC.slice(0, 3),
  city: 'Espoo',
  today: new Date(2026, 7, 7),
};

/** Anthropic adapter driven by a canned Messages response. */
const anthropicReturning = (text: string) =>
  new AnthropicProvider({
    messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) },
  });

/** OpenAI adapter driven by a canned Responses payload. */
const openaiReturning = (text: string) =>
  new OpenAiProvider({ responses: { create: vi.fn().mockResolvedValue({ output_text: text }) } });

/* ─────────────── the contract both adapters must satisfy ───────────────
   Running one suite over both is what makes "switching provider is a config
   change" a tested claim rather than an intention. */
const ADAPTERS: { name: string; make: (text: string) => AiProvider }[] = [
  { name: 'anthropic', make: anthropicReturning },
  { name: 'openai', make: openaiReturning },
];

describe.each(ADAPTERS)('$name adapter contract', ({ make }) => {
  it('parses a well-formed day', async () => {
    const day = await make(DAY_JSON).generateDay(config);
    expect(day.b.n).toBe(VALID_DAY.b.n);
    expect(day.l.fi).toBe('Lohikeitto');
    expect(day.items.length).toBeGreaterThanOrEqual(5);
  });

  it('tolerates JSON wrapped in prose or a fenced block', async () => {
    // Models do this even when told not to; refusing would fail a good plan.
    const day = await make(DAY_JSON_FENCED).generateDay(config);
    expect(day.d.n).toBe('Chicken tray bake');
  });

  it('rejects a day that is missing a meal slot', async () => {
    // Better a retried day than a week with a hole in it.
    await expect(make(DAY_JSON_MISSING_SLOT).generateDay(config)).rejects.toThrow(AiOutputError);
  });

  it('rejects a response that is not JSON at all', async () => {
    await expect(make(DAY_NOT_JSON).generateDay(config)).rejects.toThrow(AiOutputError);
  });

  it('names the failing day so only that day is retried', async () => {
    await expect(make(DAY_NOT_JSON).generateDay({ ...config, weekday: 4 })).rejects.toThrow(
      /Day 4/,
    );
  });

  it('produces items that feed straight into the shopping list', async () => {
    // The generation output and the aggregator have to agree on the row shape,
    // or the user gets a plan with no groceries.
    const day = await make(DAY_JSON).generateDay(config);
    const items = aggregateItems(day.items);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.id.length > 0)).toBe(true);
    expect(items.find((item) => item.n === 'Rapeseed oil')?.st).toBe(true);
  });

  it('parses an offer scan', async () => {
    const scan = await make(OFFER_JSON).scanOffers(offerRequest);
    expect(scan.deals).toHaveLength(2);
    expect(scan.deals[0]?.store).toBe('S');
  });

  it('treats "no offers this week" as a valid answer', async () => {
    const scan = await make(EMPTY_OFFER_JSON).scanOffers(offerRequest);
    expect(scan.deals).toEqual([]);
    expect(scan.note).toBeTruthy();
  });

  it('rejects an invented store code', async () => {
    // Only S, K and L have UI. "Prisma" would render as a blank tag.
    await expect(make(OFFER_JSON_BAD_STORE).scanOffers(offerRequest)).rejects.toThrow(
      AiOutputError,
    );
  });
});

describe('prompts', () => {
  it('splits the daily target across the slots, rounded to 10', () => {
    const budgets = slotBudgets(1600);
    expect(budgets).toEqual({ b: 350, l: 460, s: 160, d: 510, e: 110 });
    const total = Object.values(budgets).reduce((sum, n) => sum + n, 0);
    // Within a rounding hair of the target the user actually has.
    expect(Math.abs(total - 1600)).toBeLessThan(40);
  });

  it('states the allergy exclusion in the strongest terms available', () => {
    // Health guardrail 3: the highest-severity failure this app can produce.
    const rule = allergyRule('peanuts, shellfish');
    expect(rule).toContain('STRICT ALLERGY RULE');
    expect(rule).toContain('peanuts, shellfish');
    expect(rule).toContain('never use');
  });

  it('omits the allergy rule when there is nothing to exclude', () => {
    expect(allergyRule('')).toBe('');
    expect(allergyRule('   ')).toBe('');
  });

  it('carries the allergy rule into the generation prompt', () => {
    const prompt = dayGenerationPrompt({ ...config, allergies: 'peanuts' });
    expect(prompt).toContain('STRICT ALLERGY RULE');
    expect(prompt).toContain('peanuts');
  });

  it('gives each weekday its own theme so a week has variety', () => {
    const monday = dayGenerationPrompt({ ...config, weekday: 0 });
    const sunday = dayGenerationPrompt({ ...config, weekday: 6 });
    expect(monday).toContain('Monday');
    expect(sunday).toContain('Sunday');
    expect(monday).not.toBe(sunday);
  });

  it('keeps the cholesterol-friendly brief in every prompt', () => {
    // The app's second goal; without this the plan is just calorie counting.
    const prompt = dayGenerationPrompt(config);
    expect(prompt).toContain('cholesterol-friendly');
    expect(prompt).toContain('avoid red & processed meat');
  });

  it('scans offers for the user’s own city, not a hardcoded one', () => {
    // The prototype hardcoded the Helsinki region.
    const prompt = offerScanPrompt(offerRequest);
    expect(prompt).toContain('Espoo');
    expect(prompt).not.toContain('Helsinki region');
  });

  it('tells the model to search rather than recall, and never to guess a price', () => {
    const prompt = offerScanPrompt(offerRequest);
    expect(prompt).toContain('web search');
    expect(prompt).toContain('Never guess a price');
    expect(prompt).toContain('empty list is the correct');
  });

  it('sends the item ids the deals must match', () => {
    const prompt = offerScanPrompt(offerRequest);
    for (const item of offerRequest.items) {
      expect(prompt).toContain(`${item.id}=${item.fi}`);
    }
  });
});

describe('provider selection', () => {
  it('defaults to Anthropic, where the prompts were tuned', () => {
    expect(parseProviderId(undefined, 'anthropic')).toBe('anthropic');
    expect(defaultModelFor('anthropic')).toBe('claude-sonnet-4-6');
  });

  it('accepts a configured provider, case-insensitively', () => {
    expect(parseProviderId('openai', 'anthropic')).toBe('openai');
    expect(parseProviderId('  OpenAI ', 'anthropic')).toBe('openai');
  });

  it('refuses an unknown provider instead of silently falling back', () => {
    // Falling back would run on a vendor the operator did not configure and the
    // evals were never run against.
    expect(() => parseProviderId('gemini', 'anthropic')).toThrow(/Unknown AI_PROVIDER/);
  });

  it('knows which providers can search the web', () => {
    expect(canScanOffers('anthropic')).toBe(true);
    expect(canScanOffers('openai')).toBe(true);
    // Bedrock has no web-search tool — the documented limitation.
    expect(canScanOffers('bedrock')).toBe(false);
  });
});

describe('providerForKey (E7.6)', () => {
  it('builds a client from the user’s own key', () => {
    const provider = providerForKey('anthropic', 'sk-ant-'.padEnd(40, 'x'));
    expect(provider.name).toBe('anthropic');
    expect(provider.model).toBe(defaultModelFor('anthropic'));
  });

  it('honours the deployment’s model override', () => {
    // The model stays the deployment's choice; only the vendor follows the key.
    const provider = providerForKey('openai', 'sk-'.padEnd(40, 'x'), { AI_MODEL: 'gpt-test-1' });
    expect(provider.model).toBe('gpt-test-1');
  });

  it('refuses Bedrock, which has no key to bring', () => {
    // It authenticates by AWS role, so "bring your own key" is meaningless there.
    expect(() => providerForKey('bedrock', 'anything')).toThrow(/user-supplied API key/);
  });
});

describe('salvaging a day’s grocery rows', () => {
  const day = (items: unknown) => ({ ...VALID_DAY, items });

  it('drops a malformed row instead of failing the whole day', () => {
    // Five good meals should not be thrown away because one ingredient row is
    // short — that failure lands on some days and not others, which is worse to
    // debug than a consistent one.
    const raw = day([...VALID_DAY.items, ['too', 'short']]);
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.items).toHaveLength(VALID_DAY.items.length);
  });

  it('caps an over-long list rather than rejecting it', () => {
    const many = Array.from({ length: 30 }, (_, i) => [
      `fi-${i}`,
      `en-${i}`,
      'Pantry & cans',
      '1 kg',
    ]);
    const parsed = parseDay(JSON.stringify(day(many)), 0);
    expect(parsed.items).toHaveLength(MAX_ITEMS_PER_DAY);
  });

  it('still fails when the meals themselves are wrong', () => {
    // The meals are the health-relevant content and stay strict.
    const broken = { ...VALID_DAY, items: VALID_DAY.items, b: { n: 'Nameless' } };
    expect(() => parseDay(JSON.stringify(broken), 0)).toThrow(/failed validation/);
  });

  it('names what drifted, so a log says more than "something"', () => {
    const broken = { ...VALID_DAY, b: { n: 'Nameless' } };
    expect(() => parseDay(JSON.stringify(broken), 3)).toThrow(/Day 3 failed validation at: b\./);
  });
});

describe('prep stages (E7.7)', () => {
  const withPrep = (slot: 'b' | 'l' | 'd' | 's' | 'e', prep: unknown) => ({
    ...VALID_DAY,
    [slot]: { ...VALID_DAY[slot], prep },
  });

  it('keeps a well-formed head start', () => {
    const raw = withPrep('l', [{ lead: 480, leadMax: 960, active: 5, do: 'Soak the chickpeas' }]);
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.l.prep).toHaveLength(1);
    expect(parsed.l.prep?.[0]?.leadMax).toBe(960);
  });

  it('drops a lead too short to be a head start', () => {
    // Without a floor the model annotates "chop the onions, lead 15" on all
    // thirty-five meals and the feature becomes noise.
    const raw = withPrep('l', [{ lead: 15, active: 5, do: 'Chop the onions' }]);
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.l.prep).toBeUndefined();
  });

  it('drops an inverted window, which has no valid instant in it', () => {
    const raw = withPrep('l', [{ lead: 600, leadMax: 120, active: 5, do: 'Soak' }]);
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.l.prep).toBeUndefined();
  });

  it('drops hands-on time longer than the head start', () => {
    const raw = withPrep('l', [{ lead: 60, active: 120, do: 'Simmer' }]);
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.l.prep).toBeUndefined();
  });

  it('refuses prep on a snack, which is assembly-only by schema', () => {
    // s and e have no steps and no video; prep would quietly kill that invariant.
    const raw = withPrep('s', [{ lead: 120, active: 5, do: 'Soak the oats' }]);
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.s.prep).toBeUndefined();
  });

  it('keeps the good stages and drops only the bad one', () => {
    // Same trade as sanitiseItems: a meal whose food is fine is not lost
    // because one line of timing advice was malformed.
    const raw = withPrep('d', [
      { lead: 720, leadMax: 1080, active: 3, do: 'Thaw the fish in the fridge' },
      { lead: 5, active: 1, do: 'Open the packet' },
    ]);
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.d.prep).toHaveLength(1);
    expect(parsed.d.prep?.[0]?.do).toContain('Thaw');
  });

  it('caps the number of stages', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      lead: 120 + i,
      active: 2,
      do: `Stage ${i}`,
    }));
    const parsed = parseDay(JSON.stringify(withPrep('l', many)), 0);
    expect(parsed.l.prep?.length).toBeLessThanOrEqual(3);
  });

  it('leaves a day with no prep completely alone', () => {
    const parsed = parseDay(JSON.stringify(VALID_DAY), 0);
    expect(parsed.l.prep).toBeUndefined();
  });

  it('asks the model for a window whose text is safe throughout', () => {
    // The guardrail-7 fix: the instruction is fired anywhere in [lead, leadMax],
    // so it must be correct at every point, including across a night.
    const prompt = dayGenerationPrompt(config);
    expect(prompt).toContain('food-safe at EVERY point');
    expect(prompt).toContain('refrigerate');
    expect(prompt).toContain('asleep between');
  });
});

describe('dashes in generated copy', () => {
  it('rewrites an em dash the model put in a meal name or step', () => {
    // Generated text sits directly beside hand-written copy that has no em
    // dashes in it, so one arriving here is the loudest "a machine wrote this"
    // signal the UI can show.
    const raw = {
      ...VALID_DAY,
      b: { ...VALID_DAY.b, n: 'Oat porridge — with berries', st: ['Simmer 5 min — do not boil.'] },
    };
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.b.n).toBe('Oat porridge, with berries');
    expect(parsed.b.st?.[0]).toBe('Simmer 5 min, do not boil.');
  });

  it('keeps a number range readable instead of splitting the sentence', () => {
    // "5–7 min" is a range, not punctuation: turning it into "5, 7 min" would
    // change a cooking instruction into nonsense.
    const raw = { ...VALID_DAY, b: { ...VALID_DAY.b, st: ['Cook 5–7 min until creamy.'] } };
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.b.st?.[0]).toBe('Cook 5-7 min until creamy.');
  });

  it('reaches the ingredient and grocery strings too', () => {
    const raw = {
      ...VALID_DAY,
      b: { ...VALID_DAY.b, ing: ['rye bread — 2 slices'] },
      items: [['Kaurahiutale — luomu', 'Oats', 'Pantry & cans', '1 kg']],
    };
    const parsed = parseDay(JSON.stringify(raw), 0);
    expect(parsed.b.ing[0]).toBe('rye bread, 2 slices');
    expect(parsed.items[0]?.[0]).toBe('Kaurahiutale, luomu');
  });

  it('tells the model not to produce them in the first place', () => {
    expect(dayGenerationPrompt(config)).toContain('Never use em dashes');
  });
});

describe('asking for something new (regeneration)', () => {
  it('names nothing to avoid on a first generation', () => {
    expect(avoidRule(undefined)).toBe('');
    expect(avoidRule([])).toBe('');
  });

  it('asks the model to choose different dishes', () => {
    // Without this, regenerating asks the same question of the same model with the
    // same prompt and gets the same answer — which makes a working button look
    // broken.
    const rule = avoidRule(['Blueberry oatmeal', 'Light salmon soup']);
    expect(rule).toContain('Blueberry oatmeal');
    expect(rule).toContain('Light salmon soup');
    expect(rule).toMatch(/different/);
  });

  it('caps the list, so it cannot crowd out the instructions', () => {
    // It is prepended to all seven calls, so length costs input tokens sevenfold.
    const many = Array.from({ length: 40 }, (_, i) => `Dish ${i}`);
    const rule = avoidRule(many);
    expect(rule).toContain('Dish 11');
    expect(rule).not.toContain('Dish 12');
  });

  it('reaches the prompt', () => {
    const prompt = dayGenerationPrompt({
      weekday: 0,
      target: 1600,
      sex: 'f',
      age: 35,
      allergies: '',
      avoid: ['Blueberry oatmeal'],
    });
    expect(prompt).toContain('Blueberry oatmeal');
  });
});

describe('the day themes', () => {
  it('no longer name the starter week’s dishes', () => {
    // They used to describe the curated week almost exactly, so a generated plan
    // came back looking like the built-in one and regenerating changed nothing.
    const joined = THEMES.join(' ').toLowerCase();
    for (const dish of ['lohikeitto', 'tray bake', 'hernekeitto', 'uunilohi', 'oat pancakes']) {
      expect(joined, dish).not.toContain(dish);
    }
  });

  it('still gives each day a distinct angle', () => {
    expect(new Set(THEMES).size).toBe(7);
  });
});
