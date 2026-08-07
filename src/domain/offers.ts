/**
 * How long an offer scan stays trustworthy.
 *
 * Supermarket offers in Finland turn over weekly, so twelve hours is not about
 * the offers changing — it is about the cost of asking. A scan is a
 * web-searching model call, the most expensive request this app makes, and the
 * Shop tab gets opened several times per shopping trip. Shared between the route
 * (which sets the TTL) and the client (which decides whether to auto-scan) so the
 * two cannot disagree about what "stale" means.
 */
export const OFFER_TTL_MS = 12 * 60 * 60 * 1000;

/** Per user, per day. A scan is the priciest call the app makes. */
export const SCAN_LIMIT_PER_DAY = 4;

/** Is a scan old enough to be worth redoing? A missing scan always is. */
export function offersStale(checkedAt: number | undefined, now: number): boolean {
  if (checkedAt === undefined) return true;
  return now - checkedAt >= OFFER_TTL_MS;
}
