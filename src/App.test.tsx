import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAuthClient } from '@/auth/fake-client';
import { t } from '@/content/strings';
import App from './App';

const OWNER = 'owner@example.com';

/** Render already signed in — the auth screen has its own suite. */
async function renderSignedIn() {
  render(<App auth={new FakeAuthClient({ signedInAs: OWNER })} />);
  // The splash shows first while the session is restored.
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
    await user.click(screen.getByRole('button', { name: t.app.settingsAria }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: t.auth.signInTitle })).toBeInTheDocument(),
    );
  });
});

/**
 * The M0 demo criterion: the locked design renders all four tabs from the
 * starter plan, before any backend exists (E0.5).
 */
describe('App shell', () => {
  beforeEach(async () => {
    await renderSignedIn();
  });

  it('opens on the Now tab', () => {
    expect(screen.getByRole('button', { name: 'Now' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders every tab from the starter plan', async () => {
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
