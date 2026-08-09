import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryVireApi } from '@/api/memory-api';
import { TEST_AI_KEY } from '@/api/test-ai-key';
import { ApiError } from '@/api/types';
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
  // Generation needs the user's own key (E7.6); the shell tests are not about the
  // no-key state, which has its own suite in src/plan.
  const api = new MemoryVireApi(profile, { aiKey: TEST_AI_KEY });
  await api.adoptStarterPlan();
  return api;
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
    // Generation needs the user's own key (E7.6).
    const api = new MemoryVireApi(PROFILE, { aiKey: TEST_AI_KEY });
    render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} api={api} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.planGate.title })).toBeInTheDocument(),
    );

    // Awaited: the generate button appears only once the key status has loaded.
    await user.click(await screen.findByRole('button', { name: t.planGate.generate }));
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

describe('the day’s log', () => {
  it('survives a reload', async () => {
    // The prototype kept the log in a tab that lost it on refresh; this is the
    // story that fixed that.
    const user = userEvent.setup();
    const api = await readyApi();

    render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} api={api} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Now' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Today' }));
    const [firstMeal] = screen.getAllByRole('checkbox');
    await user.click(firstMeal!);
    await waitFor(() => expect(firstMeal).toHaveAttribute('aria-checked', 'true'));

    // A fresh App against the same API: a new cache, reading from the server.
    cleanup();
    render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} api={api} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() =>
      expect(screen.getAllByRole('checkbox')[0]).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('undoes the tap and says so when the write fails', async () => {
    const user = userEvent.setup();
    const api = await readyApi();
    vi.spyOn(api, 'saveLog').mockRejectedValue(new ApiError(0, 'network'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} api={api} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Now' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Today' }));

    const [firstMeal] = screen.getAllByRole('checkbox');
    await user.click(firstMeal!);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(t.log.saveFailed));
    // The tick is gone with it — a tap that silently did nothing would be worse.
    expect(screen.getAllByRole('checkbox')[0]).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: t.log.dismiss }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('regenerating the week', () => {
  const openRegenerate = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: t.app.settingsAria }));
    return screen.getByRole('button', { name: new RegExp(t.settings.regenerate) });
  };

  it('is not offered on first run, when there is no week to replace', async () => {
    render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} api={new MemoryVireApi()} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.settings.firstRunTitle })).toBeInTheDocument(),
    );
    expect(screen.queryByText(t.settings.planSection)).not.toBeInTheDocument();
  });

  it('takes two taps, and warns on the first', async () => {
    // It throws away the week's meals, the grocery list and everything ticked off.
    const user = userEvent.setup();
    await renderSignedIn();

    const button = await openRegenerate(user);
    await user.click(button);

    expect(screen.getByText(t.settings.regenerateWarning)).toBeInTheDocument();
    // Still in Settings: one tap changed nothing.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(t.settings.regenerateConfirm) }),
    ).toBeInTheDocument();
  });

  it('confirming opens the gate with the current week still available', async () => {
    const user = userEvent.setup();
    await renderSignedIn();

    const button = await openRegenerate(user);
    await user.click(button);
    await user.click(
      screen.getByRole('button', { name: new RegExp(t.settings.regenerateConfirm) }),
    );

    // Not the first-run heading: there is a plan, and it is about to be replaced.
    expect(screen.getByRole('heading', { name: t.planGate.replaceTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.planGate.keepCurrent })).toBeInTheDocument();
  });

  it('backing out restores the existing week', async () => {
    // The plan was never deleted server-side, so changing your mind must not
    // strand you on the gate with a perfectly good week sitting on the server.
    const user = userEvent.setup();
    await renderSignedIn();

    const button = await openRegenerate(user);
    await user.click(button);
    await user.click(
      screen.getByRole('button', { name: new RegExp(t.settings.regenerateConfirm) }),
    );
    await user.click(screen.getByRole('button', { name: t.planGate.keepCurrent }));

    expect(screen.getByRole('button', { name: 'Now' })).toBeInTheDocument();
  });

  it('replaces the week when a new one is generated', async () => {
    const user = userEvent.setup();
    await renderSignedIn();

    // The starter week says so in the Week tab's average note; a generated one
    // says it was made for the profile. That is the visible difference.
    await user.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByText(/from the built-in Finnish starter plan/)).toBeInTheDocument();

    const button = await openRegenerate(user);
    await user.click(button);
    await user.click(
      screen.getByRole('button', { name: new RegExp(t.settings.regenerateConfirm) }),
    );
    await user.click(screen.getByRole('button', { name: t.planGate.generate }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByText(/generated for your profile/)).toBeInTheDocument();
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
    // Found by its checkbox rather than its text: the offers card names matched
    // items too, and this also proves the row is interactive.
    expect(
      screen.getByRole('checkbox', { name: `${t.shop.checkAria} Salmon fillet` }),
    ).toBeInTheDocument();

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
    expect(screen.getAllByText(/pantry staple, skip if you have it/).length).toBeGreaterThan(0);
  });
});
