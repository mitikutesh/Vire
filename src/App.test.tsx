import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryVireApi } from '@/api/memory-api';
import { FakeAuthClient } from '@/auth/fake-client';
import { t } from '@/content/strings';
import type { Profile } from '@/domain/schema';
import App from './App';

const OWNER = 'owner@example.com';

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

/**
 * An API that already holds a profile and an active plan, so the shell tests do
 * not have to walk the auth screen, the profile form and the plan gate first —
 * each has its own suite. The plan is adopted through the real method rather than
 * injected, so the fake cannot drift from the flow it stands in for.
 */
async function readyApi(profile: Profile = PROFILE) {
  const api = new MemoryVireApi(profile);
  await api.adoptStarterPlan();
  return api;
}

async function renderSignedIn(profile: Profile = PROFILE) {
  render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} api={await readyApi(profile)} />);
  // A splash shows while the session, profile and plan load.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Now' })).toBeInTheDocument());
}

describe('session gate', () => {
  it('shows the sign-in screen when signed out', async () => {
    render(<App auth={new FakeAuthClient()} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.auth.signInTitle })).toBeInTheDocument(),
    );
    // No app chrome leaks through before sign-in.
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
  });

  it('restores an existing session straight into the app', async () => {
    await renderSignedIn();
    expect(screen.queryByRole('heading', { name: t.auth.signInTitle })).not.toBeInTheDocument();
  });

  it('returns to the sign-in screen after signing out', async () => {
    const user = userEvent.setup();
    await renderSignedIn();
    // Sign-out lives in Settings now that the gear opens it.
    await user.click(screen.getByRole('button', { name: t.app.settingsAria }));
    await user.click(screen.getByRole('button', { name: new RegExp(t.settings.signOut) }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.auth.signInTitle })).toBeInTheDocument(),
    );
  });
});

describe('first-run gate', () => {
  it('sends a signed-in user with no profile to setup, not to the tabs', async () => {
    // Without a profile there is no calorie target, so the shell has nothing to
    // show.
    render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} api={new MemoryVireApi()} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.settings.firstRunTitle })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
  });

  it('moves on to the plan gate once the profile is saved', async () => {
    const user = userEvent.setup();
    render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} api={new MemoryVireApi()} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.settings.firstRunTitle })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: t.settings.saveFirstRun }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.planGate.title })).toBeInTheDocument(),
    );
  });
});

describe('plan gate', () => {
  it('stops a user with a profile but no plan before the tabs', async () => {
    // Every tab renders a week; there is nothing to show until one exists.
    render(
      <App auth={new FakeAuthClient({ signedInAs: OWNER })} api={new MemoryVireApi(PROFILE)} />,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.planGate.title })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
  });

  it('enters the app once a plan exists', async () => {
    const user = userEvent.setup();
    render(
      <App auth={new FakeAuthClient({ signedInAs: OWNER })} api={new MemoryVireApi(PROFILE)} />,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.planGate.title })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: t.planGate.generate }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Now' })).toBeInTheDocument());
  });

  it('walks the whole first run: no profile, no plan, then the app', async () => {
    // The two gates in sequence, which is what a new user actually meets.
    const user = userEvent.setup();
    render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} api={new MemoryVireApi()} />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.settings.firstRunTitle })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: t.settings.saveFirstRun }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.planGate.title })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: t.planGate.starter(false) }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Now' })).toBeInTheDocument());
  });
});

describe('settings from the shell', () => {
  it('opens on the gear and closes again', async () => {
    const user = userEvent.setup();
    await renderSignedIn();

    await user.click(screen.getByRole('button', { name: t.app.settingsAria }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.settings.closeAria }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses the saved target, not a hardcoded one', async () => {
    await renderSignedIn({ ...PROFILE, target: 1850 });
    expect(screen.getByText(t.now.ofTarget(1850))).toBeInTheDocument();
  });
});

/**
 * The M0 demo criterion: the locked design renders all four tabs — now from the
 * user's own active plan rather than a hardcoded fixture.
 */
describe('App shell', () => {
  beforeEach(async () => {
    await renderSignedIn();
  });

  it('opens on the Now tab', () => {
    expect(screen.getByRole('button', { name: 'Now' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders every tab from the active plan', async () => {
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: "Today's plan" })).toBeInTheDocument();
    // All five meal slots, each with its own eaten toggle.
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByRole('heading', { name: 'This week' })).toBeInTheDocument();
    expect(screen.getByText('today')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Shop' }));
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByText('Fish & meat')).toBeInTheDocument();
    // English name with the Finnish shopping name beside it — the pairing that
    // makes the store search links work.
    expect(screen.getByText(/Salmon fillet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Now' }));
    expect(screen.getByRole('button', { name: 'Now' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the estimates disclaimer on the Today tab (guardrail 4)', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByText(/estimates for one home-cooked portion/)).toBeInTheDocument();
  });

  it('marks a meal as eaten and moves the remaining calories', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Today' }));

    const before = screen.getByText(/kcal (left|over)/).textContent;
    const [firstMeal] = screen.getAllByRole('checkbox');
    await user.click(firstMeal!);

    expect(screen.getByText(/kcal (left|over)/).textContent).not.toBe(before);
    expect(firstMeal).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the pantry-staple hint on staple items', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Shop' }));
    expect(screen.getAllByText(/pantry staple — skip if you have it/).length).toBeGreaterThan(0);
  });
});
