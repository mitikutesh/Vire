import { describe, expect, it } from 'vitest';
import { STARTER_DAYS } from '@/content/starter-plan';
import { exerciseFor } from '@/content/plan';
import {
  burnedKcal,
  eatenKcal,
  emptyLog,
  firstNameOf,
  isEaten,
  isSwap,
  remainingKcal,
  slotKcal,
  waterGoalGlasses,
} from './log';

const monday = STARTER_DAYS[0];
const TARGET = 1600;

describe('emptyLog', () => {
  it('starts a day with nothing logged', () => {
    const log = emptyLog();
    expect(log.m).toEqual({});
    expect(log.water).toBe(0);
    expect(log.ex).toBe(false);
    expect(log.exx).toEqual([]);
    expect(log.extra).toEqual([]);
  });

  it('returns a fresh object each time', () => {
    // Sharing one object across days would leak yesterday's meals into today.
    const a = emptyLog();
    a.water = 3;
    expect(emptyLog().water).toBe(0);
  });
});

describe('slot entries', () => {
  it('recognises an unlogged slot', () => {
    expect(isEaten(undefined)).toBe(false);
    expect(isEaten(false)).toBe(false);
    expect(isSwap(undefined)).toBe(false);
  });

  it('recognises eaten-as-planned', () => {
    expect(isEaten(true)).toBe(true);
    expect(isSwap(true)).toBe(false);
  });

  it('recognises a swap', () => {
    expect(isSwap({ n: 'pizza', k: 900 })).toBe(true);
    expect(isEaten({ n: 'pizza', k: 900 })).toBe(true);
  });
});

describe('slotKcal', () => {
  it('counts nothing for an unlogged slot', () => {
    expect(slotKcal(emptyLog(), monday, 'b')).toBe(0);
  });

  it('counts the planned meal when eaten as planned', () => {
    const log = { ...emptyLog(), m: { b: true as const } };
    expect(slotKcal(log, monday, 'b')).toBe(monday.b.k);
  });

  it('replaces the planned calories with a swap, not adds to them', () => {
    // The distinction that keeps the day honest: a swap stands in for the meal.
    const log = { ...emptyLog(), m: { b: { n: 'bakery bun', k: 500 } } };
    expect(slotKcal(log, monday, 'b')).toBe(500);
    expect(slotKcal(log, monday, 'b')).not.toBe(500 + monday.b.k);
  });
});

describe('eatenKcal', () => {
  it('sums the eaten slots', () => {
    const log = { ...emptyLog(), m: { b: true as const, l: true as const } };
    expect(eatenKcal(log, monday)).toBe(monday.b.k + monday.l.k);
  });

  it('adds extras on top of the planned meals', () => {
    const log = {
      ...emptyLog(),
      m: { b: true as const },
      extra: [{ n: 'Biscuit', k: 120 }],
    };
    expect(eatenKcal(log, monday)).toBe(monday.b.k + 120);
  });

  it('counts a full day of the starter plan', () => {
    const log = {
      ...emptyLog(),
      m: {
        b: true as const,
        l: true as const,
        s: true as const,
        d: true as const,
        e: true as const,
      },
    };
    expect(eatenKcal(log, monday)).toBe(
      monday.b.k + monday.l.k + monday.s.k + monday.d.k + monday.e.k,
    );
  });
});

describe('burnedKcal', () => {
  it('counts nothing before any movement is logged', () => {
    expect(burnedKcal(emptyLog(), 0)).toBe(0);
  });

  it("counts the day's planned session once marked done", () => {
    expect(burnedKcal({ ...emptyLog(), ex: true }, 0)).toBe(exerciseFor(0).k);
  });

  it('adds quick-added movement', () => {
    const log = { ...emptyLog(), ex: true, exx: [{ n: 'Walk 30 min', k: 140 }] };
    expect(burnedKcal(log, 0)).toBe(exerciseFor(0).k + 140);
  });
});

describe('remainingKcal', () => {
  it('returns the whole target on an empty day', () => {
    expect(remainingKcal(emptyLog(), monday, 0, TARGET)).toBe(TARGET);
  });

  it('credits movement back to the budget', () => {
    const eatenOnly = { ...emptyLog(), m: { b: true as const } };
    const eatenAndMoved = { ...eatenOnly, ex: true };
    expect(remainingKcal(eatenAndMoved, monday, 0, TARGET)).toBe(
      remainingKcal(eatenOnly, monday, 0, TARGET) + exerciseFor(0).k,
    );
  });

  it('goes negative when over budget', () => {
    const log = { ...emptyLog(), extra: [{ n: 'Takeaway', k: 2000 }] };
    expect(remainingKcal(log, monday, 0, TARGET)).toBeLessThan(0);
  });
});

describe('waterGoalGlasses', () => {
  it('converts millilitres to 250 ml glasses', () => {
    expect(waterGoalGlasses(2000)).toBe(8);
    expect(waterGoalGlasses(1500)).toBe(6);
  });

  it('never asks for fewer than four glasses', () => {
    expect(waterGoalGlasses(500)).toBe(4);
    expect(waterGoalGlasses(0)).toBe(4);
  });
});

describe('firstNameOf', () => {
  it('greets with the first name only', () => {
    expect(firstNameOf('Mitiku Geleta')).toBe('Mitiku');
    expect(firstNameOf('  Aino  ')).toBe('Aino');
  });

  it('handles an empty name', () => {
    expect(firstNameOf('')).toBe('');
    expect(firstNameOf('   ')).toBe('');
  });
});
