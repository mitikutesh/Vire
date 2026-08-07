import type { DatedWeight } from '@/api/types';
import { t } from '@/content/strings';

/**
 * Weight, current → goal, with a minimal trend (I1).
 *
 * Deliberately not a chart library: a cloudberry polyline on a card, ink text, no
 * new colours, no axes, no gridlines, no tooltips. The question this answers is
 * "is it going the right way", and anything more invites reading medical meaning
 * into week-to-week noise — hence the caption, which is guardrail 6 and must
 * survive any redesign.
 */

const VIEW = { width: 300, height: 60, pad: 4 } as const;

/**
 * Map weigh-ins onto the viewbox.
 *
 * The y-scale is the observed range, not zero-based: a 2 kg change across a
 * 78 kg baseline is invisible against a zero axis, and invisible progress is
 * what makes people stop weighing themselves. The scale is padded so a flat week
 * draws a level line through the middle instead of collapsing onto an edge.
 */
function points(entries: readonly DatedWeight[]): string {
  const values = entries.map((entry) => entry.kg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const usable = VIEW.height - VIEW.pad * 2;

  return entries
    .map((entry, i) => {
      const x =
        entries.length === 1
          ? VIEW.width / 2
          : VIEW.pad + (i / (entries.length - 1)) * (VIEW.width - VIEW.pad * 2);
      // Weight on the y-axis, so a loss draws a descending line. Inverting it to
      // make "progress" go up would read backwards against every other weight
      // chart the user has ever seen.
      const y = VIEW.pad + ((max - entry.kg) / span) * usable;
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(' ');
}

export function WeightTrend({
  entries,
  current,
  goal,
}: {
  entries: readonly DatedWeight[];
  /** The profile's weight — the last weigh-in the user actually accepted. */
  current: number;
  goal: number;
}) {
  const latest = entries.at(-1)?.kg ?? current;

  return (
    <section className="border-line bg-card flex flex-col gap-2 rounded-2xl border p-4">
      <p className="text-sub text-xs font-semibold tracking-wide uppercase">
        {t.week.weightTrendTitle}
      </p>
      <p className="disp text-ink font-bold" style={{ fontSize: 20 }}>
        {t.week.weightCurrentToGoal(latest, goal)}
      </p>

      {entries.length >= 2 ? (
        <svg
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          className="w-full"
          style={{ height: VIEW.height }}
          role="img"
          aria-label={t.week.weightTrendAria(entries.length, entries[0]!.kg, latest)}
        >
          <polyline
            points={points(entries)}
            fill="none"
            stroke="var(--color-cloud)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // One point is not a trend, and drawing it as a flat line would imply a
        // stability nobody has measured yet.
        <p className="text-sub text-sm">{t.week.weightTrendEmpty}</p>
      )}

      {/* Guardrail 6. */}
      <p className="text-sub text-xs">{t.week.weightTrendCaption}</p>
    </section>
  );
}
