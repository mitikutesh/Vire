import { KCAL_FLOOR } from '@/content/plan';
import type { TargetInput } from './schema';

/**
 * Basal metabolic rate, Mifflin-St Jeor.
 *
 * Shown to the user as an estimate, never as fact — the Settings screen says so
 * and points at their doctor (health guardrail 2).
 */
export function calcBmr({ sex, age, h, w }: Pick<TargetInput, 'sex' | 'age' | 'h' | 'w'>): number {
  return 10 * w + 6.25 * h - 5 * age + (sex === 'm' ? 5 : -161);
}

/**
 * The daily calorie target: BMR × activity − chosen deficit, held above a hard
 * floor and rounded to the nearest 10.
 *
 * The floor is the reason this function exists in one place and is called
 * server-side on every save (PLAN §6 I5, §7 guardrail 1). An aggressive pace on
 * a small body would otherwise produce a target low enough to be harmful, and a
 * client-side-only check is a check an attacker or a stale bundle can skip.
 */
export function calcTarget({ sex, age, h, w, act, pace }: TargetInput): number {
  const tdee = calcBmr({ sex, age, h, w }) * act;
  const floor = KCAL_FLOOR[sex];
  return Math.round(Math.max(floor, tdee - pace) / 10) * 10;
}

/** True when the floor — not the chosen pace — is what set the target. */
export function isAtFloor(input: TargetInput): boolean {
  const tdee = calcBmr(input) * input.act;
  return tdee - input.pace < KCAL_FLOOR[input.sex];
}
