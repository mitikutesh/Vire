/**
 * The auth port.
 *
 * Screens depend on this interface rather than on Cognito, for the same reason
 * the data layer has a port: the flows can then be exercised against a fake —
 * every validation message, error path and state transition — without a
 * deployed user pool. Only the thin adapter that talks to Cognito stays
 * unverified until a stage exists.
 */

export interface AuthUser {
  /** Cognito subject. The server derives every storage key from this. */
  userId: string;
  email: string;
}

/**
 * Why an auth attempt failed, in terms the UI can act on.
 *
 * A closed set rather than raw provider errors: screens must not have to pattern
 * match on vendor message text, and the invite-only case in particular needs to
 * be distinguishable so it can be explained instead of looking like a typo.
 */
export type AuthErrorCode =
  | 'invite_only'
  | 'google_unavailable'
  | 'wrong_credentials'
  | 'email_taken'
  | 'unverified'
  | 'weak_password'
  | 'invalid_email'
  | 'expired_code'
  | 'wrong_code'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'AuthError';
  }
}

/** What a sign-up needs next before the account can be used. */
export type SignUpOutcome = { status: 'confirmed' } | { status: 'needs_confirmation' };

export interface AuthClient {
  /** The signed-in user, or null. Called on load to restore a session. */
  currentUser(): Promise<AuthUser | null>;

  signIn(email: string, password: string): Promise<AuthUser>;

  /**
   * Create an account. Rejects with `invite_only` when the address is not on
   * the owner's allowlist — the pre-sign-up trigger refuses it server-side, so
   * this is the client learning about a decision it cannot make itself.
   */
  signUp(email: string, password: string): Promise<SignUpOutcome>;

  /** Complete sign-up with the emailed code. */
  confirmSignUp(email: string, code: string): Promise<void>;
  resendConfirmation(email: string): Promise<void>;

  /** Start a password reset; the user receives a code by email. */
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void>;

  /** Redirect to Google. Returns only if the redirect could not start. */
  signInWithGoogle(): Promise<void>;

  signOut(): Promise<void>;

  /** A current access token for API calls, or null when signed out. */
  accessToken(): Promise<string | null>;
}
