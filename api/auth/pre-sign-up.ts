import { Resource } from 'sst';
// Shared with the client's fake auth, so the invite-only behaviour the screens
// are tested against is the behaviour this trigger actually enforces.
import { isAllowed, parseAllowlist } from '@/domain/allowlist';
// The refusal message is the *only* signal the client has for telling an
// invite-only rejection apart from a generic failure, so it comes from the
// shared strings module rather than being retyped here.
import { t } from '@/content/strings';

/**
 * Cognito pre-sign-up trigger: the gate that makes this Vire invite-only.
 *
 * Runs for email/password sign-up *and* for a federated first sign-in, so
 * Google sign-in cannot walk around it.
 *
 * Only the shape Vire reads is typed; the full Cognito event is much larger and
 * pinning all of it would just be noise.
 */
export interface PreSignUpEvent {
  triggerSource: string;
  request: { userAttributes: Record<string, string | undefined> };
  response: {
    autoConfirmUser?: boolean;
    autoVerifyEmail?: boolean;
  };
}

/** Extracted so the decision can be tested without a Cognito event. */
export function decide(event: PreSignUpEvent, allowlistRaw: string | undefined): PreSignUpEvent {
  const email = event.request.userAttributes['email'] ?? '';

  if (!isAllowed(email, parseAllowlist(allowlistRaw))) {
    // Cognito surfaces this message to the client, which matches on it to show
    // a real explanation instead of "something went wrong".
    throw new Error(t.auth.errors.inviteOnly);
  }

  // Google has already verified the address; re-verifying it by email would ask
  // the user to prove something the identity provider just proved.
  if (event.triggerSource === 'PreSignUp_ExternalProvider') {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }

  return event;
}

export async function handler(event: PreSignUpEvent): Promise<PreSignUpEvent> {
  return decide(event, Resource.SignupAllowlist.value);
}
