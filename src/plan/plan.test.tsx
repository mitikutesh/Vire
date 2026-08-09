import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryVireApi } from '@/api/memory-api';
import { TEST_AI_KEY } from '@/api/test-ai-key';
import { ApiError, PlanGenerationError, type VireApi } from '@/api/types';
import { t } from '@/content/strings';
import type { Profile } from '@/domain/schema';
import { PlanGate } from './PlanGate';

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
  waterMl: 2000,
  target: 1600,
  timezone: 'Europe/Helsinki',
};

/** The in-memory API with methods replaced, so a growing port breaks no stub. */
const apiWith = (overrides: Partial<VireApi>): VireApi =>
  Object.assign(new MemoryVireApi(PROFILE, { aiKey: TEST_AI_KEY }), overrides);

function setup(options: { api?: VireApi; profile?: Profile; hasAiKey?: boolean } = {}) {
  const onPlan = vi.fn();
  const onOpenSettings = vi.fn();
  const api =
    options.api ??
    new MemoryVireApi(options.profile ?? PROFILE, {
      // Matches the `hasAiKey` prop below: a harness that claims a key while the
      // fake has none would fail for a reason the test is not about.
      ...(options.hasAiKey === false ? {} : { aiKey: TEST_AI_KEY }),
    });
  render(
    <PlanGate
      api={api}
      profile={options.profile ?? PROFILE}
      onPlan={onPlan}
      // Most cases are about generating, which needs a key (E7.6); the no-key
      // state has its own suite at the bottom.
      hasAiKey={options.hasAiKey ?? true}
      onOpenSettings={onOpenSettings}
    />,
  );
  return { onPlan, onOpenSettings, api, user: userEvent.setup() };
}

describe('idle', () => {
  it('offers generation and the starter plan', () => {
    setup();
    expect(screen.getByRole('button', { name: t.planGate.generate })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.planGate.starter(false) })).toBeInTheDocument();
  });

  it('names the allergies the generator was given', async () => {
    // Guardrail 3, half one: the user can see the exclusion was passed on.
    setup({ profile: { ...PROFILE, allergies: 'peanuts, shellfish' } });
    expect(screen.getByText(/avoiding peanuts, shellfish/)).toBeInTheDocument();
  });

  it('warns that the starter plan is not allergy-adjusted', () => {
    // Guardrail 3, half two — and the reason this screen cannot just reuse one
    // starter-plan label for both states.
    setup({ profile: { ...PROFILE, allergies: 'peanuts' } });
    expect(
      screen.getByRole('button', { name: /not adjusted for your allergies/ }),
    ).toBeInTheDocument();
  });

  it('says nothing about allergies when there are none', () => {
    setup();
    expect(screen.queryByText(/avoiding/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not adjusted/)).not.toBeInTheDocument();
  });
});

describe('generating', () => {
  it('fills the seven rows in from the stream', async () => {
    // Held open until the test releases it, so the mid-generation state is
    // observable rather than a frame that flashed past.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = apiWith({
      generatePlan: async (onDay) => {
        onDay(0, 'done');
        onDay(1, 'run');
        await held;
        throw new PlanGenerationError('partial', [1]);
      },
    });

    const { user } = setup({ api });
    await user.click(screen.getByRole('button', { name: t.planGate.generate }));

    await waitFor(() =>
      expect(screen.getByLabelText(`Monday: ${t.planGate.dayStatus.done}`)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(`Tuesday: ${t.planGate.dayStatus.run}`)).toBeInTheDocument();
    // Untouched days are still waiting — the point of the list moving at all.
    expect(screen.getByLabelText(`Sunday: ${t.planGate.dayStatus.wait}`)).toBeInTheDocument();
    // One live region for the list, not seven.
    expect(screen.getByText(t.planGate.progress(1, 7))).toBeInTheDocument();

    release();
  });

  it('hands the finished plan up', async () => {
    const { user, onPlan } = setup();
    await user.click(screen.getByRole('button', { name: t.planGate.generate }));
    await waitFor(() => expect(onPlan).toHaveBeenCalledTimes(1));
    expect(onPlan.mock.calls[0]?.[0]).toMatchObject({ starter: false });
  });
});

describe('failure', () => {
  it('offers a retry and the starter plan, still warning about allergies', async () => {
    const api = apiWith({
      generatePlan: async () => {
        throw new PlanGenerationError('partial', [3]);
      },
    });
    const { user } = setup({ api, profile: { ...PROFILE, allergies: 'peanuts' } });
    await user.click(screen.getByRole('button', { name: t.planGate.generate }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(t.planGate.error));
    expect(screen.getByRole('button', { name: t.planGate.retry })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /not adjusted for your allergies/ }),
    ).toBeInTheDocument();
  });

  it('says a failed save is worth retrying, rather than blaming the meals', async () => {
    const api = apiWith({
      generatePlan: async () => {
        throw new PlanGenerationError('not_saved');
      },
    });
    const { user } = setup({ api });
    await user.click(screen.getByRole('button', { name: t.planGate.generate }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(t.planGate.errorNotSaved),
    );
  });

  it('explains a dropped connection as its own thing', async () => {
    const api = apiWith({
      generatePlan: async () => {
        throw new PlanGenerationError('dropped');
      },
    });
    const { user } = setup({ api });
    await user.click(screen.getByRole('button', { name: t.planGate.generate }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(t.planGate.errorDropped),
    );
  });

  it('tells the user to come back tomorrow when the allowance is spent', async () => {
    const api = apiWith({
      generatePlan: async () => {
        throw new ApiError(429, 'rate_limited');
      },
    });
    const { user } = setup({ api });
    await user.click(screen.getByRole('button', { name: t.planGate.generate }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(t.planGate.errorRateLimited),
    );
  });

  it('retries from the error screen', async () => {
    let attempts = 0;
    const memory = new MemoryVireApi(PROFILE, { aiKey: TEST_AI_KEY });
    const api = apiWith({
      generatePlan: async (onDay) => {
        attempts += 1;
        if (attempts === 1) throw new PlanGenerationError('partial', [0]);
        return memory.generatePlan(onDay);
      },
    });
    const { user, onPlan } = setup({ api });

    await user.click(screen.getByRole('button', { name: t.planGate.generate }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t.planGate.retry }));

    await waitFor(() => expect(onPlan).toHaveBeenCalledTimes(1));
    expect(attempts).toBe(2);
  });
});

describe('starter plan', () => {
  it('adopts the built-in week without generating', async () => {
    const { user, onPlan, api } = setup();
    const generate = vi.spyOn(api, 'generatePlan');

    await user.click(screen.getByRole('button', { name: t.planGate.starter(false) }));
    await waitFor(() => expect(onPlan).toHaveBeenCalledTimes(1));

    expect(onPlan.mock.calls[0]?.[0]).toMatchObject({ starter: true });
    expect(generate).not.toHaveBeenCalled();
  });

  it('cannot be adopted twice while the first request is in flight', async () => {
    // Two plans would mean two activations and, on the generate path, two slices
    // of the daily allowance. The request is held open rather than given a
    // timeout, because a race decided by real milliseconds is not a test.
    let calls = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const memory = new MemoryVireApi(PROFILE, { aiKey: TEST_AI_KEY });
    const api = apiWith({
      adoptStarterPlan: async () => {
        calls += 1;
        await held;
        return memory.adoptStarterPlan();
      },
    });
    const { user, onPlan } = setup({ api });

    const button = screen.getByRole('button', { name: t.planGate.starter(false) });
    await user.click(button);
    await user.click(button);
    expect(calls).toBe(1);

    release();
    await waitFor(() => expect(onPlan).toHaveBeenCalledTimes(1));
  });
});

describe('without an AI key (E7.6)', () => {
  it('does not offer generation at all', async () => {
    // A button that can only fail is worse than no button.
    setup({ hasAiKey: false });
    expect(screen.queryByRole('button', { name: t.planGate.generate })).not.toBeInTheDocument();
  });

  it('explains why, and points at Settings', async () => {
    const { user, onOpenSettings } = setup({ hasAiKey: false });
    expect(screen.getByText(t.planGate.noKeyTitle)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.planGate.noKeyAction }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('still offers the starter plan, which needs no key', async () => {
    // The whole point of the no-key state: the app works, just without generation.
    const { user, onPlan } = setup({ hasAiKey: false });
    await user.click(screen.getByRole('button', { name: t.planGate.starter(false) }));
    await waitFor(() => expect(onPlan).toHaveBeenCalledTimes(1));
  });
});

describe('before the key status is known', () => {
  it('offers neither branch, rather than flashing the wrong one', () => {
    // Guessing shows the user something that flips under them; "add a key" shown
    // to someone who has one is the worse guess.
    render(
      <PlanGate
        api={new MemoryVireApi(PROFILE)}
        profile={PROFILE}
        onPlan={vi.fn()}
        hasAiKey={undefined}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: t.planGate.generate })).not.toBeInTheDocument();
    expect(screen.queryByText(t.planGate.noKeyTitle)).not.toBeInTheDocument();
    // The starter plan needs no key, so it is offered either way.
    expect(screen.getByRole('button', { name: t.planGate.starter(false) })).toBeInTheDocument();
  });
});
