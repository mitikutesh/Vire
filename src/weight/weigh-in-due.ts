import type { DatedWeight } from '@/api/types';
import { dateKey } from '@/domain/clock';

/** A week between weigh-ins: enough for a real change, short enough to stay honest. */
export const WEIGH_IN_INTERVAL_DAYS = 7;

/**
 * Is a weigh-in due?
 *
 * A card, not a nag (I1). It appears when the last weigh-in is a week old — or
 * when there has never been one — and it goes away the moment one is recorded.
 * Nothing here escalates, repeats, or counts how long it has been ignored.
 *
 * The reference date is the caller's, because "a week ago" is a question about the
 * user's calendar rather than the server's.
 */
export function weighInDue(entries: readonly DatedWeight[], today: Date): boolean {
  const last = entries.at(-1);
  if (!last) return true;

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - WEIGH_IN_INTERVAL_DAYS);
  // String comparison, because both sides are ISO calendar dates and comparing
  // them as dates would drag time zones into a question about days.
  return last.date <= dateKey(cutoff);
}
