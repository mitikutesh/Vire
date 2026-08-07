import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { VireApi } from '@/api/types';
import { useWeighIn } from '@/data/useVireData';
import { t } from '@/content/strings';
import { dateKey } from '@/domain/clock';
import type { Profile } from '@/domain/schema';
import { calcTarget } from '@/domain/target';
import { DecimalField } from '@/ui/Field';

/**
 * Weigh-in entry, inside Settings (I1).
 *
 * Two steps on purpose. Recording the weight is one decision; letting it move the
 * calorie target is another, and it is asked separately because a target that
 * changes without being asked is a target the user stops trusting.
 *
 * The number in "update my target to N kcal" is a **preview**, computed here with
 * the same `calcTarget` the server uses. The stored value is whatever the server
 * computes, because the calorie floors are a health guardrail and a client-side
 * check is one a stale bundle can skip (PLAN §7, guardrail 1).
 */
export function WeighInSection({
  api,
  profile,
  today,
}: {
  api: VireApi;
  profile: Profile;
  /** Injected so the date the weigh-in lands on is the client's own. */
  today: Date;
}) {
  const [kg, setKg] = useState(profile.w);
  const [asked, setAsked] = useState(false);
  const weighIn = useWeighIn(api);

  const preview = calcTarget({ ...profile, w: kg });
  const changesTarget = preview !== profile.target;

  const submit = (applyToProfile: boolean) => {
    weighIn.mutate(
      { date: dateKey(today), kg, applyToProfile },
      // Only leave the question behind once it has been answered.
      { onSuccess: () => setAsked(false) },
    );
  };

  return (
    <section className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <h2 className="disp text-ink font-bold" style={{ fontSize: 17 }}>
        {t.settings.weighInSection}
      </h2>

      <DecimalField label={t.settings.weighInLabel} value={kg} onChange={setKg} />

      {asked ? (
        <>
          <p className="text-sub text-sm">{t.settings.weighInApplyPrompt}</p>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={weighIn.isPending}
            className="bg-ink rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {t.settings.weighInUpdateTarget(preview)}
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={weighIn.isPending}
            className="border-line bg-card text-ink rounded-full border py-3 text-sm font-semibold disabled:opacity-60"
          >
            {t.settings.weighInKeepTarget}
          </button>
        </>
      ) : (
        <button
          type="button"
          // A weight that does not move the target needs no second question, so
          // it saves in one tap.
          onClick={() => (changesTarget ? setAsked(true) : submit(false))}
          disabled={weighIn.isPending}
          className="bg-ink flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {weighIn.isPending ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
          {t.settings.weighInSave}
        </button>
      )}

      {weighIn.isError ? (
        <p role="alert" className="text-berry text-sm font-medium">
          {t.settings.weighInFailed}
        </p>
      ) : null}
      {weighIn.isSuccess && !asked ? (
        <p role="status" className="text-sub text-sm">
          {t.settings.weighInSaved}
        </p>
      ) : null}
    </section>
  );
}
