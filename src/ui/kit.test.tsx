import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { STARTER_DAYS } from '@/content/starter-plan';
import { emptyLog } from '@/domain/log';
import { C } from '@/design/tokens';
import { AppShell } from './AppShell';
import { BottomNav, TABS } from './BottomNav';
import { DayStrip } from './DayStrip';
import { DetailsToggle } from './DetailsToggle';
import { NumberField, SelectField, TextField } from './Field';
import { Ring } from './Ring';

describe('Ring', () => {
  it('shows the label and sub-label as real text', () => {
    render(<Ring pct={0.5} label="420" sub="kcal left" />);
    expect(screen.getByText('420')).toBeInTheDocument();
    expect(screen.getByText('kcal left')).toBeInTheDocument();
  });

  it('turns berry when over budget', () => {
    const { container } = render(<Ring pct={1.2} over label="+120" sub="over" />);
    const progress = container.querySelectorAll('circle')[1];
    expect(progress).toHaveAttribute('stroke', C.berry);
  });

  it('uses the cloudberry accent when within budget', () => {
    const { container } = render(<Ring pct={0.4} label="900" />);
    const progress = container.querySelectorAll('circle')[1];
    expect(progress).toHaveAttribute('stroke', C.cloud);
  });

  it('clamps progress so an overshoot cannot draw past a full circle', () => {
    // 300% eaten must render as a complete ring, not wrap around again.
    const { container } = render(<Ring pct={3} over label="+900" />);
    const progress = container.querySelectorAll('circle')[1];
    expect(progress?.getAttribute('stroke-dashoffset')).toBe('0');
  });

  it('hides the drawing from assistive tech — the numbers are text', () => {
    const { container } = render(<Ring pct={0.5} label="420" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('DayStrip', () => {
  it('is decorative: every fact it shows is also in the cards', () => {
    const { container } = render(<DayStrip nowHour={12} log={emptyLog()} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks the hour ticks of the 05–23 scale', () => {
    render(<DayStrip nowHour={12} log={emptyLog()} />);
    for (const tick of ['05', '11', '17', '23']) {
      expect(screen.getByText(tick)).toBeInTheDocument();
    }
  });

  it('fills a dot once its meal is logged', () => {
    // Unlogged the dot is an outline; logged it fills in. That contrast is the
    // "what have I missed" signal, so assert the fill actually changes.
    const { container: empty } = render(<DayStrip nowHour={12} log={emptyLog()} />);
    const unlogged = (empty.querySelectorAll('span.rounded-full')[0] as HTMLElement).style
      .background;

    const { container: fed } = render(
      <DayStrip nowHour={12} log={{ ...emptyLog(), m: { b: true } }} />,
    );
    const logged = (fed.querySelectorAll('span.rounded-full')[0] as HTMLElement).style.background;

    expect(unlogged).not.toBe(logged);
    expect(unlogged).toBeTruthy();
    expect(logged).toBeTruthy();
  });
});

describe('DetailsToggle', () => {
  it('keeps the recipe collapsed until asked', async () => {
    const user = userEvent.setup();
    render(<DetailsToggle meal={STARTER_DAYS[0].l} />);
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Ingredients')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('Ingredients')).not.toBeInTheDocument();
  });
});

describe('Field primitives', () => {
  it('binds the label to the control', () => {
    render(<TextField label="Name" value="" onChange={vi.fn()} />);
    // getByLabelText only passes if label/control are actually associated.
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('renders a hint under the control for warnings like the allergy note', () => {
    render(<TextField label="Allergies" value="" onChange={vi.fn()} hint="Check labels." />);
    expect(screen.getByText('Check labels.')).toBeInTheDocument();
  });

  it('reports numeric input as a number', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="Weight (kg)" value={80} onChange={onChange} />);
    await user.type(screen.getByLabelText('Weight (kg)'), '5');
    expect(onChange).toHaveBeenLastCalledWith(805);
  });

  it('never reports a negative number', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="Age" value={35} onChange={onChange} />);
    await user.clear(screen.getByLabelText('Age'));
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('keeps the option value type through a select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectField
        label="Pace"
        value={500}
        options={[
          { value: 250, label: 'Gentle' },
          { value: 500, label: 'Steady' },
          { value: 750, label: 'Faster' },
        ]}
        onChange={onChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText('Pace'), '750');
    expect(onChange).toHaveBeenCalledWith(750); // a number, not "750"
  });
});

describe('BottomNav', () => {
  it('offers the four destinations', () => {
    render(<BottomNav tab="now" onChange={vi.fn()} />);
    for (const label of ['Now', 'Today', 'Week', 'Shop']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(TABS).toHaveLength(4);
  });

  it('marks the current tab for assistive tech, not just with colour', () => {
    render(<BottomNav tab="week" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Now' })).not.toHaveAttribute('aria-current');
  });

  it('reports the chosen tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BottomNav tab="now" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Shop' }));
    expect(onChange).toHaveBeenCalledWith('shop');
  });
});

describe('AppShell', () => {
  it('shows the plain cloudberry wordmark and the settings control', () => {
    render(
      <AppShell tab="now" onTabChange={vi.fn()} onOpenSettings={vi.fn()}>
        <p>content</p>
      </AppShell>,
    );
    expect(screen.getByText('Vire')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('hides the nav while the plan gate or first-run owns the screen', () => {
    render(
      <AppShell tab="now" onTabChange={vi.fn()} onOpenSettings={vi.fn()} showNav={false}>
        <p>gate</p>
      </AppShell>,
    );
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
  });
});
