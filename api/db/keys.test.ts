// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { userIdFromClaims } from '../auth/identity';
import { SK, assertDateKey, dateFromLogKey, dateFromWeightKey, pk } from './keys';

const userId = userIdFromClaims({ sub: 'abc-123' });

/**
 * The in-memory store and the DynamoDB store share these builders, so testing
 * them directly is what makes the in-memory isolation tests meaningful for the
 * real table too.
 */
describe('key layout', () => {
  it('puts everything a user owns in one partition', () => {
    expect(pk(userId)).toBe('USER#abc-123');
  });

  it('keeps exactly one active plan per user', () => {
    // A constant sort key is the constraint: writing a plan replaces the plan.
    expect(SK.activePlan).toBe('PLAN#ACTIVE');
  });

  it('scopes grocery state and offers to a plan', () => {
    // Plan-scoping is what stops last week's checked boxes and offer badges
    // attaching themselves to this week's food.
    expect(SK.grocState('plan-1')).toBe('GROCSTATE#plan-1');
    expect(SK.offers('plan-1')).toBe('OFFERS#plan-1');
    expect(SK.offers('plan-1')).not.toBe(SK.offers('plan-2'));
  });

  it('keys logs and weigh-ins by date so key order is date order', () => {
    expect(SK.log('2026-08-07')).toBe('LOG#2026-08-07');
    expect(SK.weight('2026-08-07')).toBe('WEIGHT#2026-08-07');
    // ISO dates sort lexicographically, which is why a range query can return
    // the last seven days without any client-side sorting.
    expect(SK.log('2026-08-07') > SK.log('2026-07-31')).toBe(true);
  });

  it('separates rate-limit counters by action and day', () => {
    expect(SK.rateLimit('generate', '2026-08-07')).toBe('RL#generate#2026-08-07');
    expect(SK.rateLimit('offer_scan', '2026-08-07')).not.toBe(
      SK.rateLimit('generate', '2026-08-07'),
    );
  });

  it('reads the date back out of a sort key', () => {
    expect(dateFromLogKey('LOG#2026-08-07')).toBe('2026-08-07');
    expect(dateFromWeightKey('WEIGHT#2026-08-07')).toBe('2026-08-07');
    // Wrong kind of key: no date to report.
    expect(dateFromLogKey('WEIGHT#2026-08-07')).toBeNull();
    expect(dateFromWeightKey('PROFILE')).toBeNull();
  });
});

describe('assertDateKey', () => {
  it('accepts an ISO calendar date', () => {
    expect(assertDateKey('2026-08-07')).toBe('2026-08-07');
  });

  it('rejects anything that is not one', () => {
    // The log date comes from the client (it is the device's local day), so it
    // is validated before it becomes part of a key.
    for (const bad of ['07-08-2026', '2026-8-7', '2026-08-07T12:00', 'LOG#2026-08-07', '']) {
      expect(() => assertDateKey(bad), bad).toThrow(/date key/i);
    }
  });
});
