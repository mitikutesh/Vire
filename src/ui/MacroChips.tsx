import { t } from '@/content/strings';
import type { Meal } from '@/domain/schema';

/**
 * Calories plus the three macros. The kcal chip carries the cloudberry accent
 * because it is the number the user is actually managing; the macros are
 * context, and are labelled as estimates on the Today tab (guardrail 4).
 */
export function MacroChips({ meal }: { meal: Meal }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="bg-cloud-soft text-cloud rounded-full px-2 py-1 text-xs font-semibold">
        {t.meal.macroKcal(meal.k)}
      </span>
      <Chip>{t.meal.macroProtein(meal.p)}</Chip>
      <Chip>{t.meal.macroCarbs(meal.c)}</Chip>
      <Chip>{t.meal.macroFat(meal.f)}</Chip>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-paper text-sub rounded-full px-2 py-1 text-xs font-medium">{children}</span>
  );
}
