import { useState } from 'react';
import { Loader2, LogOut, Sparkles, X } from 'lucide-react';
import { ApiError, type ProfileInput, type VireApi } from '@/api/types';
import { ACTIVITY_LEVELS, CITIES, PACE_LEVELS, WATER } from '@/content/plan';
import { t } from '@/content/strings';
import { C } from '@/design/tokens';
import type { Profile } from '@/domain/schema';
import { calcTarget } from '@/domain/target';
import { Dialog } from '@/ui/Dialog';
import { NumberField, SelectField, TextField } from '@/ui/Field';
import { WeighInSection } from '@/weight/WeighInSection';
import { AiKeySection } from './AiKeySection';
import { DataSection } from './DataSection';

/**
 * Profile setup and settings — the same form in two modes.
 *
 * First-run is deliberately non-dismissible: the app has no calorie target until
 * this is saved, so there is nothing useful behind it to escape to.
 *
 * The target shown here is a *preview*. The stored value is whatever the server
 * computes on save, because the calorie floors are a health guardrail and a
 * client-side-only check is one a stale bundle can skip (PLAN §7, guardrail 1).
 */

const DEFAULT_PROFILE: ProfileInput = {
  name: '',
  sex: 'f',
  age: 35,
  h: 170,
  w: 80,
  goalW: 72,
  act: 1.375,
  pace: 500,
  city: 'Helsinki',
  allergies: '',
  waterMl: WATER.defaultGoalMl,
  // The browser knows this, and the server needs it to work out when "17:00
  // local" is for the movement reminder (M5).
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Helsinki',
};

interface SettingsViewProps {
  api: VireApi;
  /** Absent on first run. */
  profile: Profile | null;
  onSaved: (profile: Profile) => void;
  /** Absent on first run, which makes the dialog non-dismissible. */
  onClose?: () => void;
  /** Absent on first run, when there is no plan to replace. */
  onRegenerate?: (() => void) | undefined;
  /** Absent on first run: a weigh-in needs a profile to recompute against. */
  today?: Date | undefined;
  onSignOut: () => void;
}

export function SettingsView({
  api,
  profile,
  onSaved,
  onClose,
  onRegenerate,
  today,
  onSignOut,
}: SettingsViewProps) {
  const firstRun = profile === null;
  const [form, setForm] = useState<ProfileInput>(() => {
    if (!profile) return DEFAULT_PROFILE;
    const { target: _target, ...rest } = profile;
    return rest;
  });
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Two taps, because regenerating throws away the current week's meals, the
  // grocery list and whatever is already ticked off on it.
  const [confirmRegen, setConfirmRegen] = useState(false);

  const set = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const preview = calcTarget(form);

  const save = async () => {
    setError('');
    setIssues({});
    setBusy(true);
    try {
      // The server's copy wins: it recomputed the target, and its ranges are the
      // ones that matter.
      onSaved(await api.saveProfile(form));
    } catch (caught) {
      if (caught instanceof ApiError && caught.issues.length > 0) {
        setIssues(Object.fromEntries(caught.issues.map((i) => [i.field, i.message])));
        setError(t.settings.fixHighlighted);
      } else {
        console.error('[vire] Saving the profile failed', caught);
        setError(t.settings.saveFailed);
      }
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      {firstRun ? <p className="text-sub text-sm">{t.settings.firstRunBlurb}</p> : null}

      <section className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4">
        <h2 className="disp text-ink font-bold" style={{ fontSize: 17 }}>
          {t.settings.youSection}
        </h2>

        <TextField
          label={t.settings.name}
          value={form.name}
          onChange={(v) => set('name', v)}
          placeholder={t.settings.namePlaceholder}
          {...(issues['name'] ? { hint: issues['name'] } : {})}
        />

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={t.settings.age}
            value={form.age}
            onChange={(v) => set('age', v)}
            {...(issues['age'] ? { hint: issues['age'] } : {})}
          />
          <NumberField
            label={t.settings.height}
            value={form.h}
            onChange={(v) => set('h', v)}
            {...(issues['h'] ? { hint: issues['h'] } : {})}
          />
          <NumberField
            label={t.settings.weight}
            value={form.w}
            onChange={(v) => set('w', v)}
            {...(issues['w'] ? { hint: issues['w'] } : {})}
          />
          <NumberField
            label={t.settings.goalWeight}
            value={form.goalW}
            onChange={(v) => set('goalW', v)}
            {...(issues['goalW'] ? { hint: issues['goalW'] } : {})}
          />
        </div>

        <SelectField
          label={t.settings.sex}
          value={form.sex}
          options={[
            { value: 'f' as const, label: t.settings.female },
            { value: 'm' as const, label: t.settings.male },
          ]}
          onChange={(v) => set('sex', v)}
        />

        <SelectField
          label={t.settings.activity}
          value={form.act}
          options={ACTIVITY_LEVELS.map((value, i) => ({
            value,
            label: t.settings.activityLabels[i] ?? String(value),
          }))}
          onChange={(v) => set('act', v)}
        />

        <SelectField
          label={t.settings.pace}
          value={form.pace}
          options={PACE_LEVELS.map((value, i) => ({
            value,
            label: t.settings.paceLabels[i] ?? String(value),
          }))}
          onChange={(v) => set('pace', v)}
        />
      </section>

      <section className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4">
        <h2 className="disp text-ink font-bold" style={{ fontSize: 17 }}>
          {t.settings.foodSection}
        </h2>

        <SelectField
          label={t.settings.city}
          value={form.city}
          options={CITIES.map((city) => ({ value: city as string, label: city }))}
          onChange={(v) => set('city', v)}
        />

        <TextField
          label={t.settings.allergies}
          value={form.allergies}
          onChange={(v) => set('allergies', v)}
          placeholder={t.settings.allergiesPlaceholder}
          // Health guardrail 3: generated plans exclude these, but the user must
          // still be told to check labels.
          hint={t.settings.allergiesNote}
        />

        <NumberField
          label={t.settings.waterGoal}
          value={form.waterMl}
          onChange={(v) => set('waterMl', v)}
          {...(issues['waterMl'] ? { hint: issues['waterMl'] } : {})}
        />
      </section>

      <section className="bg-cloud-soft rounded-2xl p-4">
        <p className="text-ink text-sm font-medium">
          {firstRun ? t.settings.targetFirstRun : t.settings.targetChanged}
        </p>
        <p className="disp text-cloud font-extrabold" style={{ fontSize: 26 }}>
          {t.settings.kcal(preview)}
        </p>
        {form.goalW > 0 && form.goalW < form.w ? (
          <p className="text-sub mt-1 text-xs">{t.settings.onTheWay(form.w, form.goalW)}</p>
        ) : null}
      </section>

      {/* Shown in both modes: a new user can paste a key during first-run setup
          and generate immediately, and it stays editable in Settings (E7.6). */}
      <AiKeySection api={api} />

      {profile && today ? <WeighInSection api={api} profile={profile} today={today} /> : null}

      {onRegenerate ? (
        <section className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4">
          <h2 className="disp text-ink font-bold" style={{ fontSize: 17 }}>
            {t.settings.planSection}
          </h2>
          <p className="text-sub text-sm">{t.settings.planBlurb}</p>
          <button
            type="button"
            onClick={() => (confirmRegen ? onRegenerate() : setConfirmRegen(true))}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white"
            // Berry on the confirm tap: the same destructive signal the rest of
            // the app uses, and the only place a button is not ink.
            style={{ background: confirmRegen ? C.berry : C.ink }}
          >
            <Sparkles size={15} aria-hidden="true" />
            {confirmRegen ? t.settings.regenerateConfirm : t.settings.regenerate}
          </button>
          {confirmRegen ? (
            <p role="alert" className="text-berry text-xs font-medium">
              {t.settings.regenerateWarning}
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="text-berry text-sm font-medium">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="bg-ink flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white"
        style={{ opacity: busy ? 0.7 : 1 }}
      >
        {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
        {firstRun ? t.settings.saveFirstRun : t.settings.save}
      </button>

      {onClose ? <DataSection api={api} onDeleted={onSignOut} /> : null}

      <button
        type="button"
        onClick={onSignOut}
        disabled={busy}
        className="border-line bg-card text-ink flex items-center justify-center gap-2 rounded-full border py-3 text-sm font-semibold"
      >
        <LogOut size={16} aria-hidden="true" />
        {t.settings.signOut}
      </button>

      {/* Health guardrail 2: the estimate is named, and the doctor is named. */}
      <p className="text-sub pb-4 text-xs">{t.settings.doctorNote}</p>
    </>
  );

  return (
    <Dialog
      title={firstRun ? t.settings.firstRunTitle : t.settings.title}
      onClose={onClose}
      headerAction={
        onClose ? (
          <button
            type="button"
            aria-label={t.settings.closeAria}
            onClick={onClose}
            className="border-line bg-card rounded-full border p-2"
          >
            <X size={17} aria-hidden="true" style={{ color: C.ink }} />
          </button>
        ) : null
      }
    >
      {body}
    </Dialog>
  );
}
