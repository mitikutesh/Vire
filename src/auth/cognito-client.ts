import { Amplify } from 'aws-amplify';
import {
  confirmResetPassword,
  confirmSignUp as amplifyConfirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn as amplifySignIn,
  signInWithRedirect,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
} from 'aws-amplify/auth';
import { mapAuthError } from './error-mapping';
import { AuthError, type AuthClient, type AuthUser, type SignUpOutcome } from './types';

/**
 * Cognito-backed auth.
 *
 * A thin translation layer only: every provider error goes through
 * `mapAuthError`, so screens never see vendor error shapes, and every method
 * returns the port's types. Amplify is used rather than hand-rolled Cognito
 * calls because token refresh and the PKCE redirect are easy to get subtly
 * wrong and expensive to get wrong.
 *
 * Tokens are held by Amplify, not in a cookie, which is what lets the same build
 * run inside the Capacitor shell in M6 (PLAN §2.2).
 *
 * NOTE: unverified against a live user pool — no stage has been deployed yet.
 * The behaviour the screens rely on is covered by FakeAuthClient; this file is
 * reviewed code, not tested code, until the first deploy.
 */

export interface CognitoConfig {
  userPoolId: string;
  userPoolClientId: string;
  /** Hosted-UI domain, required only for Google sign-in. */
  oauthDomain?: string;
  redirectUrl?: string;
}

export function configureCognito(config: CognitoConfig): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        ...(config.oauthDomain && config.redirectUrl
          ? {
              loginWith: {
                oauth: {
                  domain: config.oauthDomain,
                  scopes: ['email', 'openid', 'profile'],
                  redirectSignIn: [config.redirectUrl],
                  redirectSignOut: [config.redirectUrl],
                  responseType: 'code', // authorization code + PKCE
                },
              },
            }
          : {}),
      },
    },
  });
}

export class CognitoAuthClient implements AuthClient {
  async currentUser(): Promise<AuthUser | null> {
    try {
      const user = await getCurrentUser();
      return { userId: user.userId, email: user.signInDetails?.loginId ?? user.username };
    } catch {
      // Not signed in is the normal case on first load, not an error.
      return null;
    }
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    try {
      const result = await amplifySignIn({ username: email, password });
      if (!result.isSignedIn) {
        // Any further step (confirmation, new password, MFA) is not configured
        // for this pool, so reaching here means the account is unconfirmed.
        throw new AuthError('unverified', 'Sign-in needs another step');
      }
      const user = await this.currentUser();
      if (!user) throw new AuthError('unknown', 'Signed in but no user available');
      return user;
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async signUp(email: string, password: string): Promise<SignUpOutcome> {
    try {
      const result = await amplifySignUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
      return result.isSignUpComplete ? { status: 'confirmed' } : { status: 'needs_confirmation' };
    } catch (error) {
      // The pre-sign-up trigger's refusal arrives here as a Lambda validation
      // error; mapAuthError recognises it and returns `invite_only`.
      throw mapAuthError(error);
    }
  }

  async confirmSignUp(email: string, code: string): Promise<void> {
    try {
      await amplifyConfirmSignUp({ username: email, confirmationCode: code });
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async resendConfirmation(email: string): Promise<void> {
    try {
      await resendSignUpCode({ username: email });
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
      await resetPassword({ username: email });
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async signInWithGoogle(): Promise<void> {
    try {
      await signInWithRedirect({ provider: 'Google' });
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async signOut(): Promise<void> {
    await amplifySignOut();
  }

  async accessToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken.toString() ?? null;
    } catch {
      return null;
    }
  }
}
