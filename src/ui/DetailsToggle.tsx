import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { t } from '@/content/strings';
import type { Meal } from '@/domain/schema';
import { MealDetails } from './MealDetails';

/**
 * Collapsed recipe details for the Now tab's single meal card, where the meal
 * is already the focus and the ingredients are a deliberate second step.
 */
export function DetailsToggle({ meal }: { meal: Meal }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="border-line border-t">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="text-lake flex w-full items-center justify-center gap-1 py-3 text-sm font-medium"
      >
        {open ? t.meal.detailsHide : t.meal.detailsShow}
        <ChevronDown
          size={16}
          aria-hidden="true"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
        />
      </button>
      {open ? (
        <div id={panelId} className="px-5 pb-5">
          <MealDetails meal={meal} />
        </div>
      ) : null}
    </div>
  );
}
