import { describe, expect, it } from 'vitest';
import { KCAL_FLOOR } from '@/content/plan';
import { calcBmr, calcTarget, isAtFloor } from './target';
import type { TargetInput } from './schema';

const base: TargetInput = { sex: 'f', age: 35, h: 170, w: 80, act: 1.375, pace: 500 };

describe('calcBmr', () => {
  it('applies Mifflin-St Jeor with the female constant', () => {
    // 10·80 + 6.25·170 − 5·35 − 161
    expect(calcBmr(base)).toBeCloseTo(1526.5, 5);
  });

  it('applies Mifflin-St Jeor with the male constant', () => {
    // Same body, +5 instead of −161: a 166 kcal difference.
    expect(calcBmr({ ...base, sex: 'm' })).toBeCloseTo(1692.5, 5);
  });
});

describe('calcTarget', () => {
  it('subtracts the chosen deficit from maintenance and rounds to 10', () => {
    // 1526.5 × 1.375 = 2098.94; − 500 = 1598.94 → 1600
    expect(calcTarget(base)).toBe(1600);
  });

  it('scales with the activity multiplier', () => {
    const sitting = calcTarget({ ...base, act: 1.2 });
    const veryActive = calcTarget({ ...base, act: 1.725 });
    expect(sitting).toBeLessThan(veryActive);
    expect(sitting).toBe(1330); // 1526.5 × 1.2 − 500 = 1331.8 → 1330
  });

  it('moves the target down as the pace gets faster', () => {
    const gentle = calcTarget({ ...base, pace: 250 });
    const steady = calcTarget({ ...base, pace: 500 });
    const faster = calcTarget({ ...base, pace: 750 });
    expect(gentle - steady).toBe(250);
    expect(steady - faster).toBe(250);
  });

  it('always returns a multiple of 10', () => {
    for (const age of [18, 27, 41, 63, 79]) {
      for (const w of [52, 68.5, 91, 117]) {
        expect(calcTarget({ ...base, age, w }) % 10).toBe(0);
      }
    }
  });

  /* The floors are a health guardrail, not a preference (PLAN §7). These are
     the cases where an aggressive pace on a small body would otherwise produce
     a dangerous number. */
  describe('calorie floors', () => {
    const smallFemale: TargetInput = {
      sex: 'f',
      age: 70,
      h: 150,
      w: 45,
      act: 1.2,
      pace: 750,
    };

    it('never goes below 1200 kcal for a female profile', () => {
      // Unfloored this is ~302 kcal.
      expect(calcTarget(smallFemale)).toBe(KCAL_FLOOR.f);
      expect(isAtFloor(smallFemale)).toBe(true);
    });

    it('never goes below 1500 kcal for a male profile', () => {
      const smallMale: TargetInput = { ...smallFemale, sex: 'm' };
      expect(calcTarget(smallMale)).toBe(KCAL_FLOOR.m);
      expect(isAtFloor(smallMale)).toBe(true);
    });

    it('holds the floor across every pace and activity combination', () => {
      for (const act of [1.2, 1.375, 1.55, 1.725] as const) {
        for (const pace of [250, 500, 750] as const) {
          for (const sex of ['f', 'm'] as const) {
            const target = calcTarget({ ...smallFemale, sex, act, pace });
            expect(target).toBeGreaterThanOrEqual(KCAL_FLOOR[sex]);
          }
        }
      }
    });

    it('does not report the floor when the pace alone sets the target', () => {
      expect(isAtFloor(base)).toBe(false);
    });
  });
});
