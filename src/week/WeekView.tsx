import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { EX, SLOTS } from '@/content/plan';
import { DAY_NAMES, DAY_SHORT, SLOT_LABEL, t } from '@/content/strings';
import type { WeekdayIndex } from '@/domain/constants';
import type { DatedWeight } from '@/api/types';
import type { DayPlan, StoredPlan } from '@/domain/schema';
import { WeightTrend } from '@/weight/WeightTrend';

/**
 * The Week tab: seven collapsible days.
 *
 * Today opens by default, because "what am I eating today" is the question that
 * brings someone to this screen; the other six are one tap away. The weekly
 * average names where the week came from — the built-in starter plan or the
 * user's own profile — since the two carry different promises (guardrail 3: the
 * starter week is not allergy-adjusted).
 */

const dayTotal = (day: DayPlan): number => SLOTS.reduce((sum, slot) => sum + day[slot].k, 0);

export function WeekView({
  plan,
  today,
  weights,
  currentWeight,
  goalWeight,
}: {
  plan: StoredPlan;
  today: WeekdayIndex;
  weights: readonly DatedWeight[];
  currentWeight: number;
  goalWeight: number;
}) {
  // Not "no day open": a collapsed week would hide the thing the tab is for.
  const [open, setOpen] = useState<number>(today);
  const panelIdBase = useId();

  const average = Math.round(plan.days.reduce((sum, day) => sum + dayTotal(day), 0) / 7);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-sub text-sm">{t.week.subtitle}</p>
        <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26 }}>
          {t.week.title}
        </h1>
      </div>

      <WeightTrend entries={weights} current={currentWeight} goal={goalWeight} />

      <ul className="flex flex-col gap-2">
        {plan.days.map((day, i) => {
          const isToday = i === today;
          const isOpen = open === i;
          const panelId = `${panelIdBase}-${i}`;
          return (
            <li
              key={DAY_NAMES[i]}
              className="bg-card overflow-hidden rounded-2xl border"
              style={{ borderColor: isToday ? 'var(--color-ink)' : 'var(--color-line)' }}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span
                  className="disp flex shrink-0 items-center justify-center rounded-xl font-bold"
                  style={{
                    width: 44,
                    height: 44,
                    fontSize: 13,
                    background: isToday ? 'var(--color-ink)' : 'var(--color-paper)',
                    color: isToday ? '#fff' : 'var(--color-ink)',
                  }}
                >
                  {DAY_SHORT[i]}
                </span>
                <span className="min-w-0 flex-1">
                  {/* The day name is what the button announces; the short code in
                      the badge is decoration for a screen reader. */}
                  <span className="sr-only">{DAY_NAMES[i]}</span>
                  <span className="text-ink block truncate text-sm font-semibold">{day.d.n}</span>
                  <span className="text-sub block text-xs">
                    {dayTotal(day)} kcal · {EX[i].n} {EX[i].min} min
                  </span>
                </span>
                {isToday ? (
                  <span className="bg-cloud-soft text-cloud rounded-full px-2 py-1 text-xs font-bold uppercase">
                    {t.week.todayBadge}
                  </span>
                ) : null}
                <ChevronDown
                  size={18}
                  className="text-sub shrink-0"
                  aria-hidden="true"
                  style={{
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform .2s',
                  }}
                />
              </button>

              {isOpen ? (
                <div id={panelId} className="border-line flex flex-col gap-2 border-t px-4 pb-4">
                  {SLOTS.map((slot) => (
                    <p key={slot} className="flex items-baseline gap-2 pt-2 text-sm">
                      <span
                        className="text-sub shrink-0 text-xs font-semibold uppercase"
                        style={{ width: 74 }}
                      >
                        {SLOT_LABEL[slot].label}
                      </span>
                      <span className="text-ink flex-1">{day[slot].n}</span>
                      <span className="disp text-sub text-xs font-semibold">{day[slot].k}</span>
                    </p>
                  ))}
                  <p className="border-line flex items-baseline gap-2 border-t border-dashed pt-2 text-sm">
                    <span
                      className="text-cloud shrink-0 text-xs font-semibold uppercase"
                      style={{ width: 74 }}
                    >
                      {t.week.move}
                    </span>
                    <span className="text-ink flex-1">{EX[i].n}</span>
                    <span className="disp text-sub text-xs font-semibold">
                      {t.now.exerciseMinutes(EX[i].min)}
                    </span>
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-sub px-1 text-xs">{t.week.averageNote(average, plan.starter)}</p>
    </section>
  );
}
