import { describe, expect, it } from 'vitest';
import { planSchema } from '@/domain/schema';
import { grocId } from '@/domain/groc-id';
import { STARTER_DAYS, STARTER_GROC, starterPlan } from './starter-plan';
import { EX, GREETING_BOUNDS, KCAL_FLOOR, QUICK_EX, SLOT_BUDGET_RATIO, SLOTS } from './plan';
import { DAY_NAMES, DAY_SHORT, SLOT_LABEL, t } from './strings';

describe('starter plan', () => {
  it('is a valid plan document', () => {
    // The starter week is the offline fallback: if it ever fails validation the
    // app has nothing to fall back to, so this must hold at build time.
    const parsed = planSchema.safeParse(starterPlan(1_700_000_000_000));
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 4))).toBe(true);
  });

  it('covers seven days and five slots each', () => {
    expect(STARTER_DAYS).toHaveLength(7);
    for (const day of STARTER_DAYS) {
      for (const slot of SLOTS) {
        expect(day[slot].n.length).toBeGreaterThan(0);
      }
    }
  });

  it('treats snacks as assembly-only — no steps, no video', () => {
    // Matches the prototype and the generation prompt contract: `s` and `e` are
    // grab-and-eat, so cooking steps there would be noise.
    for (const day of STARTER_DAYS) {
      for (const slot of ['s', 'e'] as const) {
        expect(day[slot].st).toBeUndefined();
        expect(day[slot].yt).toBeUndefined();
      }
    }
  });

  it('gives every cooked meal steps and a video search term', () => {
    for (const day of STARTER_DAYS) {
      for (const slot of ['b', 'l', 'd'] as const) {
        expect(day[slot].st?.length ?? 0).toBeGreaterThan(0);
        expect(day[slot].st?.length ?? 0).toBeLessThanOrEqual(3);
        expect(day[slot].yt).toBeTruthy();
      }
    }
  });

  it('lands each day in a plausible daily range', () => {
    // Not a target check (the plan is fixed content, targets are per-user), but
    // a guard against a transcription slip turning a day into 200 or 6000 kcal.
    for (const [i, day] of STARTER_DAYS.entries()) {
      const total = SLOTS.reduce((sum, slot) => sum + day[slot].k, 0);
      expect(total, `day ${i} total ${total}`).toBeGreaterThanOrEqual(KCAL_FLOOR.f);
      expect(total, `day ${i} total ${total}`).toBeLessThanOrEqual(2200);
    }
  });
});

describe('starter grocery list', () => {
  it('derives ids from the Finnish name', () => {
    for (const item of STARTER_GROC) {
      expect(item.id).toBe(grocId(item.fi));
    }
  });

  it('has unique ids', () => {
    // A collision would make two foods share a checkbox and an offer badge.
    const ids = STARTER_GROC.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces ASCII-safe ids from Finnish diacritics', () => {
    expect(grocId('täysjyväpasta')).toBe('taysjyvapasta');
    expect(grocId('tonnikala vedessä')).toBe('tonnikala-vedessa');
    expect(grocId('näkkileipä')).toBe('nakkileipa');
  });

  it('keeps ids stable across list regeneration', () => {
    // The whole point: same food, same id, regardless of position.
    expect(grocId('lohifilee')).toBe(grocId('lohifilee'));
    expect(grocId('Lohifilee')).toBe(grocId('lohifilee'));
  });
});

describe('week structure', () => {
  it('splits the daily budget across the five slots to ~100%', () => {
    const sum = SLOTS.reduce((acc, slot) => acc + SLOT_BUDGET_RATIO[slot], 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('rotates exercise across seven days and rests on Sunday', () => {
    expect(EX).toHaveLength(7);
    expect(EX[6].n.toLowerCase()).toContain('rest');
    expect(QUICK_EX.length).toBeGreaterThan(0);
  });

  it('orders the greeting boundaries through the day', () => {
    const { quietUntil, morningUntil, dayUntil, afternoonUntil } = GREETING_BOUNDS;
    expect(quietUntil).toBeLessThan(morningUntil);
    expect(morningUntil).toBeLessThan(dayUntil);
    expect(dayUntil).toBeLessThan(afternoonUntil);
  });
});

describe('strings', () => {
  it('labels all five slots and all seven days', () => {
    for (const slot of SLOTS) {
      expect(SLOT_LABEL[slot].label.length).toBeGreaterThan(0);
      expect(SLOT_LABEL[slot].hint.length).toBeGreaterThan(0);
    }
    expect(DAY_NAMES).toHaveLength(7);
    expect(DAY_SHORT).toHaveLength(7);
  });

  it('keeps the health guardrail copy (PLAN §7)', () => {
    // These sentences are product requirements, not decoration. Losing one is a
    // guardrail regression, so assert the substance of each.
    expect(t.settings.doctorNote).toContain('Mifflin-St Jeor');
    expect(t.settings.doctorNote).toContain('doctor');
    expect(t.settings.allergiesNote).toContain('double-check product labels');
    expect(t.today.disclaimer).toContain('estimates');
    expect(t.shop.offersFooter('12.5. 08:00')).toContain('verify with the S/K price links');
  });

  it('warns that the starter plan is not allergy-adjusted, wherever it is offered', () => {
    // Guardrail 3: both the idle and the post-error offer must carry the caveat.
    expect(t.planGate.starter(true)).toContain('not adjusted for your allergies');
    expect(t.planGate.starterAfterError(true)).toContain('not adjusted for your allergies');
    // …and stay quiet when the user has no allergies to warn about.
    expect(t.planGate.starter(false)).not.toContain('allergies');
    expect(t.planGate.starterAfterError(false)).not.toContain('allergies');
  });

  it('names stated allergens in the generation blurb', () => {
    expect(t.planGate.blurb('peanuts')).toContain('avoiding peanuts');
    expect(t.planGate.blurb(null)).not.toContain('avoiding');
  });

  it('converts the water goal from glasses to litres', () => {
    expect(t.today.waterGoal(8)).toContain('8 glasses');
    expect(t.today.waterGoal(8)).toContain('2 L');
  });

  it('pluralises the offer apply button', () => {
    expect(t.shop.offersApply(1)).toBe('Tag 1 item to their discount store');
    expect(t.shop.offersApply(3)).toBe('Tag 3 items to their discount store');
  });
});
