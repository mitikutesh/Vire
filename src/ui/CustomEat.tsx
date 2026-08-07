import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '@/content/strings';
import { C } from '@/design/tokens';
import { isSwap } from '@/domain/log';
import type { SlotEntry, Swap } from '@/domain/schema';

interface CustomEatProps {
  /** Current state of this slot — a swap renders the logged summary. */
  value: SlotEntry | undefined;
  /** The planned meal's calories, shown for comparison once swapped. */
  planned: number;
  onLog: (swap: Swap) => void;
  onClear: () => void;
}

/**
 * "Ate something else?" — the escape hatch that keeps the day honest when real
 * life happens. A swap replaces the planned meal's calories rather than adding
 * to them; the Today tab's extras card is the additive path.
 *
 * Three states: a quiet link, the entry form, and the logged summary.
 */
export function CustomEat({ value, planned, onLog, onClear }: CustomEatProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const nameId = useId();
  const kcalId = useId();

  if (isSwap(value)) {
    const logged = t.meal.swapLogged(value.n, value.k, planned);
    return (
      <div className="bg-cloud-soft flex items-center justify-between gap-2 rounded-xl px-3 py-2">
        <p className="text-ink min-w-0 text-sm">
          {logged.lead}
          <b>{logged.name}</b>
          {logged.kcal}
          <span className="text-sub">{logged.planned}</span>
        </p>
        <button
          type="button"
          aria-label={t.meal.swapRemoveAria}
          onClick={onClear}
          className="shrink-0"
        >
          <X size={15} style={{ color: C.sub }} aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-lake text-left text-sm font-medium"
      >
        {t.meal.swapPrompt}
      </button>
    );
  }

  const submit = () => {
    const parsed = Number.parseInt(kcal, 10);
    // No calories, nothing to log — the kcal figure is the entire point.
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onLog({ n: name.trim(), k: parsed });
    setOpen(false);
    setName('');
    setKcal('');
  };

  return (
    <div className="flex gap-2">
      <input
        id={nameId}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.meal.swapWhat}
        aria-label={t.meal.swapWhat}
        className="border-line bg-paper text-ink min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
      />
      <input
        id={kcalId}
        value={kcal}
        // Digits only: a stray letter would silently become NaN calories.
        onChange={(e) => setKcal(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={t.meal.swapKcal}
        aria-label={t.meal.swapKcal}
        inputMode="numeric"
        className="border-line bg-paper text-ink rounded-xl border px-3 py-2 text-sm outline-none"
        style={{ width: 74 }}
      />
      <button
        type="button"
        onClick={submit}
        className="bg-ink rounded-xl px-3 text-sm font-semibold text-white"
      >
        {t.meal.swapLog}
      </button>
    </div>
  );
}
