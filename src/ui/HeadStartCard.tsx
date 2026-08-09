import { Clock } from 'lucide-react';
import { SLOT_LABEL, t } from '@/content/strings';
import type { PlacedPrep } from '@/domain/prep';

/**
 * What to start ahead of time (E7.8).
 *
 * Two lists, never two cards: the app already refuses streaks and badges on the
 * grounds that piling on signals makes people quit, and the same argument
 * applies to interruptions. Two meals needing a head start tomorrow is one
 * heading with two rows.
 *
 * The safety line is not decoration. Guardrail 7 covers the one feature where
 * the model's output is an instruction to leave food out for hours, and it has
 * to appear wherever prep does.
 */
export function HeadStartCard({ today, tonight }: { today: PlacedPrep[]; tonight: PlacedPrep[] }) {
  if (today.length === 0 && tonight.length === 0) return null;

  return (
    <section className="border-line bg-card rounded-2xl border p-4">
      {today.length > 0 ? <PrepList title={t.prep.todayTitle} items={today} /> : null}
      {tonight.length > 0 ? (
        <div className={today.length > 0 ? 'border-line mt-4 border-t pt-4' : undefined}>
          <PrepList title={t.prep.tonightTitle} items={tonight} />
        </div>
      ) : null}
      <p className="text-sub mt-3 text-xs">{t.prep.safetyNote}</p>
    </section>
  );
}

function PrepList({ title, items }: { title: string; items: PlacedPrep[] }) {
  return (
    <>
      <h2 className="disp text-ink flex items-center gap-2 text-sm font-bold">
        <Clock size={14} className="text-cloud" aria-hidden="true" />
        {title}
      </h2>
      <ul className="mt-2 flex flex-col gap-3">
        {items.map((item) => (
          <li key={`${item.weekday}-${item.slot}-${item.stage.do}`} className="flex flex-col">
            <span className="text-ink text-sm font-semibold">{item.stage.do}</span>
            <span className="text-sub text-xs">
              {t.prep.forMeal(SLOT_LABEL[item.slot].label, item.mealName)}
            </span>
            <span className="text-sub text-xs">
              {t.prep.startAt(clockTime(item.start))}
              {item.stage.active > 0 ? ` · ${t.prep.activeMinutes(item.stage.active)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Local wall-clock time, zero-padded, the way the rest of the app writes it. */
function clockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
