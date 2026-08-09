import type { UserId } from '../db/keys';
import type { VireStore } from '../db/store';
import { providerForKey } from './provider';
import type { AiProvider } from './types';

/**
 * Resolving the caller's own AI provider (E7.6).
 *
 * A function rather than a provider instance, because there is no longer one
 * provider for the deployment — there is one per user, or none. `null` means the
 * caller has not set a key, which is a normal state rather than an error: the app
 * works on the built-in starter week without one.
 */
export type ProviderForUser = (userId: UserId) => Promise<AiProvider | null>;

/**
 * The real resolver: read the caller's stored key, build a client from it.
 *
 * Nothing is cached. A per-user cache would mean holding other people's
 * credentials in memory between requests, and the client construction it would
 * save is a constructor call, not a network round trip.
 */
export function storedKeyProvider(
  store: VireStore,
  env: { AI_MODEL?: string | undefined } = {},
): ProviderForUser {
  return async (userId) => {
    const entry = await store.getAiKey(userId);
    if (!entry) return null;
    return providerForKey(entry.provider, entry.key, env);
  };
}
