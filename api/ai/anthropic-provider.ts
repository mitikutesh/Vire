import Anthropic from '@anthropic-ai/sdk';
import { dayGenerationPrompt, offerScanPrompt } from './prompts';
import { parseDay, parseOfferScan } from './parse';
import type {
  AiProvider,
  DayConfig,
  GeneratedDay,
  OfferScanRequest,
  OfferScanResult,
} from './types';

/**
 * The default provider. The prototype's prompts were written and tuned against
 * Claude, so this is the adapter with known-good behaviour; PLAN §3a records an
 * eval task to compare current models before changing the default.
 */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-6';

/** The narrow slice of the SDK this adapter uses, so tests can substitute it. */
export interface AnthropicLike {
  messages: {
    create(body: Record<string, unknown>): Promise<{ content: unknown[] }>;
  };
}

/** Pull the concatenated text out of a Messages response. */
function textOf(content: readonly unknown[]): string {
  return content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text',
    )
    .map((block) => block.text)
    .join('\n');
}

const DAY_SHAPE =
  '{"b":{"n":"English name","fi":"Finnish dish name or null","k":340,"p":15,"c":45,"f":10,' +
  '"ing":["70 g rolled oats"],"st":["short step"],"yt":"youtube search words"},' +
  '"l":{...},"s":{...},"d":{...},"e":{...},' +
  '"items":[["kaurahiutaleet","Rolled oats","grain","70 g"],' +
  '["rypsiöljy","Rapeseed oil","pantry","1 tbsp",1]]}';

const OFFER_SHAPE =
  '{"deals":[{"id":"kaurahiutaleet","store":"S","deal":"kaurahiutaleet 1,29 €"}],' +
  '"note":"one short sentence"}';

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly client: AnthropicLike,
    readonly model: string = ANTHROPIC_DEFAULT_MODEL,
  ) {}

  static fromApiKey(apiKey: string, model?: string): AnthropicProvider {
    return new AnthropicProvider(new Anthropic({ apiKey }) as unknown as AnthropicLike, model);
  }

  async generateDay(config: DayConfig): Promise<GeneratedDay> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `${dayGenerationPrompt(config)} Reply with ONLY minified valid JSON, no markdown and no prose: ${DAY_SHAPE}`,
        },
      ],
    });

    // Errors name the day, so the caller retries one day rather than the week.
    return parseDay(textOf(response.content), config.weekday);
  }

  async scanOffers(request: OfferScanRequest): Promise<OfferScanResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      // Live prices cannot come from training data; the search tool is the point.
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [
        {
          role: 'user',
          content: `${offerScanPrompt(request)} Reply with ONLY minified valid JSON, no markdown and no prose: ${OFFER_SHAPE}`,
        },
      ],
    });

    return parseOfferScan(textOf(response.content));
  }
}
