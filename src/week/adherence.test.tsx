import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DatedLog } from '@/api/types';
import { starterPlan } from '@/content/starter-plan';
import { t } from '@/content/strings';
import { emptyLog } from '@/domain/log';
import type { StoredPlan } from '@/domain/schema';
import { AdherenceSummary } from './AdherenceSummary';

const PLAN: StoredPlan = { ...starterPlan(1_700_000_000_000), planId: 'plan-1' };
const TARGET = 1600;

/** 2026-08-10 is a Monday, so weekday indices are easy to reason about. */
const day = (date: string, log: Partial<DatedLog> = {}): DatedLog => ({
  ...emptyLog(),
  date,
  ...log,
});

const draw = (logs: DatedLog[]) =>
  render(<AdherenceSummary logs={logs} plan={PLAN} target={TARGET} />);

const bars = () => screen.getAllByRole('listitem');

describe('the summary', () => {
  it('says nothing has been logged yet rather than drawing empty bars', () => {
    draw([]);
    expect(screen.getByText(t.week.adherenceEmpty)).toBeInTheDocument();
  });

  it('shows one row per logged day', () => {
    draw([day('2026-08-10'), day('2026-08-09'), day('2026-08-08')]);
    expect(bars()).toHaveLength(3);
  });

  it('reads oldest first, the same direction as the trend above it', () => {
    // The route returns newest first; the display reverses so the two cards on
    // this tab do not read in opposite directions.
    draw([day('2026-08-12'), day('2026-08-11'), day('2026-08-10')]);
    // Monday, Tuesday, Wednesday.
    expect(bars()[0]).toHaveTextContent('Mon');
    expect(bars()[2]).toHaveTextContent('Wed');
  });

  it('counts a swap by its own calories', () => {
    // Exact, because a swap's calories are in the log itself.
    draw([day('2026-08-10', { m: { b: { n: 'Ate out', k: 640 } } })]);
    expect(screen.getByText(t.week.adherenceRow(640, TARGET))).toBeInTheDocument();
  });

  it('counts extras on top', () => {
    draw([day('2026-08-10', { extra: [{ n: 'Cake', k: 300 }] })]);
    expect(screen.getByText(t.week.adherenceRow(300, TARGET))).toBeInTheDocument();
  });

  it('counts a planned meal at the plan’s calories', () => {
    const monday = PLAN.days[0];
    draw([day('2026-08-10', { m: { b: true } })]);
    expect(screen.getByText(t.week.adherenceRow(monday.b.k, TARGET))).toBeInTheDocument();
  });

  it('shows a day over budget in berry', () => {
    draw([day('2026-08-10', { extra: [{ n: 'Feast', k: 3000 }] })]);
    const fill = bars()[0]?.querySelector('span > span');
    expect(fill?.getAttribute('style')).toContain('--color-berry');
  });

  it('shows a day within budget in cloudberry', () => {
    draw([day('2026-08-10', { extra: [{ n: 'Snack', k: 200 }] })]);
    const fill = bars()[0]?.querySelector('span > span');
    expect(fill?.getAttribute('style')).toContain('--color-cloud');
  });

  it('keeps an over-budget bar inside its row', () => {
    // Scaled against the busiest day rather than the target, so 3000 of 1600 does
    // not draw a bar twice the width of the card.
    draw([day('2026-08-10', { extra: [{ n: 'Feast', k: 4000 }] }), day('2026-08-11')]);
    for (const bar of bars()) {
      const width = bar.querySelector('span > span')?.getAttribute('style') ?? '';
      const percent = Number(/width:\s*(\d+)%/.exec(width)?.[1] ?? '0');
      expect(percent).toBeLessThanOrEqual(100);
    }
  });

  it('offers no streak and no badge', () => {
    // Explicit in the story: a streak turns one bad Tuesday into a reason to give
    // up, which is the opposite of what this app is for.
    draw([day('2026-08-10'), day('2026-08-11')]);
    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/🔥|day in a row/i)).not.toBeInTheDocument();
  });

  it('says the numbers are estimates and only cover logged days', () => {
    draw([day('2026-08-10')]);
    expect(screen.getByText(t.week.adherenceNote)).toBeInTheDocument();
  });
});
