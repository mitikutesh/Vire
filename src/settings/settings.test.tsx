import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryVireApi } from '@/api/memory-api';
import { ApiError, type ProfileInput, type VireApi } from '@/api/types';
import { KCAL_FLOOR } from '@/content/plan';
import { t } from '@/content/strings';
import type { Profile } from '@/domain/schema';
import { SettingsView } from './SettingsView';

const savedProfile: Profile = {
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

/**
 * The in-memory API with one method replaced. Built on the real fake rather than
 * a bare object literal so adding a method to the port does not break every stub
 * that never cared about it.
 */
const apiWith = (overrides: Partial<VireApi>): VireApi =>
  Object.assign(new MemoryVireApi(), overrides);

function setup(
  options: {
    profile?: Profile | null;
    api?: VireApi;
    onClose?: (() => void) | undefined;
  } = {},
) {
  const api = options.api ?? new MemoryVireApi();
  const onSaved = vi.fn();
  const onSignOut = vi.fn();
  const profile = options.profile ?? null;

  render(
    <SettingsView
      api={api}
      profile={profile}
      onSaved={onSaved}
      onSignOut={onSignOut}
      {...(options.onClose ? { onClose: options.onClose } : {})}
    />,
  );
  return { api, onSaved, onSignOut, user: userEvent.setup() };
}

describe('first run', () => {
  it('cannot be dismissed — there is no calorie target behind it yet', () => {
    setup({ profile: null });
    expect(screen.getByRole('heading', { name: t.settings.firstRunTitle })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.settings.closeAria })).not.toBeInTheDocument();
  });

  it('ignores Escape when there is no way to close', async () => {
    const user = userEvent.setup();
    setup({ profile: null });
    await user.keyboard('{Escape}');
    expect(screen.getByRole('heading', { name: t.settings.firstRunTitle })).toBeInTheDocument();
  });

  it('offers every profile field the prototype had', () => {
    setup({ profile: null });
    for (const label of [
      t.settings.name,
      t.settings.age,
      t.settings.height,
      t.settings.weight,
      t.settings.goalWeight,
      t.settings.sex,
      t.settings.activity,
      t.settings.pace,
      t.settings.city,
      t.settings.allergies,
      t.settings.waterGoal,
    ]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
  });

  it('detects the device timezone, which the reminder scheduler needs', async () => {
    const api = new MemoryVireApi();
    const save = vi.spyOn(api, 'saveProfile');
    const { user } = setup({ profile: null, api });
    await user.click(screen.getByRole('button', { name: t.settings.saveFirstRun }));

    const sent = save.mock.calls[0]?.[0] as ProfileInput;
    expect(sent.timezone).toBeTruthy();
  });
});

describe('settings mode', () => {
  it('can be closed', async () => {
    const onClose = vi.fn();
    const { user } = setup({ profile: savedProfile, onClose });
    await user.click(screen.getByRole('button', { name: t.settings.closeAria }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = setup({ profile: savedProfile, onClose });
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('opens with the saved values, not defaults', () => {
    setup({ profile: { ...savedProfile, name: 'Aino', w: 74 }, onClose: vi.fn() });
    expect(screen.getByLabelText(t.settings.name)).toHaveValue('Aino');
    expect(screen.getByLabelText(t.settings.weight)).toHaveValue(74);
  });

  it('traps focus inside the dialog (I4)', async () => {
    // The prototype's overlay let focus fall through to the app behind it, so a
    // keyboard user tabbed into a screen they could not see.
    const user = userEvent.setup();
    render(
      <>
        <button type="button">behind the dialog</button>
        <SettingsView
          api={new MemoryVireApi()}
          profile={savedProfile}
          onSaved={vi.fn()}
          onClose={vi.fn()}
          onSignOut={vi.fn()}
        />
      </>,
    );

    const outside = screen.getByRole('button', { name: 'behind the dialog' });
    const dialog = screen.getByRole('dialog');

    // Walk forward through everything; focus must never leave the dialog.
    for (let i = 0; i < 30; i += 1) {
      await user.tab();
      expect(outside).not.toHaveFocus();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('locks background scroll while open, and restores it after', () => {
    const { unmount } = render(
      <SettingsView
        api={new MemoryVireApi()}
        profile={savedProfile}
        onSaved={vi.fn()}
        onClose={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('announces itself as a modal dialog', () => {
    setup({ profile: savedProfile, onClose: vi.fn() });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(t.settings.title);
  });
});

describe('target preview', () => {
  it('shows the target for the current values', () => {
    setup({ profile: savedProfile, onClose: vi.fn() });
    expect(screen.getByText(t.settings.kcal(1600))).toBeInTheDocument();
  });

  it('updates as the numbers change', async () => {
    const { user } = setup({ profile: savedProfile, onClose: vi.fn() });
    const weight = screen.getByLabelText(t.settings.weight);
    await user.clear(weight);
    await user.type(weight, '90');
    // Heavier body, higher maintenance, so a higher target than 1600.
    expect(screen.queryByText(t.settings.kcal(1600))).not.toBeInTheDocument();
  });

  it('never previews below the calorie floor (guardrail 1)', async () => {
    const { user } = setup({ profile: savedProfile, onClose: vi.fn() });
    for (const [label, value] of [
      [t.settings.age, '70'],
      [t.settings.height, '150'],
      [t.settings.weight, '45'],
    ] as const) {
      await user.clear(screen.getByLabelText(label));
      await user.type(screen.getByLabelText(label), value);
    }
    await user.selectOptions(screen.getByLabelText(t.settings.pace), '750');

    expect(screen.getByText(t.settings.kcal(KCAL_FLOOR.f))).toBeInTheDocument();
  });

  it('shows the journey to the goal weight only while there is one', async () => {
    const { user } = setup({ profile: savedProfile, onClose: vi.fn() });
    expect(screen.getByText(t.settings.onTheWay(80, 72))).toBeInTheDocument();

    // Goal reached: the line stops being true, so it stops being shown.
    await user.clear(screen.getByLabelText(t.settings.goalWeight));
    await user.type(screen.getByLabelText(t.settings.goalWeight), '85');
    expect(screen.queryByText(/On the way from/)).not.toBeInTheDocument();
  });
});

describe('saving', () => {
  it('reports the profile the server stored, not the local preview', async () => {
    // The server recomputes the target; its answer is the one that counts.
    const api = new MemoryVireApi();
    const { onSaved, user } = setup({ profile: null, api });
    await user.click(screen.getByRole('button', { name: t.settings.saveFirstRun }));

    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ target: expect.any(Number) }));
    const saved = onSaved.mock.calls[0]?.[0] as Profile;
    expect(saved.target).toBeGreaterThanOrEqual(KCAL_FLOOR.f);
  });

  it('never sends a target of its own', async () => {
    // The field is not in the accepted shape server-side; not sending it at all
    // keeps the client honest about who owns the number.
    const api = new MemoryVireApi();
    const save = vi.spyOn(api, 'saveProfile');
    const { user } = setup({ profile: savedProfile, api, onClose: vi.fn() });
    await user.click(screen.getByRole('button', { name: t.settings.save }));

    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('target');
  });

  it('marks the offending field when the server rejects a value', async () => {
    const rejecting = apiWith({
      saveProfile: async () => {
        throw new ApiError(422, 'invalid_profile', [
          { field: 'w', message: 'Number must be greater than or equal to 30' },
        ]);
      },
    });
    const { onSaved, user } = setup({ profile: null, api: rejecting });
    await user.click(screen.getByRole('button', { name: t.settings.saveFirstRun }));

    expect(screen.getByRole('alert')).toHaveTextContent(t.settings.fixHighlighted);
    expect(screen.getByText(/greater than or equal to 30/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('reports a failure the user can retry rather than losing their entries', async () => {
    const failing = apiWith({
      saveProfile: async () => {
        throw new ApiError(0, 'network');
      },
    });
    const { user } = setup({ profile: null, api: failing });
    await user.type(screen.getByLabelText(t.settings.name), 'Aino');
    await user.click(screen.getByRole('button', { name: t.settings.saveFirstRun }));

    expect(screen.getByRole('alert')).toHaveTextContent(t.settings.saveFailed);
    // The form still holds what was typed.
    expect(screen.getByLabelText(t.settings.name)).toHaveValue('Aino');
  });
});

describe('health guardrail copy (PLAN §7)', () => {
  it('keeps the Mifflin estimate note and the doctor line', () => {
    setup({ profile: savedProfile, onClose: vi.fn() });
    expect(screen.getByText(/Mifflin-St Jeor/)).toBeInTheDocument();
    expect(screen.getByText(/doctor/)).toBeInTheDocument();
  });

  it('keeps the allergy label-check warning next to the field', () => {
    setup({ profile: savedProfile, onClose: vi.fn() });
    expect(screen.getByText(/double-check product labels/)).toBeInTheDocument();
  });
});

describe('sign out', () => {
  it('is reachable from settings', async () => {
    const { onSignOut, user } = setup({ profile: savedProfile, onClose: vi.fn() });
    await user.click(screen.getByRole('button', { name: new RegExp(t.settings.signOut) }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
