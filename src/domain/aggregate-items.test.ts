import { describe, expect, it } from 'vitest';
import { grocItemSchema } from './schema';
import { grocId } from './groc-id';
import { aggregateItems } from './aggregate-items';

const row = (fi: string, en: string, cat: string, q: string, staple?: 1) =>
  staple === undefined ? [fi, en, cat, q] : [fi, en, cat, q, staple];

describe('aggregateItems', () => {
  it('produces valid grocery lines', () => {
    const items = aggregateItems([row('peruna', 'Potatoes', 'produce', '200 g')]);
    for (const item of items) {
      expect(grocItemSchema.safeParse(item).success).toBe(true);
    }
  });

  it('adds up the same food across days', () => {
    const items = aggregateItems([
      row('peruna', 'Potatoes', 'produce', '200 g'),
      row('peruna', 'Potatoes', 'produce', '250 g'),
      row('peruna', 'Potatoes', 'produce', '150 g'),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.q).toBe('600 g');
  });

  it('switches to kilos once a line passes 1 kg', () => {
    // 1300 g is not a number anyone shops by.
    const items = aggregateItems([
      row('peruna', 'Potatoes', 'produce', '800 g'),
      row('peruna', 'Potatoes', 'produce', '500 g'),
    ]);
    expect(items[0]?.q).toBe('1.3 kg');
  });

  it('keeps different units side by side rather than adding them', () => {
    const items = aggregateItems([
      row('maito', 'Milk', 'dairy', '2 dl'),
      row('maito', 'Milk', 'dairy', '1 l'),
    ]);
    expect(items[0]?.q).toContain('2 dl');
    expect(items[0]?.q).toContain('1 l');
  });

  it('merges plural and singular units', () => {
    // The prototype split "1 can" and "2 cans" into two shopping lines.
    const items = aggregateItems([
      row('kikherneet', 'Chickpeas', 'pantry', '1 can'),
      row('kikherneet', 'Chickpeas', 'pantry', '2 cans'),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.q).toBe('3 can');
  });

  it('counts unitless quantities without inventing a unit', () => {
    const items = aggregateItems([
      row('sipuli', 'Onions', 'produce', '2'),
      row('sipuli', 'Onions', 'produce', '3'),
    ]);
    expect(items[0]?.q).toBe('5');
  });

  it('accepts comma decimals from a Finnish-speaking model', () => {
    const items = aggregateItems([row('kaurakerma', 'Oat cream', 'dairy', '0,5 dl')]);
    expect(items[0]?.q).toBe('0.5 dl');
  });

  it('carries unparseable quantities through as text', () => {
    const items = aggregateItems([
      row('kalkkunajauheliha', 'Turkey mince', 'fish', 'smallest pack'),
    ]);
    expect(items[0]?.q).toBe('smallest pack');
  });

  it('keeps at most two free-text notes so a line stays scannable', () => {
    const items = aggregateItems([
      row('juusto', 'Cheese', 'dairy', 'small block'),
      row('juusto', 'Cheese', 'dairy', 'one wedge'),
      row('juusto', 'Cheese', 'dairy', 'a handful'),
    ]);
    expect(items[0]?.q).toBe('small block + one wedge');
  });

  it('falls back to "as needed" when there is no usable quantity', () => {
    const items = aggregateItems([row('suola', 'Salt', 'pantry', '')]);
    expect(items[0]?.q).toBe('as needed');
  });

  it('marks a line a staple if any day said so', () => {
    const items = aggregateItems([
      row('rypsiöljy', 'Rapeseed oil', 'pantry', '1 tbsp'),
      row('rypsiöljy', 'Rapeseed oil', 'pantry', '1 tbsp', 1),
    ]);
    expect(items[0]?.st).toBe(true);
  });

  it('omits the staple flag for ordinary shopping', () => {
    const items = aggregateItems([row('peruna', 'Potatoes', 'produce', '200 g')]);
    expect(items[0]?.st).toBeUndefined();
  });

  it('maps the prompt category codes to shopping aisles', () => {
    const items = aggregateItems([
      row('lohifilee', 'Salmon', 'fish', '120 g'),
      row('maitorahka', 'Skyr', 'dairy', '150 g'),
      row('omena', 'Apple', 'produce', '1'),
      row('kaurahiutaleet', 'Oats', 'grain', '80 g'),
      row('sinappi', 'Mustard', 'pantry', '1 tsp'),
    ]);
    expect(items.map((i) => i.cat)).toEqual([
      'Fish & meat',
      'Dairy & eggs',
      'Fruit & vegetables',
      'Bread & grains',
      'Pantry & cans',
    ]);
  });

  it('files an unknown category in the pantry rather than dropping the food', () => {
    const items = aggregateItems([row('kvinoa', 'Quinoa', 'mystery', '70 g')]);
    expect(items[0]?.cat).toBe('Pantry & cans');
  });

  it('sorts by aisle, then alphabetically — the order you walk the shop', () => {
    const items = aggregateItems([
      row('sinappi', 'Mustard', 'pantry', '1 tsp'),
      row('omena', 'Apple', 'produce', '1'),
      row('lohifilee', 'Salmon', 'fish', '120 g'),
      row('banaani', 'Bananas', 'produce', '2'),
    ]);
    // Fish aisle first, then produce alphabetically, then pantry.
    expect(items.map((i) => i.n)).toEqual(['Salmon', 'Apple', 'Bananas', 'Mustard']);
  });

  it('gives every line a content-stable id', () => {
    const items = aggregateItems([row('täysjyväpasta', 'Wholegrain pasta', 'grain', '80 g')]);
    expect(items[0]?.id).toBe(grocId('täysjyväpasta'));
    expect(items[0]?.id).toBe('taysjyvapasta');
  });

  it('keeps ids identical when the list order changes', () => {
    // The regression that made stale offer badges point at the wrong food.
    const a = aggregateItems([
      row('peruna', 'Potatoes', 'produce', '200 g'),
      row('omena', 'Apple', 'produce', '1'),
    ]);
    const b = aggregateItems([
      row('omena', 'Apple', 'produce', '1'),
      row('peruna', 'Potatoes', 'produce', '200 g'),
    ]);
    const idOf = (items: typeof a, name: string) => items.find((i) => i.n === name)?.id;
    expect(idOf(a, 'Potatoes')).toBe(idOf(b, 'Potatoes'));
    expect(idOf(a, 'Apple')).toBe(idOf(b, 'Apple'));
  });

  it('merges names that differ only by case', () => {
    const items = aggregateItems([
      row('Peruna', 'Potatoes', 'produce', '200 g'),
      row('peruna', 'Potatoes', 'produce', '300 g'),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.q).toBe('500 g');
  });

  it('survives malformed model output instead of losing the list', () => {
    const items = aggregateItems([
      row('peruna', 'Potatoes', 'produce', '200 g'),
      null,
      undefined,
      'not a row',
      [],
      ['too', 'short'],
      ['', 'No Finnish name', 'produce', '1'], // unusable: links need the fi name
      42,
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.n).toBe('Potatoes');
  });

  it('falls back to the Finnish name when the English one is missing', () => {
    const items = aggregateItems([['puolukkahillo', '', 'pantry', 'small jar']]);
    expect(items[0]?.n).toBe('puolukkahillo');
  });

  it('returns an empty list for no input', () => {
    expect(aggregateItems([])).toEqual([]);
  });
});
