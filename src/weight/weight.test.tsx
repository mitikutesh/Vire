import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryVireApi } from '@/api/memory-api';
import { ApiError, type DatedWeight, type VireApi } from '@/api/types';
import { createQueryClient } from '@/data/query';
import { KCAL_FLOOR } from '@/content/plan';
import { t } from '@/content/strings';
import type { Profile } from '@/domain/schema';
import { calcTarget } from '@/domain/target';
import { WeighInSection } from './WeighInSection';
import { WeightTrend } from './WeightTrend';
import { WEIGH_IN_INTERVAL_DAYS, weighInDue } from './weigh-in-due';

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

const TODAY = new Date('2026-08-08T09:00:00');

describe('weighInDue', () => {
  it('is due when there has never been a weigh-in', () => {
    expect(weighInDue([], TODAY)).toBe(true);
  });

  it('is not due the same day one was recorded', () => {
    expect(weighInDue([{ date: '2026-08-08', kg: 79 }], TODAY)).toBe(false);
  });

  it('is not due partway through the week', () => {
    // A card, not a nag: it does not reappear because three days passed.
    expect(weighInDue([{ date: '2026-08-05', kg: 79 }], TODAY)).toBe(false);
  });

  it('is due once a week has passed', () => {
    expect(weighInDue([{ date: '2026-08-01', kg: 79 }], TODAY)).toBe(true);
  });

  it('reads the latest entry, not the first', () => {
    const entries: DatedWeight[] = [
      { date: '2026-06-01', kg: 84 },
      { date: '2026-08-07', kg: 79 },
    ];
    expect(weighInDue(entries, TODAY)).toBe(false);
  });

  it('uses whole days, so a late-evening weigh-in still counts', () => {
    // Comparing ISO date strings keeps time zones out of a question about days.
    const evening = new Date('2026-08-08T23:50:00');
    const cutoff = new Date(TODAY);
    cutoff.setDate(cutoff.getDate() - WEIGH_IN_INTERVAL_DAYS + 1);
    expect(weighInDue([{ date: '2026-08-08', kg: 79 }], evening)).toBe(false);
    expect(cutoff.getDate()).toBe(2);
  });
});

/* ─────────────────────────── the entry form ─────────────────────────── */

function renderSection(api: VireApi, profile: Profile = PROFILE) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<WeighInSection api={api} profile={profile} today={TODAY} />, { wrapper });
  return { user: userEvent.setup(), client };
}

describe('recording a weigh-in', () => {
  it('starts from the weight already on the profile', () => {
    renderSection(new MemoryVireApi(PROFILE));
    expect(screen.getByLabelText(t.settings.weighInLabel)).toHaveValue(80);
  });

  it('keeps a tenth of a kilo', async () => {
    // A week's progress is often 0.4 kg; rounding it away would make the trend lie.
    const api = new MemoryVireApi(PROFILE);
    const save = vi.spyOn(api, 'saveWeighIn');
    const { user } = renderSection(api);

    const field = screen.getByLabelText(t.settings.weighInLabel);
    await user.clear(field);
    await user.type(field, '78.4');
    await user.click(screen.getByRole('button', { name: t.settings.weighInSave }));
    // 78.4 moves the target, so the second question comes first.
    await user.click(screen.getByRole('button', { name: t.settings.weighInKeepTarget }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[1]).toBe(78.4);
  });

  it('asks about the target only when the target would move', async () => {
    const api = new MemoryVireApi(PROFILE);
    const { user } = renderSection(api);

    const field = screen.getByLabelText(t.settings.weighInLabel);
    await user.clear(field);
    await user.type(field, '74');
    await user.click(screen.getByRole('button', { name: t.settings.weighInSave }));

    const expected = calcTarget({ ...PROFILE, w: 74 });
    expect(
      screen.getByRole('button', { name: t.settings.weighInUpdateTarget(expected) }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.settings.weighInKeepTarget })).toBeInTheDocument();
  });

  it('saves in one tap when the target is unaffected', async () => {
    // Asking a question with only one sensible answer is friction, not care.
    const api = new MemoryVireApi(PROFILE);
    const save = vi.spyOn(api, 'saveWeighIn');
    const { user } = renderSection(api, { ...PROFILE, target: calcTarget(PROFILE) });

    await user.click(screen.getByRole('button', { name: t.settings.weighInSave }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('2026-08-08', 80, false));
    expect(
      screen.queryByRole('button', { name: t.settings.weighInKeepTarget }),
    ).not.toBeInTheDocument();
  });

  it('applies the new target when the user accepts', async () => {
    const api = new MemoryVireApi(PROFILE);
    const { user, client } = renderSection(api);

    const field = screen.getByLabelText(t.settings.weighInLabel);
    await user.clear(field);
    await user.type(field, '74');
    await user.click(screen.getByRole('button', { name: t.settings.weighInSave }));

    const expected = calcTarget({ ...PROFILE, w: 74 });
    await user.click(
      screen.getByRole('button', { name: t.settings.weighInUpdateTarget(expected) }),
    );

    // The whole app picks up the new target, not just this form.
    await waitFor(() => expect(client.getQueryData<Profile>(['profile'])?.target).toBe(expected));
  });

  it('records the weigh-in but leaves the target alone when declined', async () => {
    const api = new MemoryVireApi(PROFILE);
    const { user, client } = renderSection(api);

    const field = screen.getByLabelText(t.settings.weighInLabel);
    await user.clear(field);
    await user.type(field, '74');
    await user.click(screen.getByRole('button', { name: t.settings.weighInSave }));
    await user.click(screen.getByRole('button', { name: t.settings.weighInKeepTarget }));

    await waitFor(async () => expect(await api.listWeights()).toHaveLength(1));
    expect(client.getQueryData<Profile>(['profile'])?.target).toBe(PROFILE.target);
  });

  it('never lets the target fall below the floor (guardrail 1)', async () => {
    const light: Profile = { ...PROFILE, age: 70, act: 1.2, pace: 750 };
    const api = new MemoryVireApi(light);
    const { user, client } = renderSection(api, light);

    const field = screen.getByLabelText(t.settings.weighInLabel);
    await user.clear(field);
    await user.type(field, '45');
    await user.click(screen.getByRole('button', { name: t.settings.weighInSave }));
    await user.click(screen.getByRole('button', { name: /Update my target/ }));

    await waitFor(() =>
      expect(client.getQueryData<Profile>(['profile'])?.target).toBe(KCAL_FLOOR.f),
    );
  });

  it('reports a failure instead of pretending it saved', async () => {
    const api: VireApi = Object.assign(new MemoryVireApi(PROFILE), {
      saveWeighIn: async () => {
        throw new ApiError(0, 'network');
      },
    });
    const { user } = renderSection(api);

    await user.click(screen.getByRole('button', { name: t.settings.weighInSave }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(t.settings.weighInFailed),
    );
  });
});

/* ─────────────────────────── the trend ─────────────────────────── */

describe('the trend', () => {
  const draw = (entries: DatedWeight[]) =>
    render(<WeightTrend entries={entries} current={80} goal={72} />);

  it('says where the user is and where they are going', () => {
    draw([
      { date: '2026-08-01', kg: 79 },
      { date: '2026-08-08', kg: 78 },
    ]);
    expect(screen.getByText(t.week.weightCurrentToGoal(78, 72))).toBeInTheDocument();
  });

  it('keeps the caption (guardrail 6)', () => {
    draw([]);
    expect(screen.getByText(t.week.weightTrendCaption)).toBeInTheDocument();
  });

  it('declines to draw a trend from one point', () => {
    // A single reading drawn as a flat line would imply a stability nobody has
    // measured.
    draw([{ date: '2026-08-08', kg: 78 }]);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(t.week.weightTrendEmpty)).toBeInTheDocument();
  });

  it('falls back to the profile weight before any weigh-in', () => {
    draw([]);
    expect(screen.getByText(t.week.weightCurrentToGoal(80, 72))).toBeInTheDocument();
  });

  it('describes the line for anyone who cannot see it', () => {
    draw([
      { date: '2026-08-01', kg: 80 },
      { date: '2026-08-08', kg: 78 },
    ]);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      t.week.weightTrendAria(2, 80, 78),
    );
  });

  it('plots weight on the y-axis, so a loss descends', () => {
    // The convention every scale app uses. Inverting it to make "progress" go up
    // would read backwards against every other weight chart the user has seen.
    draw([
      { date: '2026-08-01', kg: 80 },
      { date: '2026-08-08', kg: 78 },
    ]);
    const points = screen.getByRole('img').querySelector('polyline')?.getAttribute('points') ?? '';
    const [first, second] = points.split(' ').map((pair) => Number(pair.split(',')[1]));
    // Larger y is lower on the card.
    expect(second).toBeGreaterThan(first!);
  });

  it('draws a flat week as a level line rather than collapsing it', () => {
    // Two identical readings give a zero range; without a guard the scale divides
    // by nothing.
    draw([
      { date: '2026-08-01', kg: 78 },
      { date: '2026-08-08', kg: 78 },
    ]);
    const points = screen.getByRole('img').querySelector('polyline')?.getAttribute('points') ?? '';
    const ys = points.split(' ').map((pair) => Number(pair.split(',')[1]));
    expect(ys[0]).toBe(ys[1]);
    expect(Number.isFinite(ys[0])).toBe(true);
  });
});
