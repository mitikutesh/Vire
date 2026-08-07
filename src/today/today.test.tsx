import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { DailyLogHandle } from '@/data/useVireData';
import { EX, QUICK_EX, SLOTS } from '@/content/plan';
import { starterPlan } from '@/content/starter-plan';
import { t } from '@/content/strings';
import { emptyLog } from '@/domain/log';
import type { DailyLog, Profile, StoredPlan } from '@/domain/schema';
import { TodayView } from './TodayView';

const PLAN: StoredPlan = { ...starterPlan(1_700_000_000_000), planId: 'plan-1' };

const PROFILE: Profile = {
  name: 'Aino',
  sex: 'f',
  age: 35,
  h: 170,
  w: 80,
  goalW: 72,
  act: 1.375,
  pace: 500,
  city: 'Helsinki',
  allergies: '',
  waterMl: 2000, // 8 glasses
  target: 1600,
  timezone: 'Europe/Helsinki',
};

/** Wednesday: index 2, and not the Sunday rest day. */
const WEDNESDAY = new Date('2026-08-12T12:00:00');

/** The harness owns the log, so a tap really flows through `update` and back. */
function Harness({ log: initial, profile }: { log: DailyLog; profile: Profile }) {
  const [log, setLog] = useState(initial);
  const handle: DailyLogHandle = {
    log,
    update: (change) => setLog((prev) => change(prev)),
    ready: true,
    saveFailed: false,
    dismissSaveError: () => {},
  };
  return <TodayView profile={profile} plan={PLAN} log={handle} now={WEDNESDAY} />;
}

function setup(options: { log?: DailyLog; profile?: Profile } = {}) {
  render(<Harness log={options.log ?? emptyLog()} profile={options.profile ?? PROFILE} />);
  return { user: userEvent.setup() };
}

describe('the summary bar', () => {
  it('counts down from the target when nothing is logged', () => {
    setup();
    expect(screen.getByText(t.today.remaining(PROFILE.target))).toBeInTheDocument();
    expect(screen.getByText(t.today.eatenBurned(0, 0))).toBeInTheDocument();
  });

  it('adds up the meals that were eaten', async () => {
    const { user } = setup();
    const breakfast = PLAN.days[2].b;

    await user.click(screen.getAllByRole('checkbox')[0]!);
    expect(screen.getByText(t.today.eatenBurned(breakfast.k, 0))).toBeInTheDocument();
    expect(screen.getByText(t.today.remaining(PROFILE.target - breakfast.k))).toBeInTheDocument();
  });

  it('replaces a meal’s calories with a swap’s, rather than adding them', () => {
    // The difference between a swap and an extra, and the arithmetic that makes
    // the two paths worth having.
    setup({ log: { ...emptyLog(), m: { b: { n: 'Ate out', k: 500 } } } });
    expect(screen.getByText(t.today.eatenBurned(500, 0))).toBeInTheDocument();
  });

  it('turns over when the day goes past the target', () => {
    setup({ log: { ...emptyLog(), extra: [{ n: 'Cake', k: 2000 }] } });
    expect(screen.getByText(t.today.over(400))).toBeInTheDocument();
  });

  it('lets burned calories back off the intake', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: t.today.markDone }));

    expect(screen.getByText(t.today.eatenBurned(0, EX[2].k))).toBeInTheDocument();
    expect(screen.getByText(t.today.remaining(PROFILE.target + EX[2].k))).toBeInTheDocument();
  });
});

describe('the meals', () => {
  it('shows all five slots', () => {
    setup();
    expect(screen.getAllByRole('checkbox')).toHaveLength(SLOTS.length);
  });

  it('keeps the estimates disclaimer (guardrail 4)', () => {
    setup();
    expect(screen.getByText(t.today.disclaimer)).toBeInTheDocument();
  });
});

describe('movement', () => {
  it('marks the day’s planned movement done', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: t.today.markDone }));

    const done = screen.getByRole('button', { name: t.today.done });
    expect(done).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds extra movement from a quick chip', async () => {
    const { user } = setup();
    const chip = QUICK_EX[0]!;
    await user.click(screen.getByRole('button', { name: `+ ${chip.n}` }));

    expect(screen.getByText(t.today.exerciseRow(chip.n, chip.k))).toBeInTheDocument();
    expect(screen.getByText(t.today.eatenBurned(0, chip.k))).toBeInTheDocument();
  });

  it('adds the same activity twice without one replacing the other', async () => {
    // Two walks in a day is a normal Tuesday, and there is no id to key on.
    const { user } = setup();
    const chip = QUICK_EX[0]!;
    await user.click(screen.getByRole('button', { name: `+ ${chip.n}` }));
    await user.click(screen.getByRole('button', { name: `+ ${chip.n}` }));

    expect(screen.getAllByText(t.today.exerciseRow(chip.n, chip.k))).toHaveLength(2);
    expect(screen.getByText(t.today.eatenBurned(0, chip.k * 2))).toBeInTheDocument();
  });

  it('removes an added row, and names it in the button', async () => {
    // Four rows would otherwise be four buttons all announced as "Remove".
    const { user } = setup({
      log: {
        ...emptyLog(),
        exx: [
          { n: 'Walk 30 min', k: 140 },
          { n: 'Sauna', k: 60 },
        ],
      },
    });
    await user.click(screen.getByRole('button', { name: t.today.removeAria('Sauna') }));

    expect(screen.queryByText(t.today.exerciseRow('Sauna', 60))).not.toBeInTheDocument();
    expect(screen.getByText(t.today.exerciseRow('Walk 30 min', 140))).toBeInTheDocument();
  });
});

describe('water', () => {
  it('reports progress for someone who cannot see the fill', () => {
    setup({ log: { ...emptyLog(), water: 3 } });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '8');
  });

  it('adds and removes a glass', async () => {
    const { user } = setup({ log: { ...emptyLog(), water: 2 } });
    await user.click(screen.getByRole('button', { name: t.today.waterMoreAria }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');

    await user.click(screen.getByRole('button', { name: t.today.waterLessAria }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });

  it('stops at nought and at the goal', async () => {
    // The bar has exactly `goal` segments, so counting past it would show
    // progress that cannot be drawn.
    const { user } = setup({ log: { ...emptyLog(), water: 0 } });
    await user.click(screen.getByRole('button', { name: t.today.waterLessAria }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    for (let i = 0; i < 10; i += 1) {
      await user.click(screen.getByRole('button', { name: t.today.waterMoreAria }));
    }
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
  });

  it('honours the four-glass floor for a small goal', () => {
    setup({ profile: { ...PROFILE, waterMl: 500 } });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4');
  });
});

describe('extras', () => {
  it('explains that an extra adds on top, unlike a swap', () => {
    // Getting these the wrong way round is the difference between a day that adds
    // up and one that quietly does not.
    setup();
    expect(screen.getByText(t.today.extraHelp)).toBeInTheDocument();
  });

  it('adds an extra with its calories', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(t.today.extraWhat), 'Ice cream');
    await user.type(screen.getByLabelText(t.today.extraKcal), '250');
    await user.click(screen.getByRole('button', { name: t.today.extraAdd }));

    expect(screen.getByText(t.today.extraRow('Ice cream', 250))).toBeInTheDocument();
    expect(screen.getByText(t.today.eatenBurned(250, 0))).toBeInTheDocument();
  });

  it('submits on Enter', async () => {
    // A real form, so the keyboard works; the prototype needed a tap on Add.
    const { user } = setup();
    await user.type(screen.getByLabelText(t.today.extraKcal), '120{Enter}');
    expect(screen.getByText(t.today.extraRow('Extra', 120))).toBeInTheDocument();
  });

  it('names an unnamed extra rather than logging a blank row', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(t.today.extraKcal), '90');
    await user.click(screen.getByRole('button', { name: t.today.extraAdd }));
    expect(screen.getByText(t.today.extraRow('Extra', 90))).toBeInTheDocument();
  });

  it('ignores an entry with no calories', async () => {
    // The number is the whole point of the row; the name is optional.
    const { user } = setup();
    await user.type(screen.getByLabelText(t.today.extraWhat), 'Something');
    await user.click(screen.getByRole('button', { name: t.today.extraAdd }));

    expect(screen.queryByText(/Something ·/)).not.toBeInTheDocument();
    expect(screen.getByText(t.today.eatenBurned(0, 0))).toBeInTheDocument();
  });

  it('refuses letters in the calorie field', async () => {
    const { user } = setup();
    const field = screen.getByLabelText(t.today.extraKcal);
    await user.type(field, '1a2b');
    expect(field).toHaveValue('12');
  });

  it('clears the form after adding', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(t.today.extraWhat), 'Biscuit');
    await user.type(screen.getByLabelText(t.today.extraKcal), '80');
    await user.click(screen.getByRole('button', { name: t.today.extraAdd }));

    expect(screen.getByLabelText(t.today.extraWhat)).toHaveValue('');
    expect(screen.getByLabelText(t.today.extraKcal)).toHaveValue('');
  });

  it('removes an extra', async () => {
    const { user } = setup({ log: { ...emptyLog(), extra: [{ n: 'Cake', k: 300 }] } });
    await user.click(screen.getByRole('button', { name: t.today.removeAria('Cake') }));

    expect(screen.queryByText(t.today.extraRow('Cake', 300))).not.toBeInTheDocument();
    expect(screen.getByText(t.today.eatenBurned(0, 0))).toBeInTheDocument();
  });
});
