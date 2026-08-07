import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/content/strings';
import { AuthView } from './AuthView';
import { FakeAuthClient } from './fake-client';
import { mapAuthError, messageFor } from './error-mapping';
import { AuthError } from './types';

const OWNER = 'owner@example.com';
const PASSWORD = 'correct horse';

function setup(client = new FakeAuthClient(), googleEnabled = false) {
  const onAuthed = vi.fn();
  render(<AuthView auth={client} onAuthed={onAuthed} googleEnabled={googleEnabled} />);
  return { client, onAuthed, user: userEvent.setup() };
}

const fill = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string | RegExp,
  value: string,
) => {
  await user.clear(screen.getByLabelText(label));
  await user.type(screen.getByLabelText(label), value);
};

describe('sign in', () => {
  it('opens on sign in with the Sprout mark and the wordmark', () => {
    setup();
    expect(screen.getByRole('heading', { name: t.auth.signInTitle })).toBeInTheDocument();
    expect(screen.getByText('Vire')).toBeInTheDocument();
  });

  it('signs an existing user in', async () => {
    const client = new FakeAuthClient();
    await client.signUp(OWNER, PASSWORD);
    await client.confirmSignUp(OWNER, '123456');

    const { onAuthed, user } = setup(client);
    await fill(user, t.auth.emailLabel, OWNER);
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signInAction }));

    expect(onAuthed).toHaveBeenCalledWith(expect.objectContaining({ email: OWNER }));
  });

  it('rejects an obvious typo before making a request', async () => {
    const client = new FakeAuthClient();
    const signIn = vi.spyOn(client, 'signIn');
    const { user } = setup(client);

    await fill(user, t.auth.emailLabel, 'not-an-email');
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signInAction }));

    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.email);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('requires a password of at least 8 characters', async () => {
    const { user } = setup();
    await fill(user, t.auth.emailLabel, OWNER);
    await fill(user, t.auth.passwordLabel, 'short');
    await user.click(screen.getByRole('button', { name: t.auth.signInAction }));
    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.password);
  });

  it('reports a wrong password without confirming the address exists', async () => {
    const client = new FakeAuthClient();
    await client.signUp(OWNER, PASSWORD);
    await client.confirmSignUp(OWNER, '123456');

    const { user } = setup(client);
    await fill(user, t.auth.emailLabel, OWNER);
    await fill(user, t.auth.passwordLabel, 'wrong password');
    await user.click(screen.getByRole('button', { name: t.auth.signInAction }));

    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.wrongPassword);
  });

  it('gives an unknown address the same answer as a wrong password', async () => {
    // Any difference here lets someone enumerate which addresses have accounts.
    const { user } = setup();
    await fill(user, t.auth.emailLabel, 'stranger@example.com');
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signInAction }));
    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.wrongPassword);
  });

  it('submits on Enter', async () => {
    const client = new FakeAuthClient();
    await client.signUp(OWNER, PASSWORD);
    await client.confirmSignUp(OWNER, '123456');
    const { onAuthed, user } = setup(client);

    await fill(user, t.auth.emailLabel, OWNER);
    await user.type(screen.getByLabelText(t.auth.passwordLabel), `${PASSWORD}{Enter}`);

    expect(onAuthed).toHaveBeenCalled();
  });
});

describe('invite-only registration', () => {
  it('explains the refusal instead of looking like a typo', async () => {
    // The worst possible UX here is a generic error: someone would retype a
    // correct password forever. The pre-sign-up trigger's refusal has to arrive
    // as its own message.
    const { user } = setup(new FakeAuthClient({ allowlist: OWNER }));
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    await fill(user, t.auth.emailLabel, 'stranger@example.com');
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signUpAction }));

    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.inviteOnly);
  });

  it('lets an allowlisted address through to the confirmation step', async () => {
    const { user } = setup(new FakeAuthClient({ allowlist: OWNER }));
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    await fill(user, t.auth.emailLabel, OWNER);
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signUpAction }));

    expect(screen.getByRole('heading', { name: t.auth.confirmTitle })).toBeInTheDocument();
    expect(screen.getByText(t.auth.verifySent)).toBeInTheDocument();
  });

  it('refuses a second account for the same address', async () => {
    const client = new FakeAuthClient({ allowlist: OWNER });
    await client.signUp(OWNER, PASSWORD);
    const { user } = setup(client);

    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    await fill(user, t.auth.emailLabel, OWNER);
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signUpAction }));

    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.emailTaken);
  });
});

describe('email confirmation', () => {
  const reachConfirmStep = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    await fill(user, t.auth.emailLabel, OWNER);
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signUpAction }));
  };

  it('signs the user straight in after a correct code', async () => {
    // They just proved the address; asking for the password again is friction
    // for no security gain, since it is still in state.
    const { onAuthed, user } = setup(new FakeAuthClient({ allowlist: OWNER, code: '654321' }));
    await reachConfirmStep(user);
    await fill(user, t.auth.codeLabel, '654321');
    await user.click(screen.getByRole('button', { name: t.auth.confirmAction }));

    expect(onAuthed).toHaveBeenCalledWith(expect.objectContaining({ email: OWNER }));
  });

  it('reports a wrong code and stays on the step', async () => {
    const { onAuthed, user } = setup(new FakeAuthClient({ allowlist: OWNER, code: '654321' }));
    await reachConfirmStep(user);
    await fill(user, t.auth.codeLabel, '111111');
    await user.click(screen.getByRole('button', { name: t.auth.confirmAction }));

    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.wrongCode);
    expect(onAuthed).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: t.auth.confirmTitle })).toBeInTheDocument();
  });

  it('accepts only digits in the code field', async () => {
    const { user } = setup(new FakeAuthClient({ allowlist: OWNER, code: '654321' }));
    await reachConfirmStep(user);
    await user.type(screen.getByLabelText(t.auth.codeLabel), '6a5b4c321');
    expect(screen.getByLabelText(t.auth.codeLabel)).toHaveValue('654321');
  });

  it('can send a new code', async () => {
    const client = new FakeAuthClient({ allowlist: OWNER });
    const resend = vi.spyOn(client, 'resendConfirmation');
    const { user } = setup(client);
    await reachConfirmStep(user);
    await user.click(screen.getByRole('button', { name: t.auth.resendCode }));
    expect(resend).toHaveBeenCalledWith(OWNER);
  });
});

describe('password reset', () => {
  it('walks from request to a new password and signs in', async () => {
    const client = new FakeAuthClient({ allowlist: OWNER, code: '999888' });
    await client.signUp(OWNER, 'old password');
    await client.confirmSignUp(OWNER, '999888');

    const { onAuthed, user } = setup(client);
    await user.click(screen.getByRole('button', { name: t.auth.forgot }));
    await fill(user, t.auth.emailLabel, OWNER);
    await user.click(screen.getByRole('button', { name: t.auth.resetRequestAction }));

    expect(screen.getByText(t.auth.resetSent)).toBeInTheDocument();

    await fill(user, t.auth.codeLabel, '999888');
    await fill(user, t.auth.newPasswordLabel, 'brand new password');
    await user.click(screen.getByRole('button', { name: t.auth.resetConfirmAction }));

    expect(onAuthed).toHaveBeenCalledWith(expect.objectContaining({ email: OWNER }));
  });

  it('does not reveal whether the address has an account', async () => {
    // Cognito answers the same either way; the UI must not differ.
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: t.auth.forgot }));
    await fill(user, t.auth.emailLabel, 'stranger@example.com');
    await user.click(screen.getByRole('button', { name: t.auth.resetRequestAction }));

    expect(screen.getByText(t.auth.resetSent)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('still enforces the password minimum on the new password', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: t.auth.forgot }));
    await fill(user, t.auth.emailLabel, OWNER);
    await user.click(screen.getByRole('button', { name: t.auth.resetRequestAction }));
    await fill(user, t.auth.codeLabel, '123456');
    await fill(user, t.auth.newPasswordLabel, 'short');
    await user.click(screen.getByRole('button', { name: t.auth.resetConfirmAction }));

    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.password);
  });
});

describe('Google sign-in', () => {
  const googleButton = () => screen.queryByRole('button', { name: new RegExp(t.auth.google) });

  it('is hidden when Google is not configured', () => {
    // A button that silently does nothing is worse than no button — which is
    // exactly what the development fake produced before this was gated.
    setup(new FakeAuthClient(), false);
    expect(googleButton()).not.toBeInTheDocument();
  });

  it('asks the client to start the redirect when it is configured', async () => {
    const client = new FakeAuthClient();
    const redirect = vi.spyOn(client, 'signInWithGoogle').mockResolvedValue();
    const { user } = setup(client, true);
    await user.click(googleButton()!);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('explains itself rather than failing silently when it cannot work', async () => {
    // The fake cannot perform an OAuth redirect, so it says so.
    const { user } = setup(new FakeAuthClient(), true);
    await user.click(googleButton()!);
    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.googleUnavailable);
  });

  it('is offered on sign-up too', async () => {
    const { user } = setup(new FakeAuthClient(), true);
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    expect(googleButton()).toBeInTheDocument();
  });

  it('is not offered mid-confirmation, where it would abandon the flow', async () => {
    const { user } = setup(new FakeAuthClient({ allowlist: OWNER }), true);
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    await fill(user, t.auth.emailLabel, OWNER);
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signUpAction }));

    expect(googleButton()).not.toBeInTheDocument();
  });
});

describe('registration in development', () => {
  it('lets any address register when the fake is set to allow all', async () => {
    // What `npm run dev` uses: the allowlist exists to protect a real AI budget,
    // and there is none behind an in-memory fake. Being blocked by a hardcoded
    // `owner@example.com` was a genuine defect.
    const { onAuthed, user } = setup(new FakeAuthClient({ allowAll: true, code: '123456' }));
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    await fill(user, t.auth.emailLabel, 'mitiku@visma.com');
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signUpAction }));

    await fill(user, t.auth.codeLabel, '123456');
    await user.click(screen.getByRole('button', { name: t.auth.confirmAction }));

    expect(onAuthed).toHaveBeenCalledWith(expect.objectContaining({ email: 'mitiku@visma.com' }));
  });

  it('still enforces an allowlist when one is configured', async () => {
    const { user } = setup(new FakeAuthClient({ allowlist: OWNER }));
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    await fill(user, t.auth.emailLabel, 'stranger@example.com');
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signUpAction }));

    expect(screen.getByRole('alert')).toHaveTextContent(t.auth.errors.inviteOnly);
  });
});

describe('field hygiene across steps', () => {
  it('does not carry a typed password into the reset flow', async () => {
    // The bug: after a failed sign-in, "Forgot your password?" arrived with the
    // failing password pre-filled under "New password", so the user would reset
    // their password to the one that was already not working.
    const { user } = setup();
    await fill(user, t.auth.emailLabel, OWNER);
    await fill(user, t.auth.passwordLabel, 'the-old-password');
    await user.click(screen.getByRole('button', { name: t.auth.signInAction }));

    await user.click(screen.getByRole('button', { name: t.auth.forgot }));
    await user.click(screen.getByRole('button', { name: t.auth.resetRequestAction }));

    expect(screen.getByLabelText(t.auth.newPasswordLabel)).toHaveValue('');
  });

  it('does not carry a stale code between steps', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: t.auth.forgot }));
    await fill(user, t.auth.emailLabel, OWNER);
    await user.click(screen.getByRole('button', { name: t.auth.resetRequestAction }));
    await fill(user, t.auth.codeLabel, '424242');

    await user.click(screen.getByRole('button', { name: t.auth.backToSignIn }));
    await user.click(screen.getByRole('button', { name: t.auth.forgot }));
    await fill(user, t.auth.emailLabel, OWNER);
    await user.click(screen.getByRole('button', { name: t.auth.resetRequestAction }));

    expect(screen.getByLabelText(t.auth.codeLabel)).toHaveValue('');
  });

  it('keeps the password through the confirmation step, which needs it', async () => {
    // The one transition that must NOT clear it: confirming signs the user in.
    const { onAuthed, user } = setup(new FakeAuthClient({ allowAll: true, code: '111222' }));
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    await fill(user, t.auth.emailLabel, OWNER);
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signUpAction }));
    await fill(user, t.auth.codeLabel, '111222');
    await user.click(screen.getByRole('button', { name: t.auth.confirmAction }));

    expect(onAuthed).toHaveBeenCalled();
  });
});

describe('navigation', () => {
  it('switches between sign in and sign up', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    expect(screen.getByRole('heading', { name: t.auth.signUpTitle })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t.auth.switchToSignIn }));
    expect(screen.getByRole('heading', { name: t.auth.signInTitle })).toBeInTheDocument();
  });

  it('clears a stale error when changing step', async () => {
    const { user } = setup();
    await fill(user, t.auth.emailLabel, 'bad');
    await fill(user, t.auth.passwordLabel, PASSWORD);
    await user.click(screen.getByRole('button', { name: t.auth.signInAction }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.auth.switchToSignUp }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a way back from the reset flow', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: t.auth.forgot }));
    await user.click(screen.getByRole('button', { name: t.auth.backToSignIn }));
    expect(screen.getByRole('heading', { name: t.auth.signInTitle })).toBeInTheDocument();
  });
});

describe('session', () => {
  it('restores a signed-in user', async () => {
    const client = new FakeAuthClient({ signedInAs: OWNER });
    expect(await client.currentUser()).toEqual(expect.objectContaining({ email: OWNER }));
    expect(await client.accessToken()).toContain('sub-owner@example.com');
  });

  it('clears the session and the token on sign out', async () => {
    const client = new FakeAuthClient({ signedInAs: OWNER });
    await client.signOut();
    expect(await client.currentUser()).toBeNull();
    expect(await client.accessToken()).toBeNull();
  });

  it('reports no user when never signed in', async () => {
    expect(await new FakeAuthClient().currentUser()).toBeNull();
  });
});

describe('provider error mapping', () => {
  it('recognises the invite-only refusal from the pre-sign-up trigger', () => {
    // Cognito wraps the trigger's throw in a generic Lambda validation error, so
    // the message text is the only signal. The trigger's wording and this
    // pattern must stay in step — both are asserted, here and in its own test.
    const cognitoError = Object.assign(
      new Error(
        'PreSignUp failed with error This Vire is invite-only — ask the owner to add your email.',
      ),
      {
        name: 'UserLambdaValidationException',
      },
    );
    expect(mapAuthError(cognitoError).code).toBe('invite_only');
  });

  it('maps Cognito error names to actionable codes', () => {
    const cases: [string, string][] = [
      ['NotAuthorizedException', 'wrong_credentials'],
      ['UserNotFoundException', 'wrong_credentials'],
      ['UsernameExistsException', 'email_taken'],
      ['UserNotConfirmedException', 'unverified'],
      ['CodeMismatchException', 'wrong_code'],
      ['ExpiredCodeException', 'expired_code'],
      ['LimitExceededException', 'rate_limited'],
    ];
    for (const [name, expected] of cases) {
      const error = Object.assign(new Error('boom'), { name });
      expect(mapAuthError(error).code, name).toBe(expected);
    }
  });

  it('never leaks an unrecognised provider error to the user', () => {
    const mapped = mapAuthError(
      Object.assign(new Error('InternalErrorFromVendor'), { name: 'Weird' }),
    );
    expect(mapped.code).toBe('unknown');
    expect(mapped.message).toBe(t.auth.errors.generic);
  });

  it('passes an already-mapped error through unchanged', () => {
    const original = new AuthError('invite_only', 'custom');
    expect(mapAuthError(original)).toBe(original);
  });

  it('has copy for every code', () => {
    const codes = [
      'invite_only',
      'wrong_credentials',
      'email_taken',
      'unverified',
      'weak_password',
      'invalid_email',
      'expired_code',
      'wrong_code',
      'rate_limited',
      'network',
      'unknown',
    ] as const;
    for (const code of codes) {
      expect(messageFor(code), code).toBeTruthy();
    }
  });
});
