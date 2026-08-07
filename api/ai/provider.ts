import { AnthropicProvider, ANTHROPIC_DEFAULT_MODEL } from './anthropic-provider';
import { OpenAiProvider, OPENAI_DEFAULT_MODEL } from './openai-provider';
import { OfferScanUnsupportedError, type AiProvider } from './types';

/**
 * Provider selection (PLAN §3a).
 *
 * Which vendor and model Vire uses is configuration, not code. `AI_PROVIDER`
 * and `AI_MODEL` pick the generation provider; `AI_PROVIDER_OFFERS` may name a
 * different one, because the offer scan needs live web search and the
 * generation path does not. That split is what makes Bedrock usable at all: it
 * can generate plans on an AWS-native bill with no separate key, but it has no
 * web-search tool, so offers must stay with a provider that does.
 */

export const PROVIDER_IDS = ['anthropic', 'openai', 'bedrock'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Providers that can run the offer scan (i.e. have live web search). */
export const WEB_SEARCH_PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai'];

export interface ProviderEnv {
  AI_PROVIDER?: string | undefined;
  AI_MODEL?: string | undefined;
  AI_PROVIDER_OFFERS?: string | undefined;
  ANTHROPIC_API_KEY?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
}

export function parseProviderId(value: string | undefined, fallback: ProviderId): ProviderId {
  if (!value) return fallback;
  const candidate = value.trim().toLowerCase();
  const match = PROVIDER_IDS.find((id) => id === candidate);
  if (!match) {
    // Failing loudly beats silently running on a different vendor than the
    // operator configured — and than the evals were run against.
    throw new Error(`Unknown AI_PROVIDER "${value}". Expected one of: ${PROVIDER_IDS.join(', ')}.`);
  }
  return match;
}

export const defaultModelFor = (provider: ProviderId): string =>
  provider === 'openai' ? OPENAI_DEFAULT_MODEL : ANTHROPIC_DEFAULT_MODEL;

export function canScanOffers(provider: ProviderId): boolean {
  return WEB_SEARCH_PROVIDERS.includes(provider);
}

function build(provider: ProviderId, model: string, env: ProviderEnv): AiProvider {
  switch (provider) {
    case 'anthropic': {
      const key = env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
      return AnthropicProvider.fromApiKey(key, model);
    }
    case 'openai': {
      const key = env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY is not set');
      return OpenAiProvider.fromApiKey(key, model);
    }
    case 'bedrock':
      // The adapter slot exists and the plan records the trade-off; there is no
      // implementation yet, and pretending otherwise would fail at runtime in
      // production instead of here at startup.
      throw new Error(
        'The Bedrock adapter is not implemented yet. It can serve generation ' +
          '(AWS-native billing, no separate key) but never the offer scan, which ' +
          'needs live web search.',
      );
  }
}

/**
 * Defer construction until the first call.
 *
 * `build` throws on a missing key or an unknown provider id, which is the right
 * behaviour — but not at container start: /health is the first thing you check
 * when a stage looks wrong, and it has to answer even when the AI configuration
 * is what's wrong. This way a bad key fails the routes that generate, and
 * nothing else.
 */
export function lazyProvider(build: () => AiProvider): AiProvider {
  let cached: AiProvider | undefined;
  const resolve = (): AiProvider => (cached ??= build());
  return {
    get name() {
      return resolve().name;
    },
    get model() {
      return resolve().model;
    },
    generateDay: (config) => resolve().generateDay(config),
    scanOffers: (request) => resolve().scanOffers(request),
  };
}

/** The provider used to generate plans. */
export function generationProvider(env: ProviderEnv): AiProvider {
  const id = parseProviderId(env.AI_PROVIDER, 'anthropic');
  return build(id, env.AI_MODEL?.trim() || defaultModelFor(id), env);
}

/**
 * The provider used to scan offers — `AI_PROVIDER_OFFERS` if set, otherwise the
 * generation provider. Rejected up front if it cannot search the web, so the
 * failure is a clear configuration error rather than an offer list that looks
 * convincingly empty.
 */
export function offerProvider(env: ProviderEnv): AiProvider {
  const generationId = parseProviderId(env.AI_PROVIDER, 'anthropic');
  const id = parseProviderId(env.AI_PROVIDER_OFFERS, generationId);
  if (!canScanOffers(id)) throw new OfferScanUnsupportedError(id);
  // The model override belongs to the generation provider; a different offer
  // provider takes its own default rather than a model id it may not have.
  const model =
    id === generationId ? env.AI_MODEL?.trim() || defaultModelFor(id) : defaultModelFor(id);
  return build(id, model, env);
}
