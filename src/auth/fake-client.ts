import { isAllowed, parseAllowlist } from '@/domain/allowlist';
import { AuthError, type AuthClient, type AuthUser, type SignUpOutcome } from './types';

/**
 * In-memory auth, for tests and for `npm run dev` before a user pool exists.
 *
 * It reuses the *same* allowlist function the Cognito pre-sign-up trigger runs,
 * so the invite-only behaviour the screens are tested against is the behaviour
 * the server actually enforces — not a second implementation that agrees today
 * and drifts tomorrow.
 */

interface FakeAccount {
  email: string;
  password: string;
  confirmed: boolean;
  code: string;
}

export interface FakeAuthOptions {
  /** Comma- or whitespace-separated, as the deployed secret is. */
  allowlist?: string;
  /**
   * Let any address register. Used in development, where the allowlist protects
   * nothing: there is no AI budget and no real data behind the fake. Kept as an
   * explicit flag rather than by weakening `isAllowed`, whose deny-on-empty
   * behaviour is a deliberate, tested security property.
   */
  allowAll?: boolean;
  /** Start already signed in — useful for testing session restore. */
  signedInAs?: string;
  /** Fixed code, so tests do not have to read it out of the fake. */
  code?: string;
}

export class FakeAuthClient implements AuthClient {
  private readonly accounts = new Map<string, FakeAccount>();
  private readonly allowlist: string[];
  private readonly allowAll: boolean;
  private readonly code: string;
  private current: AuthUser | null = null;

  constructor(options: FakeAuthOptions = {}) {
    this.allowAll = options.allowAll ?? false;
    this.allowlist = parseAllowlist(options.allowlist ?? 'owner@example.com');
    this.code = options.code ?? '123456';
    if (options.signedInAs) {
      const email = options.signedInAs.toLowerCase();
      this.accounts.set(email, {
        email,
        password: 'restored-session',
        confirmed: true,
        code: this.code,
      });
      this.current = { userId: `sub-${email}`, email };
    }
  }

  async currentUser(): Promise<AuthUser | null> {
    return this.current;
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const account = this.accounts.get(email.trim().toLowerCase());
    // Deliberately the same error whether the account is missing or the password
    // is wrong: confirming which addresses exist is an information leak.
    if (!account || account.password !== password) {
      throw new AuthError('wrong_credentials', 'Wrong email or password');
    }
    if (!account.confirmed) {
      throw new AuthError('unverified', 'Email not confirmed');
    }
    this.current = { userId: `sub-${account.email}`, email: account.email };
    return this.current;
  }

  async signUp(email: string, password: string): Promise<SignUpOutcome> {
    const normalized = email.trim().toLowerCase();
    if (!this.allowAll && !isAllowed(normalized, this.allowlist)) {
      throw new AuthError('invite_only', 'This Vire is invite-only');
    }
    if (this.accounts.has(normalized)) {
      throw new AuthError('email_taken', 'Account already exists');
    }
    this.accounts.set(normalized, {
      email: normalized,
      password,
      confirmed: false,
      code: this.code,
    });
    return { status: 'needs_confirmation' };
  }

  async confirmSignUp(email: string, code: string): Promise<void> {
    const account = this.accounts.get(email.trim().toLowerCase());
    if (!account) throw new AuthError('unknown', 'No such account');
    if (code !== account.code) throw new AuthError('wrong_code', 'Wrong code');
    account.confirmed = true;
  }

  async resendConfirmation(email: string): Promise<void> {
    if (!this.accounts.has(email.trim().toLowerCase())) {
      throw new AuthError('unknown', 'No such account');
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    // Succeeds whether or not the account exists, matching Cognito: a different
    // answer would let anyone enumerate addresses.
    void email;
  }

  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    const account = this.accounts.get(email.trim().toLowerCase());
    if (!account) throw new AuthError('unknown', 'No such account');
    if (code !== account.code) throw new AuthError('wrong_code', 'Wrong code');
    account.password = newPassword;
    account.confirmed = true;
  }

  async signInWithGoogle(): Promise<void> {
    // The fake cannot perform an OAuth redirect. Saying so beats the previous
    // behaviour of quietly succeeding, which made the button look broken.
    throw new AuthError('google_unavailable', 'Google sign-in needs a deployed user pool');
  }

  async signOut(): Promise<void> {
    this.current = null;
  }

  async accessToken(): Promise<string | null> {
    return this.current ? `fake-token-for-${this.current.userId}` : null;
  }
}
