import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/types';
import { starterPlan } from '@/content/starter-plan';
import { t } from '@/content/strings';
import { OFFER_TTL_MS, offersStale } from '@/domain/offers';
import type { Deal, OfferScan } from '@/domain/schema';
import { OffersCard } from './OffersCard';

const ITEMS = starterPlan(1).groc;
const FIRST = ITEMS[0]!;
const SECOND = ITEMS[1]!;

const scanAt = (
  checkedAt: number,
  deals: Deal[] = [],
  note = 'Checked the chains.',
): OfferScan => ({
  checkedAt,
  deals,
  note,
});

function setup(
  options: {
    offers?: OfferScan | null;
    loaded?: boolean;
    scanning?: boolean;
    failed?: unknown;
  } = {},
) {
  const onScan = vi.fn();
  const onApply = vi.fn();
  render(
    <OffersCard
      offers={options.offers ?? null}
      loaded={options.loaded ?? true}
      items={ITEMS}
      scanning={options.scanning ?? false}
      failed={options.failed ?? null}
      onScan={onScan}
      onApply={onApply}
    />,
  );
  return { onScan, onApply, user: userEvent.setup() };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('offersStale', () => {
  it('treats a missing scan as stale', () => {
    expect(offersStale(undefined, Date.now())).toBe(true);
  });

  it('keeps a fresh scan', () => {
    const now = Date.UTC(2026, 7, 8, 12);
    expect(offersStale(now - 60_000, now)).toBe(false);
  });

  it('gives up on a scan older than the window', () => {
    const now = Date.UTC(2026, 7, 8, 12);
    expect(offersStale(now - OFFER_TTL_MS, now)).toBe(true);
    expect(offersStale(now - OFFER_TTL_MS - 1, now)).toBe(true);
  });
});

describe('scanning on open', () => {
  it('scans when there is nothing cached', async () => {
    const { onScan } = setup();
    await waitFor(() => expect(onScan).toHaveBeenCalledTimes(1));
  });

  it('does not scan when the cache is fresh', async () => {
    // A scan is the priciest request the app makes, and this tab gets opened
    // several times per shopping trip.
    const { onScan } = setup({ offers: scanAt(Date.now() - 60_000) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onScan).not.toHaveBeenCalled();
  });

  it('scans again once the cache is stale', async () => {
    const { onScan } = setup({ offers: scanAt(Date.now() - OFFER_TTL_MS - 1) });
    await waitFor(() => expect(onScan).toHaveBeenCalledTimes(1));
  });

  it('waits until the cached scan has been read', async () => {
    // Scanning before the read lands would spend a scan to replace a cache that
    // was about to arrive.
    const { onScan } = setup({ loaded: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onScan).not.toHaveBeenCalled();
  });

  it('scans only once even if React mounts the effect twice', async () => {
    // StrictMode double-invokes effects in development, and each scan costs a
    // slice of the daily allowance.
    const { onScan } = setup();
    await waitFor(() => expect(onScan).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});

describe('while scanning', () => {
  it('says what it is doing on a first scan', () => {
    setup({ scanning: true });
    expect(screen.getByRole('status')).toHaveTextContent(t.shop.offersScanning);
  });

  it('says something shorter when refreshing an existing scan', () => {
    setup({ scanning: true, offers: scanAt(Date.now()) });
    expect(screen.getByRole('status')).toHaveTextContent(t.shop.offersRefreshing);
  });

  it('does not offer a second refresh mid-scan', () => {
    setup({ scanning: true });
    expect(screen.getByRole('button', { name: t.shop.offersRefreshAria })).toBeDisabled();
  });
});

describe('results', () => {
  const deals: Deal[] = [
    { id: FIRST.id, store: 'S', deal: '−20 %' },
    { id: SECOND.id, store: 'K', deal: '2 for 1' },
  ];

  it('counts the matches and names them', () => {
    setup({ offers: scanAt(Date.now(), deals) });
    expect(screen.getByText(t.shop.offersFound(2))).toBeInTheDocument();
    expect(screen.getByText(FIRST.n)).toBeInTheDocument();
  });

  it('assigns every matched item to its discount store in one tap', () => {
    const { onApply } = setup({ offers: scanAt(Date.now(), deals) });
    screen.getByRole('button', { name: t.shop.offersApply(2) }).click();
    expect(onApply).toHaveBeenCalledWith(deals);
  });

  it('says so plainly when nothing matched', () => {
    setup({ offers: scanAt(Date.now(), []) });
    expect(screen.getByText(new RegExp(t.shop.offersNone.trim()))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tag/ })).not.toBeInTheDocument();
  });

  it('ignores a cached deal for an item no longer on the list', () => {
    // The server clamps to the plan, but a cached scan can outlive the list it was
    // run against.
    setup({ offers: scanAt(Date.now(), [{ id: 'gone', store: 'S', deal: '−20 %' }]) });
    expect(screen.getByText(new RegExp(t.shop.offersNone.trim()))).toBeInTheDocument();
  });

  it('labels the scan best-effort, with when it was checked (guardrail 5)', () => {
    // The load-bearing part of this card: nothing here is a price.
    const checkedAt = Date.UTC(2026, 7, 8, 9, 30);
    setup({ offers: scanAt(checkedAt, deals) });
    expect(
      screen.getByText(t.shop.offersFooter(new Date(checkedAt).toLocaleString())),
    ).toBeInTheDocument();
    expect(screen.getByText(/verify with the S\/K price links/)).toBeInTheDocument();
  });

  it('shows the provider’s note alongside the count', () => {
    setup({ offers: scanAt(Date.now(), deals, 'Read s-kaupat and K-Ruoka.') });
    expect(screen.getByText('Read s-kaupat and K-Ruoka.')).toBeInTheDocument();
  });
});

describe('failures', () => {
  it('offers a retry and points at the deals links', () => {
    setup({ failed: new ApiError(502, 'scan_failed') });
    expect(screen.getByRole('alert')).toHaveTextContent(t.shop.offersError);
    expect(screen.getByRole('button', { name: t.shop.offersRefreshAria })).toBeEnabled();
  });

  it('explains a spent allowance rather than calling it an error', () => {
    setup({ failed: new ApiError(429, 'rate_limited') });
    expect(screen.getByRole('alert')).toHaveTextContent(t.shop.offersRateLimited);
  });

  it('shows no stale results beside a failure', () => {
    setup({ failed: new ApiError(502, 'scan_failed'), offers: scanAt(Date.now()) });
    expect(screen.queryByText(/verify with the S\/K price links/)).not.toBeInTheDocument();
  });
});
