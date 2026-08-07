import { useEffect, useMemo, useState } from 'react';
import { createVireApi } from '@/api/client';
import type { VireApi } from '@/api/types';
import { AuthView } from '@/auth/AuthView';
import { createAuthClient, googleSignInAvailable } from '@/auth/client';
import { useAuthSession } from '@/auth/useAuthSession';
import type { AuthClient } from '@/auth/types';
import { GROC_CATS } from '@/domain/constants';
import type { DailyLog, Profile, SlotKey, Swap } from '@/domain/schema';
import { EX, SLOTS } from '@/content/plan';
import { DAY_NAMES, SLOT_LABEL, t } from '@/content/strings';
import { STARTER_DAYS, STARTER_GROC } from '@/content/starter-plan';
import { getSlotKey, hourOf, weekdayIdx } from '@/domain/clock';
import { burnedKcal, eatenKcal, emptyLog, remainingKcal } from '@/domain/log';
import { AppShell } from '@/ui/AppShell';
import { DayStrip } from '@/ui/DayStrip';
import { MealCard } from '@/ui/MealCard';
import { Ring } from '@/ui/Ring';
import type { Tab } from '@/ui/BottomNav';
import { SettingsView } from '@/settings/SettingsView';

/**
 * M0 shell: every tab rendered from the starter plan so the locked design and
 * the UI kit can be checked end to end before any backend exists.
 *
 * The real views arrive with their own stories — Week in E2.4, Now and Today in
 * E3.2/E3.3, Shop in E4.1 — along with live data, the 30-second clock tick and
 * day rollover. State here is deliberately local and throwaway.
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
 * Signed in. The profile gates everything else: without one there is no calorie
 * target, so first-run setup comes before the tabs. The plan gate (E2.3) slots in
 * next, between the profile and the shell.
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
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await api.getProfile();
        if (!cancelled) setProfile(loaded);
      } catch (error) {
        // Treated as first-run rather than a dead end: the form is the only way
        // forward, and it will surface a save failure of its own.
        console.error('[vire] Could not load the profile', error);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (loadingProfile) {
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

  return (
    <>
      <FixtureShell profile={profile} onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen ? (
        <SettingsView
          api={api}
          profile={profile}
          onSaved={(saved) => {
            setProfile(saved);
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
          onSignOut={onSignOut}
        />
      ) : null}
    </>
  );
}

/**
 * The M0 fixture shell, now reading the real target from the saved profile. The
 * live views arrive with their own stories (E2.4, E3.2, E3.3, E4.1).
 */
function FixtureShell({
  profile,
  onOpenSettings,
}: {
  profile: Profile;
  onOpenSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>('now');
  const [log, setLog] = useState<DailyLog>(emptyLog);

  const now = useMemo(() => new Date(), []);
  const wd = weekdayIdx(now);
  const day = STARTER_DAYS[wd];
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

      {tab === 'week' ? (
        <section className="flex flex-col gap-4">
          <p className="text-sub text-sm">{t.week.subtitle}</p>
          <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26 }}>
            {t.week.title}
          </h1>

          <ul className="flex flex-col gap-2">
            {STARTER_DAYS.map((d, i) => {
              const total = SLOTS.reduce((sum, slot) => sum + d[slot].k, 0);
              return (
                <li
                  key={DAY_NAMES[i]}
                  className="border-line bg-card flex items-center gap-3 rounded-2xl border p-4"
                  style={i === wd ? { borderColor: 'var(--color-ink)' } : undefined}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-sm font-semibold">{d.d.n}</span>
                    <span className="text-sub block text-xs">
                      {total} kcal · {EX[i].n} {EX[i].min} min
                    </span>
                  </span>
                  {i === wd ? (
                    <span className="bg-cloud-soft text-cloud rounded-full px-2 py-1 text-xs font-bold uppercase">
                      {t.week.todayBadge}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {tab === 'shop' ? (
        <section className="flex flex-col gap-4">
          <p className="text-sub text-sm">{t.shop.subtitle}</p>
          <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26 }}>
            {t.shop.title}
          </h1>

          {GROC_CATS.map((cat) => {
            const items = STARTER_GROC.filter((item) => item.cat === cat);
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
