import { Footprints, X } from 'lucide-react';
import { QUICK_EX } from '@/content/plan';
import { t } from '@/content/strings';
import type { Exercise } from '@/content/plan';
import type { KcalEntry } from '@/domain/schema';

/**
 * The day's movement: the planned rotation entry plus anything else that happened.
 *
 * Two separate things on purpose. The planned entry is a single done/not-done flag
 * (`log.ex`), because it is the same activity every week and a checkbox is the
 * whole interaction. Extra movement is a list, because it is open-ended.
 */
export function MovementCard({
  exercise,
  done,
  extra,
  onToggleDone,
  onAdd,
  onRemove,
}: {
  exercise: Exercise;
  done: boolean;
  extra: readonly KcalEntry[];
  onToggleDone: () => void;
  onAdd: (entry: Exercise) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-center gap-3">
        <Footprints size={20} className="text-cloud shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sub text-xs font-semibold tracking-wide uppercase">
            {t.today.movementLabel}
          </p>
          <p className="text-ink text-sm font-semibold">
            {t.today.movementSummary(exercise.n, exercise.min)}{' '}
            <span className="text-sub font-normal">{t.today.movementKcal(exercise.k)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={done}
          className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold"
          style={{
            background: done ? 'var(--color-cloud)' : 'var(--color-paper)',
            color: done ? '#fff' : 'var(--color-ink)',
          }}
        >
          {done ? t.today.done : t.today.markDone}
        </button>
      </div>

      <ul className="flex flex-wrap gap-2">
        {QUICK_EX.map((quick) => (
          <li key={quick.n}>
            <button
              type="button"
              onClick={() => onAdd(quick)}
              className="border-line bg-paper text-sub rounded-full border px-3 py-1 text-xs font-medium"
            >
              + {quick.n}
            </button>
          </li>
        ))}
      </ul>

      {extra.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {extra.map((entry, i) => (
            <li
              // Index in the key because the same activity can be added twice and
              // there is no id; the list is short and only ever appended to or
              // filtered.
              key={`${entry.n}-${i}`}
              className="text-ink flex items-center justify-between text-sm"
            >
              <span>{t.today.exerciseRow(entry.n, entry.k)}</span>
              <button
                type="button"
                aria-label={t.today.removeAria(entry.n)}
                onClick={() => onRemove(i)}
              >
                <X size={15} className="text-sub" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
