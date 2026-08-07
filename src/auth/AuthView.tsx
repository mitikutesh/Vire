import { useState } from 'react';
import { Loader2, Sprout } from 'lucide-react';
import { t } from '@/content/strings';
import { C } from '@/design/tokens';
import { messageFor } from './error-mapping';
import { AuthError, type AuthClient, type AuthUser } from './types';

/**
 * The sign-in / sign-up screen, plus the two follow-up steps Cognito requires:
 * confirming an emailed code, and resetting a password.
 *
 * The Sprout icon appears here and nowhere else in the app, and the brand is the
 * plain cloudberry wordmark with no filled circle — both locked design rules.
 * Primary buttons are ink, never a solid accent.
 */

const MIN_PASSWORD = 8;

type Step = 'signIn' | 'signUp' | 'confirm' | 'resetRequest' | 'resetConfirm';

interface AuthViewProps {
  auth: AuthClient;
  onAuthed: (user: AuthUser) => void;
  /**
   * Whether to offer Google at all. Hidden by default: a button that cannot work
   * is worse than no button, and Google needs infrastructure that does not exist
   * yet (BACKLOG E1.3).
   */
  googleEnabled?: boolean;
}

export function AuthView({ auth, onAuthed, googleEnabled = false }: AuthViewProps) {
  const [step, setStep] = useState<Step>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /** Local checks first, so an obvious typo costs no round trip. */
  const validateCredentials = (): string => {
    const trimmed = email.trim();
    if (!trimmed.includes('@') || trimmed.length < 5) return t.auth.errors.email;
    if (password.length < MIN_PASSWORD) return t.auth.errors.password;
    return '';
  };

  const run = async (action: () => Promise<void>) => {
    setError('');
    setNote('');
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      if (caught instanceof AuthError) {
        // The error *code* is the contract, not its message: `message` is a
        // developer detail for logs, and deriving the copy here means every
        // implementation of the port renders the same wording.
        setError(messageFor(caught.code));
      } else {
        // Not a mapped failure, so it is a defect rather than a handled case.
        // Showing the generic line is right; discarding it silently is not.
        console.error('[vire] Unexpected auth failure', caught);
        setError(t.auth.errors.generic);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitSignIn = () =>
    run(async () => {
      const problem = validateCredentials();
      if (problem) {
        setError(problem);
        return;
      }
      onAuthed(await auth.signIn(email.trim(), password));
    });

  const submitSignUp = () =>
    run(async () => {
      const problem = validateCredentials();
      if (problem) {
        setError(problem);
        return;
      }
      const outcome = await auth.signUp(email.trim(), password);
      if (outcome.status === 'confirmed') {
        onAuthed(await auth.signIn(email.trim(), password));
        return;
      }
      // Keeps `password` deliberately: the confirm step signs in with it.
      setStep('confirm');
      setNote(t.auth.verifySent);
    });

  const submitConfirm = () =>
    run(async () => {
      await auth.confirmSignUp(email.trim(), code.trim());
      // Straight in — the password is still in state, so there is no reason to
      // make someone who just proved their address type it again.
      onAuthed(await auth.signIn(email.trim(), password));
    });

  const submitResetRequest = () =>
    run(async () => {
      await auth.requestPasswordReset(email.trim());
      setStep('resetConfirm');
      setNote(t.auth.resetSent);
    });

  const submitResetConfirm = () =>
    run(async () => {
      if (password.length < MIN_PASSWORD) {
        setError(t.auth.errors.password);
        return;
      }
      await auth.confirmPasswordReset(email.trim(), code.trim(), password);
      onAuthed(await auth.signIn(email.trim(), password));
    });

  /**
   * User-initiated navigation. Clears the password and code as well as the
   * messages: otherwise a password typed on the sign-in screen arrives
   * pre-filled under "New password" in the reset flow, and the user resets their
   * password to the one that was already failing.
   */
  const goTo = (next: Step) => {
    setStep(next);
    setError('');
    setNote('');
    setPassword('');
    setCode('');
  };

  const inputClass =
    'border-line bg-paper text-ink w-full rounded-xl border px-3 py-3 text-sm outline-none';

  const heading = {
    signIn: t.auth.signInTitle,
    signUp: t.auth.signUpTitle,
    confirm: t.auth.confirmTitle,
    resetRequest: t.auth.resetTitle,
    resetConfirm: t.auth.resetTitle,
  }[step];

  const subheading = {
    signIn: t.auth.signInSubtitle,
    signUp: t.auth.signUpSubtitle,
    confirm: t.auth.confirmSubtitle(email.trim()),
    resetRequest: t.auth.resetSubtitle,
    resetConfirm: t.auth.confirmSubtitle(email.trim()),
  }[step];

  const primary = {
    signIn: { label: t.auth.signInAction, onSubmit: submitSignIn },
    signUp: { label: t.auth.signUpAction, onSubmit: submitSignUp },
    confirm: { label: t.auth.confirmAction, onSubmit: submitConfirm },
    resetRequest: { label: t.auth.resetRequestAction, onSubmit: submitResetRequest },
    resetConfirm: { label: t.auth.resetConfirmAction, onSubmit: submitResetConfirm },
  }[step];

  const showEmail = step !== 'confirm' && step !== 'resetConfirm';
  const showCode = step === 'confirm' || step === 'resetConfirm';
  const showPassword = step !== 'confirm' && step !== 'resetRequest';
  const onSignInOrUp = step === 'signIn' || step === 'signUp';

  return (
    <div className="bg-paper flex min-h-screen flex-col items-center px-4 py-10">
      <div className="mb-8 flex items-center gap-2">
        {/* The Sprout mark is used on this screen only. */}
        <Sprout size={22} aria-hidden="true" style={{ color: C.cloud }} />
        <span className="disp text-cloud font-extrabold" style={{ fontSize: 24 }}>
          {t.app.wordmark}
        </span>
      </div>

      <div className="border-line bg-card flex w-full max-w-md flex-col gap-4 rounded-3xl border p-6">
        <div className="text-center">
          <h1 className="disp text-ink font-bold" style={{ fontSize: 24 }}>
            {heading}
          </h1>
          <p className="text-sub mt-1 text-sm">{subheading}</p>
        </div>

        {/* A real form: iOS Safari shows a "Go" key, and password managers need
            a form around the email and password fields to offer to save them. */}
        <form
          className="flex flex-col gap-4"
          // `noValidate`: the browser would otherwise block submission on an
          // invalid type="email" value and show its own bubble, bypassing the
          // app's designed copy and varying by browser. Validation is ours.
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void primary.onSubmit();
          }}
        >
          {showEmail ? (
            <label className="text-ink flex flex-col gap-1 text-sm font-medium">
              {t.auth.emailLabel}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.auth.emailPlaceholder}
                autoComplete="email"
                disabled={busy}
                className={inputClass}
              />
            </label>
          ) : null}

          {showCode ? (
            <label className="text-ink flex flex-col gap-1 text-sm font-medium">
              {t.auth.codeLabel}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder={t.auth.codePlaceholder}
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={busy}
                className={inputClass}
              />
            </label>
          ) : null}

          {showPassword ? (
            <label className="text-ink flex flex-col gap-1 text-sm font-medium">
              {step === 'resetConfirm' ? t.auth.newPasswordLabel : t.auth.passwordLabel}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.auth.passwordPlaceholder}
                autoComplete={step === 'signIn' ? 'current-password' : 'new-password'}
                disabled={busy}
                className={inputClass}
              />
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="text-berry text-sm font-medium">
              {error}
            </p>
          ) : null}
          {note ? <p className="text-sub text-sm">{note}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="bg-ink flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white"
            style={{ opacity: busy ? 0.7 : 1 }}
          >
            {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
            {primary.label}
          </button>
        </form>

        {step === 'confirm' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => auth.resendConfirmation(email.trim()))}
            className="text-lake text-sm font-medium"
          >
            {t.auth.resendCode}
          </button>
        ) : null}

        {onSignInOrUp && googleEnabled ? (
          <>
            <div className="flex items-center gap-3">
              <span className="bg-line h-px flex-1" />
              <span className="text-sub text-xs">{t.auth.or}</span>
              <span className="bg-line h-px flex-1" />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => auth.signInWithGoogle())}
              className="border-line bg-paper text-ink flex w-full items-center justify-center gap-2 rounded-full border py-3 text-sm font-semibold"
            >
              <span className="disp font-extrabold" style={{ color: '#4285F4' }}>
                G
              </span>
              {t.auth.google}
            </button>
          </>
        ) : null}

        <div className="flex flex-col gap-1 pt-1 text-center">
          {step === 'signIn' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => goTo('resetRequest')}
              className="text-lake text-sm font-medium"
            >
              {t.auth.forgot}
            </button>
          ) : null}

          {onSignInOrUp ? (
            <p className="text-sub text-sm">
              {step === 'signIn' ? t.auth.newHere : t.auth.haveAccount}
              <button
                type="button"
                disabled={busy}
                onClick={() => goTo(step === 'signIn' ? 'signUp' : 'signIn')}
                className="text-lake font-semibold"
              >
                {step === 'signIn' ? t.auth.switchToSignUp : t.auth.switchToSignIn}
              </button>
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => goTo('signIn')}
              className="text-lake text-sm font-medium"
            >
              {t.auth.backToSignIn}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
