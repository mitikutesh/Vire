import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import type { VireApi } from '@/api/types';
import { useAiKey } from '@/data/useVireData';
import { t } from '@/content/strings';
import type { AiProviderId } from '@/domain/schema';
import { SelectField } from '@/ui/Field';

/**
 * The user's own AI provider key (E7.6).
 *
 * Write-only by design. There is no field showing the stored key, not even
 * masked, and no reveal button — the value is a billable credential, and the only
 * safe posture is that a session can replace it but never read it. The copy says
 * so, so nobody hunts for a button that deliberately does not exist.
 *
 * Without a key the app is fully usable on the built-in starter week; only
 * generation and the offer scan are unavailable. That is why this reads as an
 * optional upgrade rather than a barrier.
 */
export function AiKeySection({ api }: { api: VireApi }) {
  const { status, save, clear } = useAiKey(api, true);
  const [provider, setProvider] = useState<AiProviderId>('anthropic');
  const [key, setKey] = useState('');

  const busy = save.isPending || clear.isPending;

  const submit = () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    save.mutate(
      { provider, key: trimmed },
      // Cleared on success only: a rejected key stays in the box so a typo can be
      // corrected rather than retyped from the source.
      { onSuccess: () => setKey('') },
    );
  };

  const providerLabel =
    status?.provider === 'openai' ? t.settings.aiKeyOpenai : t.settings.aiKeyAnthropic;

  return (
    <section className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <h2 className="disp text-ink flex items-center gap-2 font-bold" style={{ fontSize: 17 }}>
        <KeyRound size={16} className="text-cloud" aria-hidden="true" />
        {t.settings.aiKeySection}
      </h2>

      <p className="text-sub text-sm">{t.settings.aiKeyBlurb}</p>

      <p className="text-ink text-sm font-medium">
        {status?.set ? t.settings.aiKeySet(providerLabel) : t.settings.aiKeyUnset}
      </p>

      <SelectField
        label={t.settings.aiKeyProvider}
        value={provider}
        options={[
          { value: 'anthropic' as const, label: t.settings.aiKeyAnthropic },
          { value: 'openai' as const, label: t.settings.aiKeyOpenai },
        ]}
        onChange={setProvider}
        disabled={busy}
      />

      <label htmlFor="ai-key" className="text-sub text-xs font-semibold tracking-wide uppercase">
        {t.settings.aiKeyLabel}
      </label>
      <input
        id="ai-key"
        // `password`, and no autofill: a manager offering to save this alongside
        // website logins is not what anyone wants for an API key.
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={key}
        onChange={(event) => setKey(event.target.value)}
        placeholder={t.settings.aiKeyPlaceholder}
        disabled={busy}
        className="border-line bg-paper text-ink rounded-xl border px-3 py-2 text-sm outline-none"
      />
      <p className="text-sub text-xs">{t.settings.aiKeyWriteOnly}</p>

      <button
        type="button"
        onClick={submit}
        disabled={busy || key.trim().length === 0}
        className="bg-ink flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {save.isPending ? <Loader2 size={15} className="spin" aria-hidden="true" /> : null}
        {status?.set ? t.settings.aiKeyReplace : t.settings.aiKeySave}
      </button>

      {status?.set ? (
        <button
          type="button"
          onClick={() => clear.mutate()}
          disabled={busy}
          className="text-berry py-2 text-sm font-semibold disabled:opacity-60"
        >
          {t.settings.aiKeyClear}
        </button>
      ) : null}

      {save.isError ? (
        <p role="alert" className="text-berry text-sm font-medium">
          {t.settings.aiKeyFailed}
        </p>
      ) : null}
    </section>
  );
}
