import { useState } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { ApiError, type VireApi } from '@/api/types';
import { t } from '@/content/strings';
import { downloadJson } from './download';

/**
 * Your data: take it with you, or take it away (I6).
 *
 * Health-adjacent data the user cannot get out of the app, or cannot get rid of,
 * is data they never really owned. Both halves are deliberately unglamorous, and
 * deletion is deliberately awkward: a typed word rather than a second tap,
 * because every log, every weigh-in and the account itself go with it and there
 * is no undo.
 */
export function DataSection({
  api,
  onDeleted,
  download = downloadJson,
}: {
  api: VireApi;
  /** Called once the account is gone, so the app can sign out. */
  onDeleted: () => void;
  /** Injectable so a test can assert on the payload rather than the download. */
  download?: (filename: string, data: unknown) => void;
}) {
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState('');
  const [asking, setAsking] = useState(false);

  const exportData = async () => {
    setError('');
    setBusy('export');
    try {
      download(t.settings.exportFilename, await api.exportData());
    } catch (cause) {
      console.error('[vire] Exporting your data failed', cause);
      setError(t.settings.exportFailed);
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    setError('');
    setBusy('delete');
    try {
      await api.deleteAccount(confirm);
      onDeleted();
    } catch (cause) {
      console.error('[vire] Deleting the account failed', cause);
      // The data may already be gone; only the generic path can promise it is not.
      setError(
        cause instanceof ApiError && cause.message === 'account_not_closed'
          ? t.settings.deletePartial
          : t.settings.deleteFailed,
      );
    } finally {
      setBusy(null);
    }
  };

  const confirmed = confirm.trim().toUpperCase() === t.settings.deleteConfirmWord;

  return (
    <section className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <h2 className="disp text-ink font-bold" style={{ fontSize: 17 }}>
        {t.settings.dataSection}
      </h2>

      <p className="text-sub text-sm">{t.settings.exportBlurb}</p>
      <button
        type="button"
        onClick={() => void exportData()}
        disabled={busy !== null}
        className="border-line bg-card text-ink flex items-center justify-center gap-2 rounded-full border py-3 text-sm font-semibold disabled:opacity-60"
      >
        {busy === 'export' ? (
          <Loader2 size={15} className="spin" aria-hidden="true" />
        ) : (
          <Download size={15} aria-hidden="true" />
        )}
        {t.settings.exportAction}
      </button>

      {asking ? (
        <>
          <p className="text-berry text-sm font-medium">{t.settings.deleteWarning}</p>
          <label htmlFor="delete-confirm" className="text-sub text-xs font-semibold uppercase">
            {t.settings.deleteConfirmLabel(t.settings.deleteConfirmWord)}
          </label>
          <input
            id="delete-confirm"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="off"
            className="border-line bg-paper text-ink rounded-xl border px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => void deleteAccount()}
            // Enabled only once the word matches: the server checks it too, but
            // there is no reason to let the tap happen before then.
            disabled={!confirmed || busy !== null}
            className="flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--color-berry)' }}
          >
            {busy === 'delete' ? <Loader2 size={15} className="spin" aria-hidden="true" /> : null}
            {t.settings.deleteConfirmAction}
          </button>
          <button
            type="button"
            onClick={() => {
              setAsking(false);
              setConfirm('');
            }}
            className="text-sub text-sm font-medium"
          >
            {t.settings.deleteCancel}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          disabled={busy !== null}
          className="text-berry flex items-center justify-center gap-2 py-2 text-sm font-semibold disabled:opacity-60"
        >
          <Trash2 size={15} aria-hidden="true" />
          {t.settings.deleteAction}
        </button>
      )}

      {error ? (
        <p role="alert" className="text-berry text-sm font-medium">
          {error}
        </p>
      ) : null}
    </section>
  );
}
