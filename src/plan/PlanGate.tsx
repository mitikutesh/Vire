import { useRef, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { ApiError, PlanGenerationError, type VireApi } from '@/api/types';
import { DAY_NAMES, t } from '@/content/strings';
import { WEEKDAYS, type WeekdayIndex } from '@/domain/constants';
import type { DayState } from '@/domain/plan-stream';
import type { Profile, StoredPlan } from '@/domain/schema';

/**
 * The plan gate: no week yet, so nothing else can render.
 *
 * Two health guardrails live in this screen's copy (PLAN §7, guardrail 3). The
 * allergies the user gave are named in the blurb, so they can see the generator
 * was told; and the starter plan says it is *not* adjusted for them — at both
 * points it is offered, idle and after a failure, because the second is where
 * someone in a hurry actually taps it.
 *
 * The seven rows fill in from the stream rather than after it. Generation takes
 * ~30 s, and a progress list that moves is the difference between "working" and
 * "hung".
 */

type Phase = 'idle' | 'generating' | 'error';

const allDays = (state: DayState): DayState[] => WEEKDAYS.map(() => state);

/** What to say about a failure — the reason changes what the user should do. */
function messageFor(error: unknown): string {
  if (error instanceof PlanGenerationError) {
    if (error.reason === 'not_saved') return t.planGate.errorNotSaved;
    if (error.reason === 'dropped') return t.planGate.errorDropped;
    return t.planGate.error;
  }
  if (error instanceof ApiError && error.status === 429) return t.planGate.errorRateLimited;
  return t.planGate.error;
}

export function PlanGate({
  api,
  profile,
  onPlan,
  onKeepCurrent,
}: {
  api: VireApi;
  profile: Profile;
  onPlan: (plan: StoredPlan) => void;
  /**
   * Present only when a plan already exists, i.e. the user came here from
   * Settings to regenerate. Without an escape, a regenerate that fails or is
   * thought better of would leave them staring at a gate with a perfectly good
   * week sitting on the server.
   */
  onKeepCurrent?: (() => void) | undefined;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [dayStates, setDayStates] = useState<DayState[]>(() => allDays('wait'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * The actual guard against a second plan. `busy` disables the buttons, but a
   * disabled button only helps once React has re-rendered, and two taps can land
   * inside one commit — which would spend two slices of the daily allowance and
   * activate two plans. The ref is set before the first await, so the second call
   * returns immediately regardless of render timing.
   */
  const inFlight = useRef(false);

  const allergies = profile.allergies.trim();
  const hasAllergies = allergies.length > 0;

  const setDay = (day: WeekdayIndex, state: DayState) =>
    setDayStates((prev) => prev.map((current, i) => (i === day ? state : current)));

  /** Run one plan-producing request, refusing to overlap with another. */
  const run = async (request: () => Promise<StoredPlan>, onError: (cause: unknown) => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      onPlan(await request());
    } catch (cause) {
      onError(cause);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const generate = () => {
    // Checked here as well as in `run`: resetting the seven rows on a second tap
    // would wipe the progress of the run already under way.
    if (inFlight.current) return;
    setPhase('generating');
    setDayStates(allDays('wait'));
    setError('');
    return run(
      () => api.generatePlan(setDay),
      (cause) => {
        // Logged as well as shown: the message deliberately says nothing about
        // which provider or status produced it.
        console.error('[vire] Plan generation failed', cause);
        setError(messageFor(cause));
        setPhase('error');
      },
    );
  };

  const adoptStarter = () => {
    setError('');
    return run(
      () => api.adoptStarterPlan(),
      (cause) => {
        console.error('[vire] Adopting the starter plan failed', cause);
        // No fallback left to offer, so this stays on the error screen.
        setError(t.planGate.error);
        setPhase('error');
      },
    );
  };

  const doneCount = dayStates.filter((state) => state === 'done').length;
  const replacing = onKeepCurrent !== undefined;

  /** The way back to an existing week, on every screen that is not mid-request. */
  const keepCurrent = onKeepCurrent ? (
    <button
      type="button"
      onClick={onKeepCurrent}
      disabled={busy}
      className="text-sub text-sm font-medium underline-offset-2 hover:underline disabled:opacity-60"
    >
      {t.planGate.keepCurrent}
    </button>
  ) : null;

  return (
    <main className="bg-paper flex min-h-screen flex-col items-center gap-4 px-5 pt-10 text-center">
      <span
        className="bg-cloud-soft flex items-center justify-center rounded-full"
        style={{ width: 74, height: 74 }}
      >
        <Sparkles size={30} className="text-cloud" aria-hidden="true" />
      </span>

      <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26 }}>
        {replacing ? t.planGate.replaceTitle : t.planGate.title}
      </h1>
      <p className="text-sub max-w-xs text-sm">
        {t.planGate.blurb(hasAllergies ? allergies : null)}
      </p>
      {replacing ? <p className="text-sub max-w-xs text-xs">{t.planGate.replaceBlurb}</p> : null}

      {phase === 'idle' ? (
        <>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="bg-ink flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Sparkles size={16} aria-hidden="true" /> {t.planGate.generate}
          </button>
          <button
            type="button"
            onClick={() => void adoptStarter()}
            disabled={busy}
            className="text-sub text-sm font-medium underline-offset-2 hover:underline disabled:opacity-60"
          >
            {t.planGate.starter(hasAllergies)}
          </button>
          {keepCurrent}
        </>
      ) : null}

      {phase === 'generating' ? (
        <div className="border-line bg-card w-full max-w-xs rounded-2xl border p-4 text-left">
          <ul className="flex flex-col gap-2">
            {DAY_NAMES.map((name, i) => {
              const state = dayStates[i] ?? 'wait';
              return (
                <li
                  key={name}
                  className="text-ink flex items-center justify-between text-sm"
                  // The icon carries the state visually; this carries it for
                  // anyone not looking at the icon.
                  aria-label={`${name}: ${t.planGate.dayStatus[state]}`}
                >
                  <span>{name}</span>
                  <DayIcon state={state} />
                </li>
              );
            })}
          </ul>
          {/* One live region for the whole list: announcing seven rows as they
              each change would be unusable. */}
          <p aria-live="polite" className="sr-only">
            {t.planGate.progress(doneCount, DAY_NAMES.length)}
          </p>
          <p className="text-sub border-line mt-3 border-t border-dashed pt-2 text-xs">
            {t.planGate.generatingNote}
          </p>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="flex flex-col items-center gap-3">
          <p role="alert" className="text-berry max-w-xs text-sm">
            {error || t.planGate.error}
          </p>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="bg-ink rounded-full px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {t.planGate.retry}
          </button>
          <button
            type="button"
            onClick={() => void adoptStarter()}
            disabled={busy}
            className="text-sub text-sm font-medium underline-offset-2 hover:underline disabled:opacity-60"
          >
            {t.planGate.starterAfterError(hasAllergies)}
          </button>
          {keepCurrent}
        </div>
      ) : null}
    </main>
  );
}

function DayIcon({ state }: { state: DayState }) {
  if (state === 'done') return <Check size={16} className="text-cloud" aria-hidden="true" />;
  if (state === 'fail') return <X size={16} className="text-berry" aria-hidden="true" />;
  if (state === 'run') return <Loader2 size={15} className="spin text-cloud" aria-hidden="true" />;
  return (
    <span className="text-sub text-xs" aria-hidden="true">
      …
    </span>
  );
}
