import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { UnauthorizedError, type VerifiedClaims } from './identity';

/**
 * Token verification.
 *
 * A port, so routes can be tested without a user pool and without minting real
 * JWTs. The rule that matters is downstream of here: the verified subject is the
 * only source of the storage partition key, so a route that skipped verification
 * would hand an attacker any user's data (see ./identity.ts).
 */
export interface TokenVerifier {
  verify(token: string): Promise<VerifiedClaims>;
}

/** Reads the bearer token out of an Authorization header. */
export function bearerToken(header: string | undefined | null): string {
  const value = header?.trim() ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(value);
  const token = match?.[1]?.trim();
  if (!token) throw new UnauthorizedError('Missing bearer token');
  return token;
}

/**
 * Cognito verification: checks the signature against the pool's JWKS, the
 * issuer, the audience and the expiry. Signature checking is the whole point —
 * claims from an unverified token are attacker-controlled input.
 */
export class CognitoTokenVerifier implements TokenVerifier {
  private readonly verifier: ReturnType<typeof CognitoJwtVerifier.create>;

  constructor(userPoolId: string, clientId: string) {
    this.verifier = CognitoJwtVerifier.create({
      userPoolId,
      clientId,
      // Access tokens are what the browser sends on API calls.
      tokenUse: 'access',
    });
  }

  async verify(token: string): Promise<VerifiedClaims> {
    try {
      const payload = await this.verifier.verify(token);
      return {
        sub: String(payload.sub),
        ...(typeof payload['email'] === 'string' ? { email: payload['email'] } : {}),
        ...(typeof payload.exp === 'number' ? { exp: payload.exp } : {}),
      };
    } catch {
      // Never echo the provider's reason: it distinguishes "expired" from
      // "wrong signature", which is more than a caller needs to know. Not logged
      // either — rejected tokens are routine, and logging each one would bury
      // real failures.
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}
