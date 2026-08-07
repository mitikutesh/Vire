import type { UserId } from '../db/keys';

/**
 * Deleting the account itself, as opposed to the data under it (I6).
 *
 * A port for the same reason as the token verifier: the deletion route's
 * ordering and confirmation logic is the part worth testing, and it should be
 * testable without an AWS account or a real user pool.
 */
export interface IdentityAdmin {
  /**
   * Remove the user from the identity provider. Must be idempotent — a retry
   * after a partial failure has to be able to finish the job.
   */
  deleteUser(userId: UserId): Promise<void>;
}

/**
 * Cognito's admin delete, loaded lazily.
 *
 * The SDK client is imported inside the call rather than at module scope: this is
 * the only route that needs it, and every other request would otherwise pay for
 * parsing it on a cold start.
 */
export class CognitoIdentityAdmin implements IdentityAdmin {
  constructor(private readonly userPoolId: string) {}

  async deleteUser(userId: UserId): Promise<void> {
    const { CognitoIdentityProviderClient, AdminDeleteUserCommand, UserNotFoundException } =
      await import('@aws-sdk/client-cognito-identity-provider');

    const client = new CognitoIdentityProviderClient({});
    try {
      await client.send(
        // The Cognito subject is the username for a pool configured with email
        // aliases, which is how `userIdFromClaims` produced this id.
        new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: userId }),
      );
    } catch (error) {
      // Already gone is the desired end state, not a failure: a retry after a
      // half-finished deletion must be able to complete.
      if (error instanceof UserNotFoundException) return;
      throw error;
    }
  }
}

/** For tests and for a stage with no user pool. */
export class MemoryIdentityAdmin implements IdentityAdmin {
  readonly deleted: UserId[] = [];
  constructor(private readonly failWith?: Error) {}

  async deleteUser(userId: UserId): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.deleted.push(userId);
  }
}
