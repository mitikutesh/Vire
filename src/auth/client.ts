import { CognitoAuthClient, configureCognito } from './cognito-client';
import { FakeAuthClient } from './fake-client';
import type { AuthClient } from './types';

/**
 * Pick an auth implementation from the build-time configuration.
 *
 * With a user pool configured, real Cognito. Without one — before the first
 * deploy, or on a local `npm run dev` — the in-memory fake, so the app is
 * usable end to end without an AWS account.
 *
 * The fake is refused in a production build even if configuration is missing:
 * silently shipping an app where anyone can invent an account would be far worse
 * than failing to start.
 */
export function createAuthClient(): AuthClient {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

  if (userPoolId && userPoolClientId) {
    configureCognito({
      userPoolId,
      userPoolClientId,
      ...(import.meta.env.VITE_COGNITO_OAUTH_DOMAIN
        ? {
            oauthDomain: import.meta.env.VITE_COGNITO_OAUTH_DOMAIN,
            redirectUrl: window.location.origin,
          }
        : {}),
    });
    return new CognitoAuthClient();
  }

  if (import.meta.env.PROD) {
    throw new Error(
      'Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and ' +
        'VITE_COGNITO_CLIENT_ID at build time (SST injects both).',
    );
  }

  console.warn(
    '[vire] No Cognito configuration found — using the in-memory auth fake. ' +
      'Accounts live only in this tab. Allowlisted address: owner@example.com',
  );
  return new FakeAuthClient({ allowlist: 'owner@example.com' });
}
