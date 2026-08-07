import type { AuthClient } from '@/auth/types';
import { HttpVireApi } from './http-api';
import { MemoryVireApi } from './memory-api';
import type { VireApi } from './types';

/**
 * Pick an API implementation from the build-time configuration.
 *
 * Mirrors `createAuthClient`: a configured base URL means the real Lambda,
 * otherwise the in-memory API so development works before a deploy. A built
 * bundle with no base URL and no explicit fake opt-in throws, rather than
 * silently keeping a user's health data in a tab that loses it on reload.
 */
export function createVireApi(auth: AuthClient): VireApi {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const fakeMode = import.meta.env.VITE_AUTH_MODE === 'fake';

  // Fake mode means "no backend", and it wins over a base URL. Otherwise a
  // leftover VITE_API_BASE_URL in someone's .env would silently point a
  // self-contained demo or e2e build at a server that is not running.
  if (baseUrl && !fakeMode) {
    return new HttpVireApi(baseUrl.replace(/\/$/, ''), () => auth.accessToken());
  }

  if (!import.meta.env.DEV && !fakeMode) {
    throw new Error(
      'VITE_API_BASE_URL is not set. SST injects it at build time; for a demo ' +
        'build without a backend, build with VITE_AUTH_MODE=fake.',
    );
  }

  console.warn(
    '[vire] No API base URL — using the in-memory API. Your profile lives in ' +
      'this tab only and is lost on reload.',
  );
  return new MemoryVireApi();
}
