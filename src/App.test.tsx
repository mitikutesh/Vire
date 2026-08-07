import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

/**
 * The M0 demo criterion: the locked design renders all four tabs from the
 * starter plan, before any backend exists (E0.5).
 */
describe('App shell', () => {
  it('opens on the Now tab', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Now' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders every tab from the starter plan', async () => {
    const user = userEvent.setup();
    render(<App />);

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
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByText(/estimates for one home-cooked portion/)).toBeInTheDocument();
  });

  it('marks a meal as eaten and moves the remaining calories', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Today' }));

    const before = screen.getByText(/kcal (left|over)/).textContent;
    const [firstMeal] = screen.getAllByRole('checkbox');
    await user.click(firstMeal!);

    expect(screen.getByText(/kcal (left|over)/).textContent).not.toBe(before);
    expect(firstMeal).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the pantry-staple hint on staple items', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Shop' }));
    expect(screen.getAllByText(/pantry staple — skip if you have it/).length).toBeGreaterThan(0);
  });
});
