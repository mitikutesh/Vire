import { Resource } from 'sst';
// Shared with the client's fake auth, so the invite-only behaviour the screens
// are tested against is the behaviour this trigger actually enforces.
import { isAllowed, parseAllowlist } from '@/domain/allowlist';

/**
 * Cognito pre-sign-up trigger: the gate that makes this Vire invite-only.
 *
 * Runs for email/password sign-up *and* for a federated first sign-in, so
 * Google sign-in cannot walk around it.
 *
 * Only the shape Vire reads is typed; the full Cognito event is much larger and
 * pinning all of it would just be noise.
 */
interface PreSignUpEvent {
  triggerSource: string;
  request: { userAttributes: Record<string, string | undefined> };
  response: {
    autoConfirmUser?: boolean;
    autoVerifyEmail?: boolean;
  };
}

export async function handler(event: PreSignUpEvent): Promise<PreSignUpEvent> {
  const email = event.request.userAttributes['email'] ?? '';
  const allowlist = parseAllowlist(Resource.SignupAllowlist.value);

  if (!isAllowed(email, allowlist)) {
    // Cognito surfaces this message to the client, so it says what to do next
    // rather than leaking whether the address is known.
    throw new Error('This Vire is invite-only — ask the owner to add your email.');
  }

  // Google has already verified the address; re-verifying it by email would ask
  // the user to prove something the identity provider just proved.
  if (event.triggerSource === 'PreSignUp_ExternalProvider') {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }

  return event;
}
