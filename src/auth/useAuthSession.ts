import { useCallback, useEffect, useState } from 'react';
import type { AuthClient, AuthUser } from './types';

export type SessionState =
  /** Checking for an existing session — the app shows the wordmark splash. */
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser };

/**
 * The app's session.
 *
 * Restoring on load matters more here than in most apps: this is opened several
 * times a day to tick off a meal, and a sign-in prompt at every visit would make
 * the habit the app depends on far harder to keep.
 */
export function useAuthSession(auth: AuthClient) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await auth.currentUser();
      // A resolved promise after unmount would warn and, worse, resurrect a
      // signed-in state the user has just left.
      if (!cancelled) setState(user ? { status: 'signedIn', user } : { status: 'signedOut' });
    })();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const onAuthed = useCallback((user: AuthUser) => {
    setState({ status: 'signedIn', user });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await auth.signOut();
    } catch (error) {
      // The user asked to leave. A failed provider call must not trap them in a
      // signed-in UI, so the local session ends either way — but swallowing the
      // error silently would hide a real defect, so it is logged.
      console.error('[vire] Sign-out failed on the provider; ending local session anyway', error);
    } finally {
      setState({ status: 'signedOut' });
    }
  }, [auth]);

  return { state, onAuthed, signOut };
}
