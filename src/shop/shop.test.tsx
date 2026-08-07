import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { GrocStateHandle } from '@/data/useVireData';
import { starterPlan } from '@/content/starter-plan';
import { t } from '@/content/strings';
import { GROC_CATS } from '@/domain/constants';
import { emptyGrocState } from '@/domain/groc-state';
import { kLink, sLink } from '@/domain/links';
import type { GrocState, StoredPlan } from '@/domain/schema';
import { ShopView } from './ShopView';

const PLAN: StoredPlan = { ...starterPlan(1_700_000_000_000), planId: 'plan-1' };
const FIRST = PLAN.groc[0]!;
const SECOND = PLAN.groc[1]!;

/** The harness owns the state, so a tap flows through `update` and back. */
function Harness({ state }: { state: GrocState }) {
  const [groc, setGroc] = useState(state);
  const handle: GrocStateHandle = {
    value: groc,
    groc,
    update: (change) => setGroc((prev) => change(prev)),
    ready: true,
    saveFailed: false,
    dismissSaveError: () => {},
  };
  return <ShopView plan={PLAN} groc={handle} />;
}

function setup(state: GrocState = emptyGrocState()) {
  render(<Harness state={state} />);
  return { user: userEvent.setup() };
}

const rowFor = (name: string) => screen.getByText(new RegExp(name)).closest('li')!;
const checkbox = (name: string) => within(rowFor(name)).getByRole('checkbox');
const tagButton = (name: string) =>
  within(rowFor(name)).getByRole('button', { name: new RegExp(name) });

describe('the list', () => {
  it('renders the whole week’s list', () => {
    setup();
    expect(screen.getAllByRole('checkbox')).toHaveLength(PLAN.groc.length);
  });

  it('groups items under all five category headers', () => {
    setup();
    for (const cat of GROC_CATS) {
      expect(screen.getByText(cat)).toBeInTheDocument();
    }
  });

  it('shows the English name with the Finnish shopping name', () => {
    // The pairing is what makes the store search links land on the right product.
    setup();
    expect(screen.getByText(new RegExp(FIRST.n))).toHaveTextContent(FIRST.fi);
  });

  it('marks pantry staples as skippable', () => {
    setup();
    expect(screen.getAllByText(/pantry staple/).length).toBeGreaterThan(0);
  });

  it('links each item to both chains’ live prices', () => {
    // The permanent design, not a stopgap: S-Group has no price API and Kesko's
    // is closed to individuals.
    setup();
    const row = within(rowFor(FIRST.n));
    expect(row.getByRole('link', { name: t.shop.priceAtS(FIRST.n) })).toHaveAttribute(
      'href',
      sLink(FIRST.fi),
    );
    expect(row.getByRole('link', { name: t.shop.priceAtK(FIRST.n) })).toHaveAttribute(
      'href',
      kLink(FIRST.fi),
    );
  });
});

describe('the basket', () => {
  it('starts empty', () => {
    setup();
    expect(screen.getByText(t.shop.basket(0, PLAN.groc.length))).toBeInTheDocument();
  });

  it('checks an item off and strikes it through', async () => {
    const { user } = setup();
    await user.click(checkbox(FIRST.n));

    expect(checkbox(FIRST.n)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(new RegExp(FIRST.n))).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.getByText(t.shop.basket(1, PLAN.groc.length))).toBeInTheDocument();
  });

  it('unchecks again', async () => {
    const { user } = setup({ ...emptyGrocState(), checked: { [FIRST.id]: true } });
    await user.click(checkbox(FIRST.n));
    expect(checkbox(FIRST.n)).toHaveAttribute('aria-checked', 'false');
  });

  it('reports progress for anyone who cannot see the bar', () => {
    setup({ ...emptyGrocState(), checked: { [FIRST.id]: true, [SECOND.id]: true } });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      String(PLAN.groc.length),
    );
  });

  it('empties the basket but keeps the store assignments', async () => {
    // The store map is the plan for the trip; emptying the basket is about the
    // trip having started over, not about forgetting where things are bought.
    const { user } = setup({ checked: { [FIRST.id]: true }, store: { [FIRST.id]: 'K' } });
    await user.click(screen.getByRole('button', { name: new RegExp(t.shop.reset) }));

    expect(checkbox(FIRST.n)).toHaveAttribute('aria-checked', 'false');
    expect(tagButton(FIRST.n)).toHaveTextContent('K');
  });

  it('offers no reset when nothing is checked', () => {
    setup();
    expect(screen.getByRole('button', { name: new RegExp(t.shop.reset) })).toBeDisabled();
  });
});

describe('store tags', () => {
  it('cycles through the chains and back to none', async () => {
    // Manual, because no price API can decide it for us.
    const { user } = setup();
    const button = () => tagButton(FIRST.n);

    expect(button()).toHaveTextContent('–');
    await user.click(button());
    expect(button()).toHaveTextContent('S');
    await user.click(button());
    expect(button()).toHaveTextContent('K');
    await user.click(button());
    expect(button()).toHaveTextContent('L');
    await user.click(button());
    expect(button()).toHaveTextContent('–');
  });

  it('names the item and its tag, so 60 rows are not 60 identical buttons', () => {
    setup({ ...emptyGrocState(), store: { [FIRST.id]: 'S' } });
    expect(
      screen.getByRole('button', { name: t.shop.assignStoreAria(FIRST.n, 'S') }),
    ).toBeInTheDocument();
  });

  it('leaves no undefined behind when a tag is cleared', async () => {
    // The state is validated on the way out, and an explicit undefined is not a
    // store tag.
    const { user } = setup({ ...emptyGrocState(), store: { [FIRST.id]: 'L' } });
    await user.click(tagButton(FIRST.n));
    expect(tagButton(FIRST.n)).toHaveTextContent('–');
  });
});

describe('filters', () => {
  const filterButton = (name: string | RegExp) => screen.getByRole('button', { name });

  it('counts what is assigned to each chain', () => {
    setup({ ...emptyGrocState(), store: { [FIRST.id]: 'S', [SECOND.id]: 'S' } });
    expect(filterButton(t.shop.filterFor('S', 2))).toBeInTheDocument();
    expect(filterButton(t.shop.filterFor('K', 0))).toBeInTheDocument();
  });

  it('narrows the list to one chain', async () => {
    const { user } = setup({ ...emptyGrocState(), store: { [FIRST.id]: 'S' } });
    await user.click(filterButton(t.shop.filterFor('S', 1)));

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText(new RegExp(FIRST.n))).toBeInTheDocument();
  });

  it('says so when a chain has nothing assigned', async () => {
    const { user } = setup();
    await user.click(filterButton(t.shop.filterFor('K', 0)));
    expect(screen.getByText(t.shop.filterEmpty)).toBeInTheDocument();
  });

  it('goes back to everything', async () => {
    const { user } = setup({ ...emptyGrocState(), store: { [FIRST.id]: 'S' } });
    await user.click(filterButton(t.shop.filterFor('S', 1)));
    await user.click(filterButton(t.shop.filterAll(PLAN.groc.length)));
    expect(screen.getAllByRole('checkbox')).toHaveLength(PLAN.groc.length);
  });

  it('keeps the basket count over the whole list, not the filtered view', async () => {
    // The count answers "am I done shopping", which a filter must not change.
    const { user } = setup({ checked: { [FIRST.id]: true }, store: { [FIRST.id]: 'S' } });
    await user.click(filterButton(t.shop.filterFor('S', 1)));
    expect(screen.getByText(t.shop.basket(1, PLAN.groc.length))).toBeInTheDocument();
  });
});
