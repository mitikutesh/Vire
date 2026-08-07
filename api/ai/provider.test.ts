// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { STARTER_GROC } from '@/content/starter-plan';
import { aggregateItems } from '@/domain/aggregate-items';
import { AnthropicProvider } from './anthropic-provider';
import { OpenAiProvider } from './openai-provider';
import {
  canScanOffers,
  defaultModelFor,
  generationProvider,
  offerProvider,
  parseProviderId,
} from './provider';
import { allergyRule, dayGenerationPrompt, offerScanPrompt, slotBudgets } from './prompts';
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
import { AiOutputError, OfferScanUnsupportedError, type AiProvider, type DayConfig } from './types';

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

  it('builds the configured generation provider', () => {
    const provider = generationProvider({
      AI_PROVIDER: 'openai',
      AI_MODEL: 'gpt-4.1-mini',
      OPENAI_API_KEY: 'sk-test',
    });
    expect(provider.name).toBe('openai');
    expect(provider.model).toBe('gpt-4.1-mini');
  });

  it('fails at startup when the key for the chosen provider is missing', () => {
    expect(() => generationProvider({ AI_PROVIDER: 'openai' })).toThrow(/OPENAI_API_KEY/);
    expect(() => generationProvider({ AI_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('lets the offer scan run on a different provider than generation', () => {
    // The mixed configuration that makes Bedrock usable for generation.
    const provider = offerProvider({
      AI_PROVIDER: 'anthropic',
      AI_PROVIDER_OFFERS: 'openai',
      ANTHROPIC_API_KEY: 'sk-a',
      OPENAI_API_KEY: 'sk-o',
    });
    expect(provider.name).toBe('openai');
  });

  it('defaults the offer scan to the generation provider', () => {
    const provider = offerProvider({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-a' });
    expect(provider.name).toBe('anthropic');
  });

  it('knows which providers can search the web', () => {
    expect(canScanOffers('anthropic')).toBe(true);
    expect(canScanOffers('openai')).toBe(true);
    // Bedrock has no web-search tool — the documented limitation.
    expect(canScanOffers('bedrock')).toBe(false);
  });

  it('refuses to scan offers on a provider that cannot search', () => {
    // An empty deal list would look exactly like "no offers this week", so this
    // has to be a loud configuration error instead.
    expect(() => offerProvider({ AI_PROVIDER: 'bedrock', AI_PROVIDER_OFFERS: 'bedrock' })).toThrow(
      OfferScanUnsupportedError,
    );
  });

  it('reports Bedrock as unimplemented rather than failing in production', () => {
    expect(() => generationProvider({ AI_PROVIDER: 'bedrock' })).toThrow(/not implemented yet/);
  });
});
