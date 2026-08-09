import { AnthropicProvider, ANTHROPIC_DEFAULT_MODEL } from './anthropic-provider';
import { OpenAiProvider, OPENAI_DEFAULT_MODEL } from './openai-provider';
import type { AiProvider } from './types';

/**
 * Provider selection (PLAN §3a, revised by E7.6).
 *
 * The vendor is no longer the deployment's choice: each user brings their own API
 * key, so the provider is whichever one that key belongs to. What remains
 * configurable is the model.
 *
 * Both user-selectable providers have a live web-search tool, so the offer scan
 * works on either. `canScanOffers` stays because Bedrock does not — it
 * authenticates by AWS role rather than by key, which is also why it cannot be
 * chosen here at all.
 */

export const PROVIDER_IDS = ['anthropic', 'openai', 'bedrock'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Providers that can run the offer scan (i.e. have live web search). */
export const WEB_SEARCH_PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai'];

/** The deployment's share of the AI configuration: the model, and nothing else. */
export interface ProviderEnv {
  AI_MODEL?: string | undefined;
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

/**
 * Build a provider from one user's own key (E7.6).
 *
 * Per request, not per container. The container-level `lazyProvider` existed to
 * avoid rebuilding one shared client on every call; with a key per user there is
 * nothing shared to cache, and caching per user would mean holding other people's
 * credentials in memory across requests for no gain.
 *
 * The model is the deployment's choice (`AI_MODEL`, or the provider's default);
 * the provider itself is the user's, because they know which key they pasted.
 */
export function providerForKey(
  provider: ProviderId,
  key: string,
  env: Pick<ProviderEnv, 'AI_MODEL'> = {},
): AiProvider {
  const model = env.AI_MODEL?.trim() || defaultModelFor(provider);
  switch (provider) {
    case 'anthropic':
      return AnthropicProvider.fromApiKey(key, model);
    case 'openai':
      return OpenAiProvider.fromApiKey(key, model);
    case 'bedrock':
      // Bedrock authenticates with the caller's AWS role, not an API key, so
      // "bring your own key" has nothing to bring. It was never implemented.
      throw new Error('Bedrock cannot be used with a user-supplied API key.');
  }
}
