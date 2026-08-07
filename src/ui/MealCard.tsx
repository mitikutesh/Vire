import { useId, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { SLOT_LABEL, t } from '@/content/strings';
import { C } from '@/design/tokens';
import { isEaten, isSwap } from '@/domain/log';
import type { Meal, SlotEntry, SlotKey, Swap } from '@/domain/schema';
import { CustomEat } from './CustomEat';
import { MealDetails } from './MealDetails';

interface MealCardProps {
  slot: SlotKey;
  meal: Meal;
  entry: SlotEntry | undefined;
  onToggle: () => void;
  onLogSwap: (swap: Swap) => void;
  onClearSwap: () => void;
  defaultOpen?: boolean;
  /** Past days are read-only (I3 history). */
  disabled?: boolean;
}

/**
 * One meal in the day.
 *
 * Accessibility fix over the prototype (I4): the prototype nested an
 * interactive `role="checkbox"` span *inside* the expand `<button>` and relied
 * on stopPropagation. That is invalid HTML, and it makes the eaten toggle
 * unreachable for keyboard and screen-reader users. Here the checkbox and the
 * expander are siblings in a plain container, so each is independently
 * focusable and announced.
 */
export function MealCard({
  slot,
  meal,
  entry,
  onToggle,
  onLogSwap,
  onClearSwap,
  defaultOpen = false,
  disabled = false,
}: MealCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const meta = SLOT_LABEL[slot];
  const eaten = isEaten(entry);
  const swap = isSwap(entry) ? entry : null;

  return (
    <div className="border-line bg-card rounded-2xl border">
      {/* A container, not a button — see the note above. */}
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          role="checkbox"
          aria-checked={eaten}
          aria-label={t.meal.eatenCheckboxAria(meta.label)}
          onClick={onToggle}
          disabled={disabled}
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{
            width: 26,
            height: 26,
            cursor: disabled ? 'default' : 'pointer',
            background: eaten ? C.cloud : 'transparent',
            border: `2px solid ${eaten ? C.cloud : C.line}`,
          }}
        >
          {eaten ? <Check size={15} color="#fff" strokeWidth={3} aria-hidden="true" /> : null}
        </button>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="text-sub block text-xs font-semibold tracking-wide uppercase">
              {meta.label} · {meta.hint}
            </span>
            <span
              className="text-ink block text-sm font-semibold"
              style={{
                textDecoration: eaten ? 'line-through' : 'none',
                opacity: eaten ? 0.6 : 1,
              }}
            >
              {meal.n}
              {meal.fi ? <span className="text-sub font-normal"> · {meal.fi}</span> : null}
            </span>
          </span>

          <span
            className="disp shrink-0 text-sm font-semibold"
            style={{ color: swap ? C.cloud : C.sub }}
          >
            {swap ? swap.k : meal.k}
          </span>

          <ChevronDown
            size={18}
            aria-hidden="true"
            style={{
              color: C.sub,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform .2s',
            }}
          />
        </button>
      </div>

      {open ? (
        <div id={panelId} className="border-line border-t px-4 pb-4">
          {!disabled ? (
            <div className="pt-3">
              <CustomEat value={entry} planned={meal.k} onLog={onLogSwap} onClear={onClearSwap} />
            </div>
          ) : null}
          <MealDetails meal={meal} />
        </div>
      ) : null}
    </div>
  );
}
