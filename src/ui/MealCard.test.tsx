import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { STARTER_DAYS } from '@/content/starter-plan';
import { MealCard } from './MealCard';

const meal = STARTER_DAYS[0].b;
const snack = STARTER_DAYS[0].s;

function setup(overrides: Partial<Parameters<typeof MealCard>[0]> = {}) {
  const props = {
    slot: 'b' as const,
    meal,
    entry: undefined,
    onToggle: vi.fn(),
    onLogSwap: vi.fn(),
    onClearSwap: vi.fn(),
    ...overrides,
  };
  render(<MealCard {...props} />);
  return props;
}

describe('MealCard accessibility (I4)', () => {
  it('exposes the eaten toggle as a checkbox', () => {
    setup();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(checkbox).toHaveAccessibleName(/breakfast/i);
  });

  it('does NOT nest the checkbox inside another interactive element', () => {
    // The prototype put the role="checkbox" span inside the expand <button> and
    // leaned on stopPropagation: invalid HTML, and unreachable by keyboard.
    setup();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.closest('button')).toBe(checkbox);
    const expander = screen.getByRole('button', { expanded: false });
    expect(expander.contains(checkbox)).toBe(false);
  });

  it('reaches both controls by keyboard, in reading order', async () => {
    const user = userEvent.setup();
    const { onToggle } = setup();

    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(screen.getByRole('button', { expanded: false })).toHaveFocus();
  });

  it('ties the expander to the panel it controls', async () => {
    const user = userEvent.setup();
    setup();
    const expander = screen.getByRole('button', { expanded: false });
    const panelId = expander.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();

    await user.click(expander);
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(document.getElementById(panelId!)).toBeInTheDocument();
  });
});

describe('MealCard state', () => {
  it('reports the eaten state on the checkbox', () => {
    setup({ entry: true });
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the planned calories', () => {
    setup();
    expect(screen.getByText(String(meal.k))).toBeInTheDocument();
  });

  it('shows the swapped calories instead of the planned ones', () => {
    setup({ entry: { n: 'bakery bun', k: 480 } });
    expect(screen.getByText('480')).toBeInTheDocument();
    expect(screen.queryByText(String(meal.k))).not.toBeInTheDocument();
  });

  it('shows the Finnish dish name alongside the English one', () => {
    setup();
    expect(screen.getByText(/Kaurapuuro mustikoilla/)).toBeInTheDocument();
  });

  it('hides logging controls on a read-only past day', async () => {
    const user = userEvent.setup();
    setup({ disabled: true });
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.queryByText(/Ate something else/i)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});

describe('MealCard details', () => {
  it('reveals ingredients and steps when expanded', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Ingredients')).toBeInTheDocument();
    expect(screen.getByText('How to make it')).toBeInTheDocument();
    expect(screen.getByText(meal.ing[0]!)).toBeInTheDocument();
  });

  it('omits cooking steps and video for an assembly-only snack', async () => {
    const user = userEvent.setup();
    setup({ slot: 's', meal: snack });
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Ingredients')).toBeInTheDocument();
    expect(screen.queryByText('How to make it')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links the recipe video search for a cooked meal', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { expanded: false }));
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', expect.stringContaining('youtube.com/results'));
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});
