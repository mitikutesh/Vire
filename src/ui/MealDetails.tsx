import { ExternalLink, Youtube } from 'lucide-react';
import { t } from '@/content/strings';
import { C } from '@/design/tokens';
import { ytLink } from '@/domain/links';
import type { Meal } from '@/domain/schema';
import { MacroChips } from './MacroChips';

/**
 * What's in the meal and how to cook it. Snacks carry neither steps nor a video
 * term, so those blocks simply do not render — an "assembly only" note would be
 * noise for "apple + almonds".
 */
export function MealDetails({ meal }: { meal: Meal }) {
  const hasSteps = Boolean(meal.st?.length);

  return (
    <div className="flex flex-col gap-3 pt-3">
      <MacroChips meal={meal} />

      <div>
        <p className="text-sub mb-1 text-xs font-semibold tracking-wide uppercase">
          {t.meal.ingredients}
        </p>
        <ul className="flex flex-col gap-1">
          {meal.ing.map((line) => (
            <li key={line} className="text-ink flex gap-2 text-sm">
              <span className="text-cloud" aria-hidden="true">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {hasSteps ? (
        <div>
          <p className="text-sub mb-1 text-xs font-semibold tracking-wide uppercase">
            {t.meal.howToMake}
          </p>
          <ol className="flex flex-col gap-1">
            {meal.st?.map((step, i) => (
              <li key={step} className="text-ink flex gap-2 text-sm">
                <span className="disp text-cloud font-bold" style={{ minWidth: 14 }}>
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {meal.yt ? (
        <a
          href={ytLink(meal.yt)}
          target="_blank"
          rel="noreferrer"
          className="bg-paper text-ink inline-flex items-center gap-2 self-start rounded-full px-3 py-2 text-sm font-medium"
        >
          <Youtube size={16} style={{ color: C.berry }} aria-hidden="true" />
          {t.meal.watch}
          <ExternalLink size={13} style={{ color: C.sub }} aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}
