import type { DatedLog } from '@/api/types';
import { DAY_SHORT, t } from '@/content/strings';
import { weekdayIdx } from '@/domain/clock';
import { eatenKcal } from '@/domain/log';
import type { StoredPlan } from '@/domain/schema';

/**
 * The last seven days, kcal in versus target (I3).
 *
 * Explicitly no streaks and no badges. A streak turns one bad Tuesday into a
 * reason to give up, which is the opposite of what a cholesterol-and-weight app
 * is for. This is a mirror, not a scoreboard: seven bars, the number beside each,
 * and nothing that can be broken.
 *
 * A caveat worth knowing about the arithmetic: a meal marked eaten as planned
 * carries the calories of *the current plan's* meal for that weekday. Swaps and
 * extras are exact, because their calories are in the log itself. If the week was
 * regenerated mid-period, older planned meals are therefore approximated by
 * whatever now occupies that weekday — accurate enough for a mirror, and the
 * alternative is denormalising a total into every log write.
 */
export function AdherenceSummary({
  logs,
  plan,
  target,
}: {
  /** Newest first, as the route returns them. */
  logs: readonly DatedLog[];
  plan: StoredPlan;
  target: number;
}) {
  if (logs.length === 0) {
    return (
      <section className="border-line bg-card flex flex-col gap-2 rounded-2xl border p-4">
        <p className="text-sub text-xs font-semibold tracking-wide uppercase">
          {t.week.adherenceTitle}
        </p>
        <p className="text-sub text-sm">{t.week.adherenceEmpty}</p>
      </section>
    );
  }

  // Oldest first, so the rows read the same direction as the trend above them.
  const rows = [...logs].reverse().map((log) => {
    const wd = weekdayIdx(new Date(`${log.date}T12:00:00`));
    const eaten = eatenKcal(log, plan.days[wd]);
    return { date: log.date, wd, eaten, over: eaten > target };
  });

  const widest = Math.max(target, ...rows.map((row) => row.eaten));

  return (
    <section className="border-line bg-card flex flex-col gap-2 rounded-2xl border p-4">
      <p className="text-sub text-xs font-semibold tracking-wide uppercase">
        {t.week.adherenceTitle}
      </p>

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.date} className="flex items-center gap-3">
            <span className="text-sub w-8 shrink-0 text-xs font-semibold">{DAY_SHORT[row.wd]}</span>
            <span
              className="bg-paper relative min-w-0 flex-1 overflow-hidden rounded-full"
              style={{ height: 8 }}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  // Scaled against the busiest day, not the target, so a day well
                  // over budget still fits inside the row.
                  width: `${Math.round((row.eaten / widest) * 100)}%`,
                  background: row.over ? 'var(--color-berry)' : 'var(--color-cloud)',
                }}
              />
            </span>
            <span className="text-ink w-20 shrink-0 text-right text-xs">
              {t.week.adherenceRow(row.eaten, target)}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sub text-xs">{t.week.adherenceNote}</p>
    </section>
  );
}
