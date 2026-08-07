import { useMemo, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createVireApi } from '@/api/client';
import type { DatedLog, DatedWeight, VireApi } from '@/api/types';
import { AuthView } from '@/auth/AuthView';
import { createAuthClient, googleSignInAvailable } from '@/auth/client';
import { useAuthSession } from '@/auth/useAuthSession';
import type { AuthClient } from '@/auth/types';
import { createQueryClient } from '@/data/query';
import {
  useDailyLog,
  useGrocState,
  useLogs,
  usePlan,
  useProfile,
  usePlanWriter,
  useProfileWriter,
  useWeights,
} from '@/data/useVireData';
import type { DailyLogHandle } from '@/data/useVireData';
import { useClock } from '@/hooks/useClock';
import type { Profile, StoredPlan } from '@/domain/schema';
import { t } from '@/content/strings';
import { NowView } from '@/now/NowView';
import { TodayView } from '@/today/TodayView';
import { PlanGate } from '@/plan/PlanGate';
import { ShopView } from '@/shop/ShopView';
import { WeekView } from '@/week/WeekView';
import { weighInDue } from '@/weight/weigh-in-due';
import { addDays, dateKey, weekdayIdx } from '@/domain/clock';
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

  // Read alongside the plan: the weekly weigh-in prompt needs to know how long it
  // has been, so it cannot wait for the Week tab to be opened.
  const weightsQuery = useWeights(api, profile !== null);
  const weights = weightsQuery.data ?? [];
  const logsQuery = useLogs(api, profile !== null);
  const logs = logsQuery.data ?? [];

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
        weights={weights}
        logs={logs}
        api={api}
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
          today={now}
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
 * Now, Today, Week and Shop are all their own views. The offer badges join Shop in
 * E4.3.
 */
function Shell({
  profile,
  plan,
  log: logHandle,
  now,
  weights,
  logs,
  api,
  onOpenSettings,
}: {
  profile: Profile;
  plan: StoredPlan;
  log: DailyLogHandle;
  now: Date;
  weights: readonly DatedWeight[];
  logs: readonly DatedLog[];
  api: VireApi;
  onOpenSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>('now');
  /**
   * Which day the Today tab is showing, as an offset from today (I3).
   *
   * An offset rather than a date, so a day that starts as "today" stays today when
   * midnight passes with the app open — and so the future is unreachable by
   * construction rather than by a check.
   */
  const [dayOffset, setDayOffset] = useState(0);
  const viewedDate = dayOffset === 0 ? now : addDays(now, dayOffset);
  // Same query key as `logHandle` while the offset is zero, so viewing today
  // costs no extra request.
  const viewedLog = useDailyLog(api, dateKey(viewedDate));
  // Keyed by plan id, so a regenerated week reads fresh ticks (E2.2).
  const groc = useGrocState(api, plan.planId);
  const wd = weekdayIdx(now);

  /**
   * Whichever handle's write failed. Two handles exist because Now is always
   * today while Today may be looking back, and each owns its own mutation state —
   * so the toast has to ask both rather than only the one it started with.
   */
  const failedWrite = logHandle.saveFailed ? logHandle : viewedLog.saveFailed ? viewedLog : null;

  return (
    <AppShell tab={tab} onTabChange={setTab} onOpenSettings={onOpenSettings}>
      {failedWrite ? (
        <Toast message={t.log.saveFailed} onDismiss={failedWrite.dismissSaveError} />
      ) : null}

      {tab === 'now' ? (
        <NowView
          profile={profile}
          plan={plan}
          log={logHandle}
          now={now}
          weighInDue={weighInDue(weights, now)}
          onWeighIn={onOpenSettings}
          onGoToday={() => setTab('today')}
        />
      ) : null}

      {tab === 'today' ? (
        <TodayView
          profile={profile}
          plan={plan}
          log={viewedLog}
          viewedDate={viewedDate}
          dayOffset={dayOffset}
          onChangeOffset={(offset) => setDayOffset(Math.min(0, offset))}
        />
      ) : null}

      {tab === 'week' ? (
        <WeekView
          plan={plan}
          today={wd}
          weights={weights}
          currentWeight={profile.w}
          goalWeight={profile.goalW}
          logs={logs}
          target={profile.target}
        />
      ) : null}

      {tab === 'shop' ? <ShopView plan={plan} groc={groc} /> : null}
    </AppShell>
  );
}
