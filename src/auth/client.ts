import { CognitoAuthClient, configureCognito } from './cognito-client';
import { FakeAuthClient } from './fake-client';
import type { AuthClient } from './types';

/**
 * Pick an auth implementation from the build-time configuration.
 *
 * With a user pool configured, real Cognito. In development, or when a build
 * explicitly asks for it with `VITE_AUTH_MODE=fake`, the in-memory fake — so the
 * app is usable, and end-to-end testable, before any AWS account exists.
 *
 * The fake is never reached by accident in a real build: a production build with
 * neither a user pool nor the explicit opt-in throws, because shipping an app
 * where anyone can invent an account would be worse than failing loudly.
 */

const wantsFake = (): boolean => import.meta.env.VITE_AUTH_MODE === 'fake';

const cognitoConfigured = (): boolean =>
  Boolean(import.meta.env.VITE_COGNITO_USER_POOL_ID && import.meta.env.VITE_COGNITO_CLIENT_ID);

/**
 * Whether "Continue with Google" can work at all.
 *
 * Google needs a Cognito hosted-UI domain, a Google identity provider on the
 * pool, and registered callback URLs — none of which exist yet (see BACKLOG
 * E1.3). The button is hidden rather than shown-and-broken: a button that
 * silently does nothing is worse than no button, and that is exactly what the
 * dev fake produced before this was gated.
 */
export const googleSignInAvailable = (): boolean =>
  cognitoConfigured() && Boolean(import.meta.env.VITE_COGNITO_OAUTH_DOMAIN);

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

  if (!import.meta.env.DEV && !wantsFake()) {
    throw new Error(
      'Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and ' +
        'VITE_COGNITO_CLIENT_ID at build time (SST injects both), or build with ' +
        'VITE_AUTH_MODE=fake for a demo build with in-memory accounts.',
    );
  }

  // Development: registration is open by default, because the allowlist exists
  // to protect a real AI budget and there is none here. Set VITE_DEV_ALLOWLIST
  // to exercise the invite-only path locally.
  const devAllowlist = import.meta.env.VITE_DEV_ALLOWLIST?.trim();

  console.warn(
    devAllowlist
      ? `[vire] In-memory auth fake — accounts live only in this tab and are lost on reload. Allowed: ${devAllowlist}`
      : '[vire] In-memory auth fake — accounts live only in this tab and are lost on reload. Any email address may register; set VITE_DEV_ALLOWLIST to test the invite-only path.',
  );

  return new FakeAuthClient(devAllowlist ? { allowlist: devAllowlist } : { allowAll: true });
}
