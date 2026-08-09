import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { t } from '@/content/strings';
import type { PlacedPrep } from '@/domain/prep';
import { HeadStartCard } from './HeadStartCard';

const item = (over: Partial<PlacedPrep> = {}): PlacedPrep => ({
  slot: 'l',
  weekday: 1,
  mealName: 'Chickpea and barley stew',
  stage: { lead: 480, leadMax: 960, active: 5, do: 'Soak the chickpeas' },
  start: new Date('2026-08-10T20:30:00'),
  tonight: true,
  ...over,
});

describe('the head-start card', () => {
  it('renders nothing when there is nothing to start', () => {
    // An empty card on every ordinary day would be worse than no feature.
    const { container } = render(<HeadStartCard today={[]} tonight={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says what to do, for which meal, and when to start', () => {
    render(<HeadStartCard today={[]} tonight={[item()]} />);
    expect(screen.getByText('Soak the chickpeas')).toBeInTheDocument();
    expect(screen.getByText(/Chickpea and barley stew/)).toBeInTheDocument();
    expect(screen.getByText(/Start 20:30/)).toBeInTheDocument();
  });

  it('separates tonight from now, because they are different decisions', () => {
    render(
      <HeadStartCard
        today={[item({ tonight: false, stage: { lead: 120, active: 10, do: 'Start the stew' } })]}
        tonight={[item()]}
      />,
    );
    expect(screen.getByText(t.prep.todayTitle)).toBeInTheDocument();
    expect(screen.getByText(t.prep.tonightTitle)).toBeInTheDocument();
  });

  it('consolidates two head starts into one card, not two', () => {
    // The repo refuses streaks and badges because piling on signals makes people
    // quit; the same argument applies to interruptions.
    const { container } = render(
      <HeadStartCard
        today={[]}
        tonight={[
          item(),
          item({
            slot: 'd',
            mealName: 'Baked trout',
            stage: { lead: 720, leadMax: 1080, active: 2, do: 'Move the trout to the fridge' },
          }),
        ]}
      />,
    );
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('carries the food-safety line wherever prep is shown (guardrail 7)', () => {
    // This is the one feature where model output is an instruction to leave food
    // out for hours, so the line is not decoration.
    render(<HeadStartCard today={[]} tonight={[item()]} />);
    expect(screen.getByText(t.prep.safetyNote)).toBeInTheDocument();
  });
});
