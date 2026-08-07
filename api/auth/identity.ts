import type { UserId } from '../db/keys';

/**
 * Who is making this request.
 *
 * The single rule this module exists to enforce: **the user id comes from the
 * verified token and never from request input.** A route that took a user id
 * from a path, query or body would let any signed-in user read another user's
 * food log by editing a URL — and because every key in the table is derived
 * from this value, that would be a total isolation failure rather than a
 * partial one. DynamoDB has no row-level security to fall back on, so this
 * function is the boundary.
 */

export interface VerifiedClaims {
  /** Cognito subject — stable, opaque, and unique per user. */
  sub: string;
  email?: string;
  email_verified?: boolean;
  /** Seconds since epoch. */
  exp?: number;
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Turn verified claims into the identity the data layer accepts. The branded
 * type means a raw string cannot be passed to a repository by mistake — the
 * only way to obtain a `UserId` is to come through here.
 */
export function userIdFromClaims(claims: VerifiedClaims): UserId {
  const sub = claims.sub?.trim();
  if (!sub) {
    throw new UnauthorizedError('Token has no subject claim');
  }
  // A `#` would let a crafted subject escape its partition and address another
  // user's items. Cognito subs are UUIDs, so this can only be a forged token or
  // a future identity provider with a looser format.
  if (sub.includes('#')) {
    throw new UnauthorizedError('Token subject contains a reserved character');
  }
  return sub as UserId;
}

/** Email verification is required before any data is written (PLAN §8). */
export function requireVerifiedEmail(claims: VerifiedClaims): void {
  if (claims.email_verified === false) {
    throw new UnauthorizedError('Email address is not verified');
  }
}
