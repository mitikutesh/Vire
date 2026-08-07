import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { starterPlan } from '@/content/starter-plan';
import { SLOTS } from '@/content/plan';
import { DAY_NAMES, t } from '@/content/strings';
import type { WeekdayIndex } from '@/domain/constants';
import type { StoredPlan } from '@/domain/schema';
import { WeekView } from './WeekView';

const PLAN: StoredPlan = { ...starterPlan(1_700_000_000_000), planId: 'plan-1' };

/** Wednesday, so "today" is neither the first nor the last row. */
const WEDNESDAY: WeekdayIndex = 2;

function setup(options: { plan?: StoredPlan; today?: WeekdayIndex } = {}) {
  render(<WeekView plan={options.plan ?? PLAN} today={options.today ?? WEDNESDAY} />);
  return { user: userEvent.setup() };
}

/** The disclosure button for a day, found by the name the row announces. */
const dayButton = (day: WeekdayIndex) =>
  screen.getByRole('button', { name: new RegExp(DAY_NAMES[day]) });

/**
 * The expanded panel for a day, reached through the button's `aria-controls` —
 * which also checks that the attribute points at something real.
 */
function panelFor(day: WeekdayIndex) {
  const id = dayButton(day).getAttribute('aria-controls');
  const panel = id ? document.getElementById(id) : null;
  if (!panel) throw new Error(`No panel for ${DAY_NAMES[day]}`);
  return within(panel);
}

describe('the week', () => {
  it('lists all seven days', () => {
    setup();
    for (const day of [0, 1, 2, 3, 4, 5, 6] as WeekdayIndex[]) {
      expect(dayButton(day)).toBeInTheDocument();
    }
  });

  it('opens today and leaves the rest closed', () => {
    // "What am I eating today" is the question that brings someone here.
    setup();
    expect(dayButton(WEDNESDAY)).toHaveAttribute('aria-expanded', 'true');
    expect(dayButton(0)).toHaveAttribute('aria-expanded', 'false');
    expect(dayButton(6)).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks only today', () => {
    setup();
    expect(screen.getAllByText(t.week.todayBadge)).toHaveLength(1);
  });

  it('shows the day’s five meals and its exercise when open', () => {
    setup();
    const panel = panelFor(WEDNESDAY);
    const wednesday = PLAN.days[WEDNESDAY];
    for (const slot of SLOTS) {
      // Scoped to the panel: the card's headline is the day's dinner, so the
      // dinner name legitimately appears twice on screen.
      expect(panel.getByText(wednesday[slot].n)).toBeInTheDocument();
    }
    expect(panel.getByText(t.week.move)).toBeInTheDocument();
  });

  it('totals the day’s calories from its meals', () => {
    setup();
    const total = SLOTS.reduce((sum, slot) => sum + PLAN.days[WEDNESDAY][slot].k, 0);
    expect(screen.getByText(new RegExp(`${total} kcal`))).toBeInTheDocument();
  });

  it('opens one day at a time', async () => {
    const { user } = setup();
    await user.click(dayButton(5));

    expect(dayButton(5)).toHaveAttribute('aria-expanded', 'true');
    // Today gave way: two open panels on a phone-width column is a scroll hunt.
    expect(dayButton(WEDNESDAY)).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes a day when tapped again', async () => {
    const { user } = setup();
    await user.click(dayButton(WEDNESDAY));
    expect(dayButton(WEDNESDAY)).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('the weekly average', () => {
  it('says the week came from the built-in plan when it did', () => {
    // Guardrail 3 again: a starter week carries a different promise from a
    // generated one, and the note is where that difference is visible.
    setup();
    expect(screen.getByText(/from the built-in Finnish starter plan/)).toBeInTheDocument();
  });

  it('says it was generated for the profile when it was', () => {
    setup({ plan: { ...PLAN, starter: false } });
    expect(screen.getByText(/generated for your profile/)).toBeInTheDocument();
    expect(screen.queryByText(/built-in Finnish starter plan/)).not.toBeInTheDocument();
  });

  it('averages the seven days', () => {
    setup();
    const total = PLAN.days.reduce(
      (sum, day) => sum + SLOTS.reduce((dayTotal, slot) => dayTotal + day[slot].k, 0),
      0,
    );
    expect(screen.getByText(new RegExp(`≈ ${Math.round(total / 7)} kcal/day`))).toBeInTheDocument();
  });
});
