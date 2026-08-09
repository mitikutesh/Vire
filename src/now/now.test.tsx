import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DailyLogHandle } from '@/data/useVireData';
import { EX } from '@/content/plan';
import { starterPlan } from '@/content/starter-plan';
import { SLOT_LABEL, t } from '@/content/strings';
import { emptyLog } from '@/domain/log';
import type { DailyLog, Profile, StoredPlan } from '@/domain/schema';
import { NowView } from './NowView';

const PLAN: StoredPlan = { ...starterPlan(1_700_000_000_000), planId: 'plan-1' };

const PROFILE: Profile = {
  name: 'Aino Virtanen',
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

/** Wednesday, so the exercise rotation and the rest day are both distinguishable. */
const at = (time: string, day = '2026-08-12') => new Date(`${day}T${time}`);
const SUNDAY = '2026-08-09';

/**
 * The view takes a log *handle*, so the harness owns the state — which means a
 * tap really does flow through `update` and come back as a new render, the same
 * way it does in the app.
 */
function Harness({
  now,
  log: initial,
  profile,
  weighInDue = false,
  onWeighIn = () => {},
  onGoToday,
}: {
  now: Date;
  log: DailyLog;
  profile: Profile;
  weighInDue?: boolean;
  onWeighIn?: () => void;
  onGoToday: () => void;
}) {
  const [log, setLog] = useState(initial);
  const handle: DailyLogHandle = {
    value: log,
    log,
    date: '2026-08-12',
    update: (change) => setLog((prev) => change(prev)),
    ready: true,
    saveFailed: false,
    dismissSaveError: () => {},
  };
  return (
    <NowView
      profile={profile}
      plan={PLAN}
      log={handle}
      now={now}
      weighInDue={weighInDue}
      onWeighIn={onWeighIn}
      onGoToday={onGoToday}
    />
  );
}

function setup(
  options: { now?: Date; log?: DailyLog; profile?: Profile; weighInDue?: boolean } = {},
) {
  const onGoToday = vi.fn();
  const onWeighIn = vi.fn();
  render(
    <Harness
      now={options.now ?? at('12:00')}
      log={options.log ?? emptyLog()}
      profile={options.profile ?? PROFILE}
      weighInDue={options.weighInDue ?? false}
      onWeighIn={onWeighIn}
      onGoToday={onGoToday}
    />,
  );
  return { onGoToday, onWeighIn, user: userEvent.setup() };
}

describe('the header', () => {
  it('greets by the hour', () => {
    setup({ now: at('08:00') });
    expect(screen.getByText(new RegExp(t.now.greeting.morning))).toBeInTheDocument();
  });

  it('says quiet hours in the middle of the night', () => {
    // The prototype's own wording, and the reason the greeting is not just
    // "Good morning" for anything before noon.
    setup({ now: at('03:00') });
    expect(screen.getByText(new RegExp(t.now.greeting.quiet))).toBeInTheDocument();
  });

  it('uses the first name only', () => {
    setup();
    expect(screen.getByText(/Aino ·/)).toBeInTheDocument();
    expect(screen.queryByText(/Virtanen/)).not.toBeInTheDocument();
  });
});

describe('the meal that is now', () => {
  it('shows breakfast in the morning and dinner in the evening', () => {
    // The whole point of the tab: it answers without being asked.
    const wednesday = PLAN.days[2];

    const morning = render(
      <Harness now={at('08:00')} log={emptyLog()} profile={PROFILE} onGoToday={() => {}} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: wednesday.b.n })).toBeInTheDocument();
    morning.unmount();

    render(<Harness now={at('18:00')} log={emptyLog()} profile={PROFILE} onGoToday={() => {}} />);
    expect(screen.getByRole('heading', { level: 2, name: wednesday.d.n })).toBeInTheDocument();
  });

  it('names the slot in the headline and the chip', () => {
    setup({ now: at('18:00') });
    expect(
      screen.getByRole('heading', { level: 1, name: t.now.rightNow('Dinner') }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.now.nowChip(SLOT_LABEL.d.hint))).toBeInTheDocument();
  });

  it('shows the Finnish name beside the meal', () => {
    // The pairing that makes the store links and the recipe search work.
    const lunch = PLAN.days[2].l;
    setup({ now: at('12:00') });
    if (lunch.fi) expect(screen.getByText(lunch.fi)).toBeInTheDocument();
  });

  it('marks the meal eaten and says so', async () => {
    const { user } = setup({ now: at('12:00') });
    const button = screen.getByRole('button', { name: t.now.markEaten });
    await user.click(button);

    expect(screen.getByRole('button', { name: t.now.eaten })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.now.eaten })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reports a swap’s own calories on the button', async () => {
    // The label carries the state, so it does not rely on the colour change.
    setup({ now: at('12:00'), log: { ...emptyLog(), m: { l: { n: 'Ate out', k: 700 } } } });
    expect(screen.getByRole('button', { name: t.now.eatenSwapped(700) })).toBeInTheDocument();
  });
});

describe('after hours', () => {
  it('closes the kitchen and points at tomorrow’s breakfast', () => {
    setup({ now: at('23:30') });
    expect(screen.getByRole('heading', { level: 1, name: t.now.nightTitle })).toBeInTheDocument();
    expect(screen.getByText(PLAN.days[3].b.n)).toBeInTheDocument();
  });

  it('wraps from Sunday night to Monday’s breakfast', () => {
    // The off-by-one that a plain `wd + 1` would get wrong.
    setup({ now: at('23:30', SUNDAY) });
    expect(screen.getByText(PLAN.days[0].b.n)).toBeInTheDocument();
  });

  it('offers no meal to log once the day is done', () => {
    setup({ now: at('02:00') });
    expect(screen.queryByRole('button', { name: t.now.markEaten })).not.toBeInTheDocument();
  });
});

describe('the movement nudge', () => {
  const nudge = () => screen.queryByText(new RegExp(EX[2].n.toLowerCase()));

  it('appears in the late afternoon', () => {
    setup({ now: at('17:00') });
    expect(nudge()).toBeInTheDocument();
  });

  it('stays away outside the window', () => {
    // A reminder that shows up when it cannot be acted on teaches people to
    // ignore reminders.
    setup({ now: at('12:00') });
    expect(nudge()).not.toBeInTheDocument();
    setup({ now: at('21:00') });
    expect(nudge()).not.toBeInTheDocument();
  });

  it('stays away once the movement is done', () => {
    setup({ now: at('17:00'), log: { ...emptyLog(), ex: true } });
    expect(nudge()).not.toBeInTheDocument();
  });

  it('stays away on the rest day', () => {
    setup({ now: at('17:00', SUNDAY) });
    expect(screen.queryByText(new RegExp(EX[6].n.toLowerCase()))).not.toBeInTheDocument();
  });

  it('leads to Today, where the quick-add chips are', async () => {
    const { onGoToday, user } = setup({ now: at('17:00') });
    await user.click(screen.getByText(new RegExp(EX[2].n.toLowerCase())));
    expect(onGoToday).toHaveBeenCalled();
  });
});

describe('the tiles', () => {
  it('counts calories down from the target', () => {
    setup();
    expect(screen.getByText(String(PROFILE.target))).toBeInTheDocument();
    expect(screen.getByText(t.now.kcalLeft)).toBeInTheDocument();
  });

  it('switches to an over-budget reading', () => {
    setup({ now: at('12:00'), log: { ...emptyLog(), extra: [{ n: 'Cake', k: 2000 }] } });
    expect(screen.getByText(t.now.kcalOver)).toBeInTheDocument();
    expect(screen.getByText(/^\+\d+$/)).toBeInTheDocument();
  });

  it('adds a glass of water per tap, and stops at the goal', async () => {
    const { user } = setup({ now: at('12:00'), log: { ...emptyLog(), water: 7 } });
    const tile = screen.getByRole('button', { name: t.now.waterAria(7, 8) });
    await user.click(tile);

    expect(screen.getByRole('button', { name: t.now.waterAria(8, 8) })).toBeInTheDocument();
    // Capped: tapping past the goal would let the tile count forever.
    await user.click(screen.getByRole('button', { name: t.now.waterAria(8, 8) }));
    expect(screen.getByRole('button', { name: t.now.waterAria(8, 8) })).toBeInTheDocument();
  });

  it('honours a water goal below the four-glass minimum', () => {
    // 500 ml is two glasses, but the floor is four.
    setup({ now: at('12:00'), profile: { ...PROFILE, waterMl: 500 } });
    expect(screen.getByRole('button', { name: t.now.waterAria(0, 4) })).toBeInTheDocument();
  });

  it('toggles the day’s movement and offsets the calories', async () => {
    const { user } = setup({ now: at('12:00') });
    // Nothing eaten yet, so the ring reads the full target.
    expect(screen.getByText(String(PROFILE.target))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: new RegExp(EX[2].n) }));
    expect(screen.getByText(t.now.exerciseDone)).toBeInTheDocument();
    // Burned calories come back off the intake, so there is more budget, not less.
    expect(screen.getByText(String(PROFILE.target + EX[2].k))).toBeInTheDocument();
  });
});

describe('the weigh-in prompt (I1)', () => {
  it('stays hidden until one is due', () => {
    setup();
    expect(screen.queryByText(t.settings.weighInPrompt)).not.toBeInTheDocument();
  });

  it('appears as a card, below the day’s actual work', () => {
    setup({ weighInDue: true });
    expect(screen.getByText(t.settings.weighInPrompt)).toBeInTheDocument();
  });

  it('opens the place the weigh-in is entered', async () => {
    const { onWeighIn, user } = setup({ weighInDue: true });
    await user.click(screen.getByText(t.settings.weighInPrompt));
    expect(onWeighIn).toHaveBeenCalled();
  });
});
