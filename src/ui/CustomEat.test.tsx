import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomEat } from './CustomEat';

describe('CustomEat', () => {
  it('starts as a quiet prompt, not a form', () => {
    render(<CustomEat value={undefined} planned={350} onLog={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Ate something else/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('kcal')).not.toBeInTheDocument();
  });

  it('logs a swap with a name and calories', async () => {
    const user = userEvent.setup();
    const onLog = vi.fn();
    render(<CustomEat value={undefined} planned={350} onLog={onLog} onClear={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Ate something else/i }));
    await user.type(screen.getByLabelText('What (optional)'), 'bakery bun');
    await user.type(screen.getByLabelText('kcal'), '480');
    await user.click(screen.getByRole('button', { name: 'Log' }));

    expect(onLog).toHaveBeenCalledWith({ n: 'bakery bun', k: 480 });
  });

  it('accepts a swap with no name — "something else" is a valid answer', async () => {
    const user = userEvent.setup();
    const onLog = vi.fn();
    render(<CustomEat value={undefined} planned={350} onLog={onLog} onClear={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Ate something else/i }));
    await user.type(screen.getByLabelText('kcal'), '300');
    await user.click(screen.getByRole('button', { name: 'Log' }));

    expect(onLog).toHaveBeenCalledWith({ n: '', k: 300 });
  });

  it('refuses to log without calories, which are the whole point', async () => {
    const user = userEvent.setup();
    const onLog = vi.fn();
    render(<CustomEat value={undefined} planned={350} onLog={onLog} onClear={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Ate something else/i }));
    await user.type(screen.getByLabelText('What (optional)'), 'mystery');
    await user.click(screen.getByRole('button', { name: 'Log' }));

    expect(onLog).not.toHaveBeenCalled();
  });

  it('ignores non-digits in the calorie field', async () => {
    const user = userEvent.setup();
    const onLog = vi.fn();
    render(<CustomEat value={undefined} planned={350} onLog={onLog} onClear={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Ate something else/i }));
    await user.type(screen.getByLabelText('kcal'), '4a8b0');
    await user.click(screen.getByRole('button', { name: 'Log' }));

    expect(onLog).toHaveBeenCalledWith({ n: '', k: 480 });
  });

  it('submits on Enter from the calorie field', async () => {
    const user = userEvent.setup();
    const onLog = vi.fn();
    render(<CustomEat value={undefined} planned={350} onLog={onLog} onClear={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Ate something else/i }));
    await user.type(screen.getByLabelText('kcal'), '200{Enter}');

    expect(onLog).toHaveBeenCalledWith({ n: '', k: 200 });
  });

  it('shows what was logged and what was planned, for comparison', () => {
    render(
      <CustomEat
        value={{ n: 'pizza slice', k: 600 }}
        planned={350}
        onLog={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText('pizza slice')).toBeInTheDocument();
    expect(screen.getByText(/600 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/plan 350/)).toBeInTheDocument();
  });

  it('falls back to "something else" when the swap had no name', () => {
    render(<CustomEat value={{ n: '', k: 600 }} planned={350} onLog={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText('something else')).toBeInTheDocument();
  });

  it('clears a logged swap', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <CustomEat value={{ n: 'pizza', k: 600 }} planned={350} onLog={vi.fn()} onClear={onClear} />,
    );
    await user.click(screen.getByRole('button', { name: /Remove logged food/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
