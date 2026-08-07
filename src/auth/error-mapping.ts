import { t } from '@/content/strings';
import { AuthError, type AuthErrorCode } from './types';

/**
 * Translate a provider error into one of Vire's codes.
 *
 * Kept separate from the adapter and tested directly, because this mapping is
 * where a wrong guess produces the worst user experience in the app: an
 * invite-only refusal shown as "something went wrong" leaves someone retyping a
 * correct password forever.
 */

/** Cognito's own error names, which arrive as `error.name`. */
const BY_NAME: Record<string, AuthErrorCode> = {
  NotAuthorizedException: 'wrong_credentials',
  UserNotFoundException: 'wrong_credentials', // never confirm an address exists
  UsernameExistsException: 'email_taken',
  UserNotConfirmedException: 'unverified',
  InvalidPasswordException: 'weak_password',
  CodeMismatchException: 'wrong_code',
  ExpiredCodeException: 'expired_code',
  TooManyRequestsException: 'rate_limited',
  LimitExceededException: 'rate_limited',
  TooManyFailedAttemptsException: 'rate_limited',
  NetworkError: 'network',
  // Deliberately NOT mapped: InvalidParameterException. Cognito raises it for a
  // range of request problems — a password rejected by the pool policy, a
  // malformed code, a missing attribute — so calling it an email problem tells
  // someone to fix a field that may not even be on screen.
};

/**
 * The pre-sign-up trigger refuses non-allowlisted addresses by throwing, and
 * Cognito surfaces that as a generic `UserLambdaValidationException` carrying
 * the message text. Matching on our own sentence is the only signal available.
 *
 * The trigger throws `t.auth.errors.inviteOnly` verbatim, and a test asserts
 * this pattern matches that string — so the two cannot drift apart silently.
 */
export const INVITE_ONLY_MARKER = /invite-only/i;

export function mapAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;

  const name = typeof error === 'object' && error !== null ? String((error as Error).name) : '';
  const message =
    typeof error === 'object' && error !== null ? String((error as Error).message ?? '') : '';

  if (INVITE_ONLY_MARKER.test(message)) {
    return new AuthError('invite_only', t.auth.errors.inviteOnly, error);
  }

  const code = BY_NAME[name] ?? 'unknown';
  return new AuthError(code, messageFor(code), error);
}

/** The copy shown for each code — all of it from the strings module. */
export function messageFor(code: AuthErrorCode): string {
  switch (code) {
    case 'invite_only':
      return t.auth.errors.inviteOnly;
    case 'google_unavailable':
      return t.auth.errors.googleUnavailable;
    case 'wrong_credentials':
      return t.auth.errors.wrongPassword;
    case 'email_taken':
      return t.auth.errors.emailTaken;
    case 'unverified':
      return t.auth.errors.unverified;
    case 'weak_password':
      return t.auth.errors.password;
    case 'invalid_email':
      return t.auth.errors.email;
    case 'wrong_code':
      return t.auth.errors.wrongCode;
    case 'expired_code':
      return t.auth.errors.expiredCode;
    case 'rate_limited':
      return t.auth.errors.rateLimited;
    case 'network':
      return t.auth.errors.network;
    case 'unknown':
      return t.auth.errors.generic;
  }
}
