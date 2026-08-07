import { useEffect, useMemo, useState } from 'react';
import { createVireApi } from '@/api/client';
import type { VireApi } from '@/api/types';
import { AuthView } from '@/auth/AuthView';
import { createAuthClient, googleSignInAvailable } from '@/auth/client';
import { useAuthSession } from '@/auth/useAuthSession';
import type { AuthClient } from '@/auth/types';
import { GROC_CATS } from '@/domain/constants';
import type { DailyLog, Profile, SlotKey, StoredPlan, Swap } from '@/domain/schema';
import { SLOTS } from '@/content/plan';
import { DAY_NAMES, SLOT_LABEL, t } from '@/content/strings';
import { PlanGate } from '@/plan/PlanGate';
import { WeekView } from '@/week/WeekView';
import { getSlotKey, hourOf, weekdayIdx } from '@/domain/clock';
import { burnedKcal, eatenKcal, emptyLog, remainingKcal } from '@/domain/log';
import { AppShell } from '@/ui/AppShell';
import { DayStrip } from '@/ui/DayStrip';
import { MealCard } from '@/ui/MealCard';
import { Ring } from '@/ui/Ring';
import type { Tab } from '@/ui/BottomNav';
import { SettingsView } from '@/settings/SettingsView';

/**
 * M0 shell, now reading the user's real plan.
 *
 * The tabs themselves arrive with their own stories — Week in E2.4, Now and Today
 * in E3.2/E3.3, Shop in E4.1 — along with the 30-second clock tick and day
 * rollover. The log state here is still local and throwaway (E3.1).
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

  return <SignedInApp auth={auth} api={injectedApi} onSignOut={signOut} />;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<StoredPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * Regenerating: the gate is showing, but the stored plan is still there and
   * still good. Kept separate from `plan` so backing out restores the week
   * instead of stranding the user — the server was never told to delete anything.
   */
  const [replacingPlan, setReplacingPlan] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await api.getProfile();
        if (cancelled) return;
        setProfile(loaded);
        // Only worth asking once there is a profile: generation needs one, so a
        // user without a profile cannot have a plan.
        if (loaded) {
          const week = await api.getPlan();
          if (!cancelled) setPlan(week);
        }
      } catch (error) {
        // Treated as first-run rather than a dead end: the gates ahead are the
        // only way forward, and each surfaces its own failure.
        console.error('[vire] Could not load the profile or plan', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

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
      <FixtureShell profile={profile} plan={plan} onOpenSettings={() => setSettingsOpen(true)} />
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
 * The M0 shell, reading the saved profile's target and the user's own plan. The
 * live views arrive with their own stories (E2.4, E3.2, E3.3, E4.1).
 */
function FixtureShell({
  profile,
  plan,
  onOpenSettings,
}: {
  profile: Profile;
  plan: StoredPlan;
  onOpenSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>('now');
  const [log, setLog] = useState<DailyLog>(emptyLog);

  const now = useMemo(() => new Date(), []);
  const wd = weekdayIdx(now);
  const day = plan.days[wd];
  const nowHour = hourOf(now);
  const nowSlot = getSlotKey(nowHour);

  const toggleSlot = (slot: SlotKey) =>
    setLog((prev) => ({
      ...prev,
      m: { ...prev.m, [slot]: !prev.m[slot] },
    }));

  const logSwap = (slot: SlotKey, swap: Swap) =>
    setLog((prev) => ({ ...prev, m: { ...prev.m, [slot]: swap } }));

  const clearSwap = (slot: SlotKey) =>
    setLog((prev) => ({ ...prev, m: { ...prev.m, [slot]: false } }));

  const eaten = eatenKcal(log, day);
  const burned = burnedKcal(log, wd);
  const remaining = remainingKcal(log, day, wd, profile.target);

  return (
    <AppShell tab={tab} onTabChange={setTab} onOpenSettings={onOpenSettings}>
      {tab === 'now' ? (
        <section className="flex flex-col gap-4">
          <div>
            <p className="text-sub text-sm">
              {DAY_NAMES[wd]} {now.getDate()}.{now.getMonth() + 1}.
            </p>
            <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26 }}>
              {nowSlot === 'night' ? t.now.nightTitle : t.now.rightNow(SLOT_LABEL[nowSlot].label)}
            </h1>
          </div>

          <DayStrip nowHour={nowHour} log={log} />

          {nowSlot === 'night' ? null : (
            <MealCard
              slot={nowSlot}
              meal={day[nowSlot]}
              entry={log.m[nowSlot]}
              onToggle={() => toggleSlot(nowSlot)}
              onLogSwap={(swap) => logSwap(nowSlot, swap)}
              onClearSwap={() => clearSwap(nowSlot)}
              defaultOpen
            />
          )}

          <div className="border-line bg-card flex items-center gap-4 rounded-2xl border p-4">
            <Ring
              pct={eaten / profile.target}
              over={remaining < 0}
              label={remaining < 0 ? `+${Math.abs(remaining)}` : String(remaining)}
              sub={remaining < 0 ? t.now.kcalOver : t.now.kcalLeft}
            />
            <p className="text-sub text-xs">{t.now.ofTarget(profile.target)}</p>
          </div>
        </section>
      ) : null}

      {tab === 'today' ? (
        <section className="flex flex-col gap-4">
          <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26 }}>
            {t.today.title}
          </h1>

          <div className="bg-ink rounded-2xl p-4">
            <p className="text-xs" style={{ color: '#B9C6BF' }}>
              {t.today.eatenBurned(eaten, burned)}
            </p>
            <p className="disp font-bold text-white" style={{ fontSize: 20 }}>
              {remaining < 0 ? t.today.over(Math.abs(remaining)) : t.today.remaining(remaining)}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {SLOTS.map((slot) => (
              <MealCard
                key={slot}
                slot={slot}
                meal={day[slot]}
                entry={log.m[slot]}
                onToggle={() => toggleSlot(slot)}
                onLogSwap={(swap) => logSwap(slot, swap)}
                onClearSwap={() => clearSwap(slot)}
              />
            ))}
          </div>

          <p className="text-sub px-1 text-xs">{t.today.disclaimer}</p>
        </section>
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
