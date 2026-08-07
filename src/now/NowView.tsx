import { Check, Clock, Droplets, Footprints, Moon, Scale } from 'lucide-react';
import type { DailyLogHandle } from '@/data/useVireData';
import { EX, MOVE_WINDOW } from '@/content/plan';
import { DAY_NAMES, SLOT_LABEL, t } from '@/content/strings';
import { NIGHT, getSlotKey, greetingFor, hourOf, weekdayIdx } from '@/domain/clock';
import { eatenKcal, firstNameOf, isSwap, remainingKcal, waterGoalGlasses } from '@/domain/log';
import type { Meal, Profile, SlotEntry, StoredPlan } from '@/domain/schema';
import { CustomEat } from '@/ui/CustomEat';
import { DayStrip } from '@/ui/DayStrip';
import { DetailsToggle } from '@/ui/DetailsToggle';
import { MacroChips } from '@/ui/MacroChips';
import { Ring } from '@/ui/Ring';

/**
 * The Now tab: the one screen that answers "what do I do in the next hour".
 *
 * Everything here is keyed off the clock rather than off a tab the user picked —
 * which meal card is showing, whether the movement nudge appears, whether the
 * kitchen is closed. The DayStrip above it is the app's signature element.
 *
 * The nudge is deliberately narrow: 16–20 h, only if the day's movement is not
 * already done, and never on the rest day. A reminder that appears when it cannot
 * be acted on is the thing that teaches people to ignore reminders.
 */
export function NowView({
  profile,
  plan,
  log: logHandle,
  now,
  weighInDue,
  onWeighIn,
  onGoToday,
}: {
  profile: Profile;
  plan: StoredPlan;
  log: DailyLogHandle;
  now: Date;
  /** A week since the last weigh-in — or there has never been one (I1). */
  weighInDue: boolean;
  /** Opens Settings, where the weigh-in field lives. */
  onWeighIn: () => void;
  /** The movement nudge leads to Today, where the quick-add chips live. */
  onGoToday: () => void;
}) {
  const { log, update } = logHandle;
  const hour = hourOf(now);
  const slot = getSlotKey(hour);
  const wd = weekdayIdx(now);
  const day = plan.days[wd];
  const exercise = EX[wd];

  const waterGoal = waterGoalGlasses(profile.waterMl);
  const eaten = eatenKcal(log, day);
  const remaining = remainingKcal(log, day, wd, profile.target);
  const over = remaining < 0;

  const inMoveWindow =
    hour >= MOVE_WINDOW.from && hour < MOVE_WINDOW.to && !log.ex && wd !== MOVE_WINDOW.restDay;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-sub text-sm">
          {t.now.header(greetingFor(hour), firstNameOf(profile.name), DAY_NAMES[wd], now)}
        </p>
        <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26, lineHeight: 1.15 }}>
          {slot === NIGHT ? t.now.nightTitle : t.now.rightNow(SLOT_LABEL[slot].label)}
        </h1>
      </div>

      <DayStrip nowHour={hour} log={log} />

      {slot === NIGHT ? (
        <NightCard breakfast={plan.days[(wd + 1) % 7].b} />
      ) : (
        <div className="border-line bg-card overflow-hidden rounded-2xl border">
          <div className="p-5 pb-4">
            <span className="bg-cloud-soft text-cloud inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold tracking-wide uppercase">
              <Clock size={12} aria-hidden="true" /> {t.now.nowChip(SLOT_LABEL[slot].hint)}
            </span>
            <h2 className="disp text-ink mt-3 font-bold" style={{ fontSize: 24, lineHeight: 1.2 }}>
              {day[slot].n}
            </h2>
            {day[slot].fi ? <p className="text-sub mt-1 text-sm">{day[slot].fi}</p> : null}
            <div className="mt-3">
              <MacroChips meal={day[slot]} />
            </div>

            <button
              type="button"
              onClick={() =>
                update((prev) => ({ ...prev, m: { ...prev.m, [slot]: !prev.m[slot] } }))
              }
              aria-pressed={Boolean(log.m[slot])}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white"
              // Cloudberry once done — the done-state colour throughout the app.
              style={{ background: log.m[slot] ? 'var(--color-cloud)' : 'var(--color-ink)' }}
            >
              <Check size={17} aria-hidden="true" />
              {eatenLabel(log.m[slot])}
            </button>

            <div className="mt-3">
              <CustomEat
                value={log.m[slot]}
                planned={day[slot].k}
                onLog={(swap) => update((prev) => ({ ...prev, m: { ...prev.m, [slot]: swap } }))}
                onClear={() => update((prev) => ({ ...prev, m: { ...prev.m, [slot]: false } }))}
              />
            </div>
          </div>
          <DetailsToggle meal={day[slot]} />
        </div>
      )}

      {inMoveWindow ? (
        <button
          type="button"
          onClick={onGoToday}
          className="bg-cloud-soft border-cloud flex items-center gap-3 rounded-2xl border p-4 text-left"
        >
          <Footprints size={20} className="text-cloud shrink-0" aria-hidden="true" />
          <span className="text-ink text-sm">{t.now.moveNudge(exercise.n, exercise.min)}</span>
        </button>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="border-line bg-card flex flex-col items-center gap-1 rounded-2xl border p-3">
          <Ring
            pct={eaten / Math.max(1, profile.target)}
            over={over}
            label={over ? `+${Math.abs(remaining)}` : String(remaining)}
            sub={over ? t.now.kcalOver : t.now.kcalLeft}
          />
          <p className="text-sub text-xs">{t.now.ofTarget(profile.target)}</p>
        </div>

        <button
          type="button"
          onClick={() =>
            update((prev) => ({ ...prev, water: Math.min(waterGoal, prev.water + 1) }))
          }
          // The number is the point, so it goes in the label rather than being
          // left for a screen reader to assemble from three stacked lines.
          aria-label={t.now.waterAria(log.water, waterGoal)}
          className="bg-lake-soft border-line flex flex-col items-center justify-center gap-1 rounded-2xl border p-3"
        >
          <Droplets size={20} className="text-lake" aria-hidden="true" />
          <span className="disp text-lake font-bold" style={{ fontSize: 16 }} aria-hidden="true">
            {log.water}/{waterGoal}
          </span>
          <span className="text-sub text-xs" aria-hidden="true">
            {t.now.waterTile}
          </span>
        </button>

        <button
          type="button"
          onClick={() => update((prev) => ({ ...prev, ex: !prev.ex }))}
          aria-pressed={log.ex}
          className="border-line flex flex-col items-center justify-center gap-1 rounded-2xl border p-3"
          style={{ background: log.ex ? 'var(--color-cloud-soft)' : 'var(--color-card)' }}
        >
          <Footprints size={20} className={log.ex ? 'text-cloud' : 'text-sub'} aria-hidden="true" />
          <span className="text-ink text-center text-xs leading-tight font-semibold">
            {exercise.n}
          </span>
          <span className="text-sub text-xs">
            {log.ex ? t.now.exerciseDone : t.now.exerciseMinutes(exercise.min)}
          </span>
        </button>
      </div>

      {weighInDue ? (
        <button
          type="button"
          onClick={onWeighIn}
          // Below the tiles on purpose: a card, not a nag. It never escalates and
          // never counts how long it has been ignored — it just goes away once a
          // weigh-in is recorded.
          className="border-line bg-card flex items-center gap-3 rounded-2xl border p-4 text-left"
        >
          <Scale size={20} className="text-sub shrink-0" aria-hidden="true" />
          <span className="text-ink text-sm">{t.settings.weighInPrompt}</span>
        </button>
      ) : null}
    </section>
  );
}

/** The button's label carries the state, so it is not colour alone. */
function eatenLabel(entry: SlotEntry | undefined): string {
  if (isSwap(entry)) return t.now.eatenSwapped(entry.k);
  return entry ? t.now.eaten : t.now.markEaten;
}

function NightCard({ breakfast }: { breakfast: Meal }) {
  return (
    <div className="border-line bg-card flex items-start gap-4 rounded-2xl border p-5">
      <Moon size={22} className="text-lake shrink-0" style={{ marginTop: 2 }} aria-hidden="true" />
      <div>
        <p className="text-ink font-semibold">{t.now.nightCardTitle}</p>
        <p className="text-sub mt-1 text-sm">
          {t.now.nightCardBody} <span className="text-ink font-medium">{breakfast.n}</span> (
          {t.settings.kcal(breakfast.k)}
          ).
        </p>
      </div>
    </div>
  );
}
