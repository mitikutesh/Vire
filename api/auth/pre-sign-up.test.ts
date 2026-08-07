// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { t } from '@/content/strings';
import { INVITE_ONLY_MARKER } from '@/auth/error-mapping';
import { decide, type PreSignUpEvent } from './pre-sign-up';

const event = (email: string, triggerSource = 'PreSignUp_SignUp'): PreSignUpEvent => ({
  triggerSource,
  request: { userAttributes: { email } },
  response: {},
});

describe('pre-sign-up trigger', () => {
  it('admits an allowlisted address', () => {
    expect(() => decide(event('owner@example.com'), 'owner@example.com')).not.toThrow();
  });

  it('refuses anyone else', () => {
    expect(() => decide(event('stranger@example.com'), 'owner@example.com')).toThrow();
  });

  it('fails closed when the allowlist secret is missing', () => {
    // A misconfigured secret must not become an open registration endpoint
    // attached to a paid AI key.
    expect(() => decide(event('anyone@example.com'), undefined)).toThrow();
    expect(() => decide(event('anyone@example.com'), '')).toThrow();
  });

  it('admits a whole domain when configured that way', () => {
    expect(() => decide(event('someone@visma.com'), '@visma.com')).not.toThrow();
    expect(() => decide(event('someone@elsewhere.com'), '@visma.com')).toThrow();
  });

  /**
   * The load-bearing test. Cognito wraps this throw in a generic Lambda
   * validation error, so the client can only recognise an invite-only refusal by
   * matching the message text. If the wording here and the client's pattern ever
   * drift, a refused invitee sees "Something went wrong" — precisely the failure
   * this whole path exists to avoid.
   */
  it('throws the exact message the client matches on', () => {
    let thrown: unknown;
    try {
      decide(event('stranger@example.com'), 'owner@example.com');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(t.auth.errors.inviteOnly);
    expect(INVITE_ONLY_MARKER.test((thrown as Error).message)).toBe(true);
  });

  it('auto-confirms a federated first sign-in', () => {
    // Google has already verified the address; asking the user to confirm it by
    // email would be asking them to prove what the provider just proved.
    const result = decide(
      event('owner@example.com', 'PreSignUp_ExternalProvider'),
      'owner@example.com',
    );
    expect(result.response.autoConfirmUser).toBe(true);
    expect(result.response.autoVerifyEmail).toBe(true);
  });

  it('does not auto-confirm an ordinary email sign-up', () => {
    const result = decide(event('owner@example.com'), 'owner@example.com');
    expect(result.response.autoConfirmUser).toBeUndefined();
  });

  it('refuses a federated sign-in from outside the allowlist too', () => {
    // Google sign-in must not be a way around the gate.
    expect(() =>
      decide(event('stranger@example.com', 'PreSignUp_ExternalProvider'), 'owner@example.com'),
    ).toThrow();
  });

  it('refuses an event with no email attribute', () => {
    expect(() => decide(event(''), 'owner@example.com')).toThrow();
  });
});
