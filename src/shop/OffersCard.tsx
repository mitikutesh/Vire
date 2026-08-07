import { useEffect, useRef } from 'react';
import { Loader2, RefreshCw, Tag } from 'lucide-react';
import { ApiError } from '@/api/types';
import { t } from '@/content/strings';
import { offersStale } from '@/domain/offers';
import type { Deal, GrocItem, OfferScan } from '@/domain/schema';

/**
 * This week's offers (E4.3).
 *
 * Guardrail 5 is the point of this card, not a footnote on it. The scan is a model
 * reading public offer pages, so the footer names it as such, states when it was
 * checked, and sends the user to the chains' own price links to verify. Nothing
 * here claims to be a price.
 *
 * It scans on open only when the cache is stale. A scan is the most expensive
 * request the app makes, and the Shop tab gets opened several times per trip.
 */
export function OffersCard({
  offers,
  loaded,
  items,
  scanning,
  failed,
  onScan,
  onApply,
}: {
  offers: OfferScan | null;
  /** False until the cached scan has been read; scanning before that would race. */
  loaded: boolean;
  items: readonly GrocItem[];
  scanning: boolean;
  failed: unknown;
  onScan: () => void;
  /** Assign every matched item to the chain it is discounted at. */
  onApply: (deals: readonly Deal[]) => void;
}) {
  const autoScanned = useRef(false);

  useEffect(() => {
    if (!loaded || scanning || autoScanned.current) return;
    // Once per mount, and only when there is nothing fresh to show. The ref is
    // what stops StrictMode's double-invoke from spending two scans.
    if (offersStale(offers?.checkedAt, Date.now())) {
      autoScanned.current = true;
      onScan();
    }
  }, [loaded, scanning, offers, onScan]);

  // Only deals for items still on the list: the server clamps to the plan, but a
  // cached scan can outlive a filter change here.
  const known = new Set(items.map((item) => item.id));
  const deals = (offers?.deals ?? []).filter((deal) => known.has(deal.id));

  return (
    <section className="border-line bg-card flex flex-col gap-2 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink flex items-center gap-2 text-sm font-semibold">
          <Tag size={15} className="text-cloud shrink-0" aria-hidden="true" />
          {t.shop.offersTitle}
        </p>
        <button
          type="button"
          onClick={onScan}
          disabled={scanning}
          aria-label={t.shop.offersRefreshAria}
          className="border-line rounded-full border p-1 disabled:opacity-40"
        >
          {scanning ? (
            <Loader2 size={13} className="spin text-cloud" aria-hidden="true" />
          ) : (
            <RefreshCw size={13} className="text-sub" aria-hidden="true" />
          )}
        </button>
      </div>

      {scanning ? (
        <p role="status" className="text-sub text-xs">
          {offers ? t.shop.offersRefreshing : t.shop.offersScanning}
        </p>
      ) : null}

      {!scanning && failed ? (
        <p role="alert" className="text-berry text-xs">
          {failed instanceof ApiError && failed.status === 429
            ? t.shop.offersRateLimited
            : t.shop.offersError}
        </p>
      ) : null}

      {!scanning && !failed && offers ? (
        <>
          <p className="text-ink text-sm">
            {deals.length > 0 ? (
              <>
                <b>{t.shop.offersFound(deals.length)}</b>
                {t.shop.offersFoundTail}
              </>
            ) : (
              t.shop.offersNone
            )}
            <span className="text-sub">{offers.note}</span>
          </p>

          {deals.length > 0 ? (
            <>
              <ul className="flex flex-col gap-1">
                {deals.map((deal) => (
                  <li key={deal.id} className="text-sub text-xs">
                    <span className="text-ink font-medium">{nameFor(items, deal.id)}</span> ·{' '}
                    {deal.store} · {deal.deal}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onApply(deals)}
                className="bg-ink rounded-full py-2 text-sm font-semibold text-white"
              >
                {t.shop.offersApply(deals.length)}
              </button>
            </>
          ) : null}

          {/* Guardrail 5: best-effort, timestamped, and points at the authority. */}
          <p className="text-sub text-xs">
            {t.shop.offersFooter(new Date(offers.checkedAt).toLocaleString())}
          </p>
        </>
      ) : null}
    </section>
  );
}

const nameFor = (items: readonly GrocItem[], id: string) =>
  items.find((item) => item.id === id)?.n ?? id;
