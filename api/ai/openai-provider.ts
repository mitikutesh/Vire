import OpenAI from 'openai';
import { dayGenerationPrompt, offerScanPrompt } from './prompts';
import { parseDay, parseOfferScan } from './parse';
import {
  AiOutputError,
  type AiProvider,
  type DayConfig,
  type GeneratedDay,
  type OfferScanRequest,
  type OfferScanResult,
} from './types';

/**
 * OpenAI adapter — the proof that the provider layer is real rather than
 * aspirational (PLAN §3a, owner decision).
 *
 * Same prompts, same validation, same return shapes as the Anthropic adapter;
 * only the transport and the web-search tool syntax differ. The contract fixture
 * suite runs over both, so a difference in leniency shows up as a failing test.
 */
export const OPENAI_DEFAULT_MODEL = 'gpt-4.1';

/** The narrow slice of the SDK this adapter uses, so tests can substitute it. */
export interface OpenAiLike {
  responses: {
    create(body: Record<string, unknown>): Promise<{ output_text?: string }>;
  };
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';

  constructor(
    private readonly client: OpenAiLike,
    readonly model: string = OPENAI_DEFAULT_MODEL,
  ) {}

  static fromApiKey(apiKey: string, model?: string): OpenAiProvider {
    return new OpenAiProvider(new OpenAI({ apiKey }) as unknown as OpenAiLike, model);
  }

  private static requireText(response: { output_text?: string }): string {
    const text = response.output_text?.trim();
    if (!text) throw new AiOutputError('response contained no text output');
    return text;
  }

  async generateDay(config: DayConfig): Promise<GeneratedDay> {
    const response = await this.client.responses.create({
      model: this.model,
      input: `${dayGenerationPrompt(config)} Reply with ONLY minified valid JSON matching the requested keys, no markdown and no prose.`,
    });

    return parseDay(OpenAiProvider.requireText(response), config.weekday);
  }

  async scanOffers(request: OfferScanRequest): Promise<OfferScanResult> {
    const response = await this.client.responses.create({
      model: this.model,
      // Same intent as the Anthropic adapter, different tool name — this
      // difference is exactly what the adapter exists to absorb.
      tools: [{ type: 'web_search' }],
      input: `${offerScanPrompt(request)} Reply with ONLY minified valid JSON with keys "deals" and "note", no markdown and no prose.`,
    });

    return parseOfferScan(OpenAiProvider.requireText(response));
  }
}
