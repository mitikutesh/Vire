import { useMemo, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createVireApi } from '@/api/client';
import type { VireApi } from '@/api/types';
import { AuthView } from '@/auth/AuthView';
import { createAuthClient, googleSignInAvailable } from '@/auth/client';
import { useAuthSession } from '@/auth/useAuthSession';
import type { AuthClient } from '@/auth/types';
import { createQueryClient } from '@/data/query';
import {
  useDailyLog,
  usePlan,
  useProfile,
  usePlanWriter,
  useProfileWriter,
} from '@/data/useVireData';
import type { DailyLogHandle } from '@/data/useVireData';
import { useClock } from '@/hooks/useClock';
import { GROC_CATS } from '@/domain/constants';
import type { Profile, StoredPlan } from '@/domain/schema';
import { t } from '@/content/strings';
import { NowView } from '@/now/NowView';
import { TodayView } from '@/today/TodayView';
import { PlanGate } from '@/plan/PlanGate';
import { WeekView } from '@/week/WeekView';
import { dateKey, weekdayIdx } from '@/domain/clock';
import { AppShell } from '@/ui/AppShell';
import { Toast } from '@/ui/Toast';
import type { Tab } from '@/ui/BottomNav';
import { SettingsView } from '@/settings/SettingsView';

/**
 * The app.
 *
 * The Now and Today tabs are still the M0 fixture layout; they get their real
 * treatment in E3.2 and E3.3, and Shop in E4.1. What is real as of E3.1: the
 * day's log is persisted per client-local date, every tap is optimistic, and the
 * clock ticks so the app follows the day across midnight.
 */
/**
 * `auth` and `api` are injectable so tests can start from a signed-in session
 * with a profile already saved, instead of driving both flows every time.
 */
export default function App({
  auth: injectedAuth,
  api: injectedApi,
}: { auth?: AuthClient; api?: VireApi } = {}) {
  // One client for the app's lifetime: rebuilding it would reconfigure Amplify
  // and drop the session on every render.
  const auth = useMemo(() => injectedAuth ?? createAuthClient(), [injectedAuth]);
  // One client per App instance. Per test, too, which is what keeps one case's
  // cached log from showing up in the next.
  const queryClient = useMemo(() => createQueryClient(), []);
  const { state, onAuthed, signOut } = useAuthSession(auth);

  if (state.status === 'loading') {
    // The wordmark splash, so a restored session never flashes the sign-in form.
    return (
      <div className="bg-paper flex min-h-screen items-center justify-center">
        <p className="disp text-cloud font-bold" style={{ fontSize: 20 }}>
          {t.loading.splash}
        </p>
      </div>
    );
  }

  if (state.status === 'signedOut') {
    return <AuthView auth={auth} onAuthed={onAuthed} googleEnabled={googleSignInAvailable()} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SignedInApp auth={auth} api={injectedApi} onSignOut={signOut} />
    </QueryClientProvider>
  );
}

/**
 * Signed in, and two gates deep.
 *
 * The profile comes first: without one there is no calorie target, and nothing
 * downstream has a number to work from. The plan comes second: the tabs all
 * render a week, so there is nothing to show until one exists.
 */
function SignedInApp({
  auth,
  api: injectedApi,
  onSignOut,
}: {
  auth: AuthClient;
  api?: VireApi | undefined;
  onSignOut: () => void;
}) {
  const api = useMemo(() => injectedApi ?? createVireApi(auth), [injectedApi, auth]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * Regenerating: the gate is showing, but the stored plan is still there and
   * still good. Kept separate from the plan itself so backing out restores the
   * week instead of stranding the user — the server was never told to delete
   * anything.
   */
  const [replacingPlan, setReplacingPlan] = useState(false);

  const profileQuery = useProfile(api);
  const profile = profileQuery.data ?? null;
  // A profile is a precondition for a plan, so this waits rather than firing a
  // request that can only 404.
  const planQuery = usePlan(api, profile !== null);
  const plan = planQuery.data ?? null;

  const setProfile = useProfileWriter();
  const setPlan = usePlanWriter();

  const now = useClock();
  // The client's own date. Midnight passing changes the key, and the new day's
  // log loads on its own.
  const log = useDailyLog(api, dateKey(now));

  // A failed read is treated as "nothing there": the gates ahead are the only way
  // forward and each surfaces its own failure.
  const loading = profileQuery.isPending || (profile !== null && planQuery.isPending);

  if (loading) {
    return (
      <div className="bg-paper flex min-h-screen items-center justify-center">
        <p className="disp text-cloud font-bold" style={{ fontSize: 20 }}>
          {t.loading.splash}
        </p>
      </div>
    );
  }

  // First run: non-dismissible, because there is nothing behind it yet.
  if (!profile) {
    return <SettingsView api={api} profile={null} onSaved={setProfile} onSignOut={onSignOut} />;
  }

  if (!plan || replacingPlan) {
    return (
      <PlanGate
        api={api}
        profile={profile}
        onPlan={(week) => {
          setPlan(week);
          setReplacingPlan(false);
        }}
        {...(plan ? { onKeepCurrent: () => setReplacingPlan(false) } : {})}
      />
    );
  }

  return (
    <>
      <Shell
        profile={profile}
        plan={plan}
        log={log}
        now={now}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {settingsOpen ? (
        <SettingsView
          api={api}
          profile={profile}
          onSaved={(saved) => {
            setProfile(saved);
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
          onRegenerate={() => {
            setSettingsOpen(false);
            setReplacingPlan(true);
          }}
          onSignOut={onSignOut}
        />
      ) : null}
    </>
  );
}

/**
 * The shell: the four tabs, the settings gear, and the toast for a log write that
 * had to be rolled back.
 *
 * Now, Today and Week are their own views. Shop is still the M0 fixture layout —
 * it gets its grocery state, store tags and offer badges in E4.
 */
function Shell({
  profile,
  plan,
  log: logHandle,
  now,
  onOpenSettings,
}: {
  profile: Profile;
  plan: StoredPlan;
  log: DailyLogHandle;
  now: Date;
  onOpenSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>('now');
  const wd = weekdayIdx(now);

  return (
    <AppShell tab={tab} onTabChange={setTab} onOpenSettings={onOpenSettings}>
      {logHandle.saveFailed ? (
        <Toast message={t.log.saveFailed} onDismiss={logHandle.dismissSaveError} />
      ) : null}

      {tab === 'now' ? (
        <NowView
          profile={profile}
          plan={plan}
          log={logHandle}
          now={now}
          onGoToday={() => setTab('today')}
        />
      ) : null}

      {tab === 'today' ? (
        <TodayView profile={profile} plan={plan} log={logHandle} now={now} />
      ) : null}

      {tab === 'week' ? <WeekView plan={plan} today={wd} /> : null}

      {tab === 'shop' ? (
        <section className="flex flex-col gap-4">
          <p className="text-sub text-sm">{t.shop.subtitle}</p>
          <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26 }}>
            {t.shop.title}
          </h1>

          {GROC_CATS.map((cat) => {
            const items = plan.groc.filter((item) => item.cat === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="flex flex-col gap-1">
                <p className="text-cloud px-1 text-xs font-bold tracking-wide uppercase">{cat}</p>
                <ul className="border-line bg-card overflow-hidden rounded-2xl border">
                  {items.map((item, idx) => (
                    <li
                      key={item.id}
                      className="px-3 py-3"
                      style={idx === 0 ? undefined : { borderTop: '1px solid var(--color-line)' }}
                    >
                      <p className="text-ink truncate text-sm font-medium">
                        {item.n} <span className="text-sub font-normal">· {item.fi}</span>
                      </p>
                      <p className="text-sub text-xs">
                        {item.q}
                        {item.st ? t.shop.staple : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}
    </AppShell>
  );
}
