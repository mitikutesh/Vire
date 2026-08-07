import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '@/content/strings';
import type { KcalEntry } from '@/domain/schema';

/**
 * "Ate something extra?" — the additive path.
 *
 * The distinction the helper text spells out matters to the arithmetic: an extra
 * is added on top of the planned meals, whereas a swap *replaces* one meal's
 * calories. Getting them the wrong way round is the difference between a day that
 * adds up and one that quietly does not, which is why both paths exist and why
 * this card names the other one.
 *
 * A real `<form>`, so Enter submits — the prototype needed a tap on Add.
 */
export function ExtrasCard({
  extras,
  onAdd,
  onRemove,
  readOnly = false,
}: {
  extras: readonly KcalEntry[];
  onAdd: (entry: KcalEntry) => void;
  onRemove: (index: number) => void;
  /** A past day (I3): what was eaten is shown, the entry form is not. */
  readOnly?: boolean;
}) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const nameId = useId();
  const kcalId = useId();

  const submit = () => {
    const parsed = Number.parseInt(kcal, 10);
    // No calories, nothing to add: the whole point of the row is the number, and
    // the name is optional.
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onAdd({ n: name.trim() || 'Extra', k: parsed });
    setName('');
    setKcal('');
  };

  return (
    <section className="border-line bg-card flex flex-col gap-2 rounded-2xl border p-4">
      <p className="text-ink text-sm font-semibold">
        {readOnly ? t.today.extraTitlePast : t.today.extraTitle}
      </p>
      {readOnly ? null : (
        <p className="text-sub text-xs" style={{ marginTop: -4 }}>
          {t.today.extraHelp}
        </p>
      )}

      {readOnly ? null : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex gap-2"
        >
          <label htmlFor={nameId} className="sr-only">
            {t.today.extraWhat}
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.today.extraWhat}
            className="border-line bg-paper text-ink min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
          />

          <label htmlFor={kcalId} className="sr-only">
            {t.today.extraKcal}
          </label>
          <input
            id={kcalId}
            value={kcal}
            // Digits only, so a stray letter cannot make the row unparseable.
            onChange={(event) => setKcal(event.target.value.replace(/\D/g, ''))}
            placeholder={t.today.extraKcal}
            inputMode="numeric"
            className="border-line bg-paper text-ink rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ width: 76 }}
          />

          <button type="submit" className="bg-ink rounded-xl px-3 text-sm font-semibold text-white">
            {t.today.extraAdd}
          </button>
        </form>
      )}

      {extras.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {extras.map((entry, i) => (
            <li
              key={`${entry.n}-${i}`}
              className="text-ink flex items-center justify-between text-sm"
            >
              <span>{t.today.extraRow(entry.n, entry.k)}</span>
              {readOnly ? null : (
                <button
                  type="button"
                  aria-label={t.today.removeAria(entry.n)}
                  onClick={() => onRemove(i)}
                >
                  <X size={15} className="text-sub" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
