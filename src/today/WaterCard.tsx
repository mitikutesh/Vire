import { Droplets, Minus, Plus } from 'lucide-react';
import { t } from '@/content/strings';

/**
 * Water, in glasses.
 *
 * The goal is stored in millilitres and shown in glasses, because nobody counts
 * their day in millilitres — but a target does need a unit, so the litre figure
 * stays in the heading.
 *
 * The segment bar is a `progressbar` rather than a row of decorative spans: it is
 * the only place the count appears visually, and "4 of 8 glasses" has to be
 * available to someone who cannot see the fill.
 */
export function WaterCard({
  glasses,
  goal,
  onChange,
  readOnly = false,
}: {
  glasses: number;
  goal: number;
  onChange: (glasses: number) => void;
  /** A past day (I3): the bar still reads, the buttons go away. */
  readOnly?: boolean;
}) {
  return (
    <section className="bg-lake-soft border-line rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-ink flex items-center gap-2 text-sm font-semibold">
          <Droplets size={17} className="text-lake shrink-0" aria-hidden="true" />
          {t.today.waterGoal(goal)}
        </p>
        {readOnly ? null : (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label={t.today.waterLessAria}
              onClick={() => onChange(Math.max(0, glasses - 1))}
              className="rounded-full bg-white p-1"
            >
              <Minus size={15} className="text-lake" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t.today.waterMoreAria}
              // Capped at the goal: the bar has exactly that many segments, so
              // counting past it would show progress that cannot be drawn.
              onClick={() => onChange(Math.min(goal, glasses + 1))}
              className="bg-lake rounded-full p-1"
            >
              <Plus size={15} color="#fff" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={glasses}
        aria-valuetext={t.today.waterProgressAria(glasses, goal)}
        className="flex gap-2"
      >
        {Array.from({ length: goal }, (_, i) => (
          <span
            key={i}
            className="border-lake flex-1 rounded-full border"
            style={{
              height: 9,
              background: i < glasses ? 'var(--color-lake)' : '#fff',
              transition: 'background .2s',
            }}
          />
        ))}
      </div>
    </section>
  );
}
