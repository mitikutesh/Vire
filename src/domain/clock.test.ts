import { describe, expect, it } from 'vitest';
import { t } from '@/content/strings';
import {
  NIGHT,
  addDays,
  dateKey,
  getSlotKey,
  greetingFor,
  hourOf,
  nextWeekday,
  stripPct,
  weekdayIdx,
} from './clock';

describe('dateKey', () => {
  it('formats the local date, zero-padded', () => {
    expect(dateKey(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05');
    expect(dateKey(new Date(2026, 10, 30, 12, 0))).toBe('2026-11-30');
  });

  it('keeps a late-evening meal on the day the user lived it', () => {
    // 23:30 local. A UTC-based key would file this under the next day in
    // Helsinki winter, moving the meal off the day it was eaten.
    expect(dateKey(new Date(2026, 1, 3, 23, 30))).toBe('2026-02-03');
  });
});

describe('weekdayIdx', () => {
  it('starts the week on Monday', () => {
    // 2026-08-03 is a Monday.
    expect(weekdayIdx(new Date(2026, 7, 3))).toBe(0);
    expect(weekdayIdx(new Date(2026, 7, 8))).toBe(5); // Saturday
    expect(weekdayIdx(new Date(2026, 7, 9))).toBe(6); // Sunday
  });
});

describe('hourOf', () => {
  it('returns fractional hours', () => {
    expect(hourOf(new Date(2026, 7, 3, 13, 30))).toBe(13.5);
    expect(hourOf(new Date(2026, 7, 3, 0, 0))).toBe(0);
  });
});

describe('getSlotKey', () => {
  it('closes the kitchen before 05:00 and from 23:00', () => {
    expect(getSlotKey(0)).toBe(NIGHT);
    expect(getSlotKey(4.99)).toBe(NIGHT);
    expect(getSlotKey(23)).toBe(NIGHT);
    expect(getSlotKey(23.5)).toBe(NIGHT);
  });

  it('maps each part of the day to its meal', () => {
    expect(getSlotKey(5)).toBe('b');
    expect(getSlotKey(8)).toBe('b');
    expect(getSlotKey(12)).toBe('l');
    expect(getSlotKey(15)).toBe('s');
    expect(getSlotKey(18)).toBe('d');
    expect(getSlotKey(21)).toBe('e');
  });

  it('switches exactly on each boundary', () => {
    // The Now tab is only useful if these are right — an off-by-a-hair here
    // shows the user the wrong meal.
    expect(getSlotKey(10.49)).toBe('b');
    expect(getSlotKey(10.5)).toBe('l');
    expect(getSlotKey(13.99)).toBe('l');
    expect(getSlotKey(14)).toBe('s');
    expect(getSlotKey(16.49)).toBe('s');
    expect(getSlotKey(16.5)).toBe('d');
    expect(getSlotKey(19.99)).toBe('d');
    expect(getSlotKey(20)).toBe('e');
    expect(getSlotKey(22.99)).toBe('e');
  });
});

describe('greetingFor', () => {
  it('greets by time of day', () => {
    expect(greetingFor(3)).toBe(t.now.greeting.quiet);
    expect(greetingFor(8)).toBe(t.now.greeting.morning);
    expect(greetingFor(13)).toBe(t.now.greeting.day);
    expect(greetingFor(17)).toBe(t.now.greeting.afternoon);
    expect(greetingFor(21)).toBe(t.now.greeting.evening);
  });
});

describe('stripPct', () => {
  it('spans 0–100% across the 05–23 h scale', () => {
    expect(stripPct(5)).toBe(0);
    expect(stripPct(23)).toBe(100);
    expect(stripPct(14)).toBeCloseTo(50, 5);
  });

  it('clamps outside the scale so the marker stays on the strip', () => {
    expect(stripPct(2)).toBe(0);
    expect(stripPct(23.9)).toBe(100);
  });
});

describe('nextWeekday', () => {
  it('wraps Sunday round to Monday for the night card', () => {
    expect(nextWeekday(0)).toBe(1);
    expect(nextWeekday(6)).toBe(0);
  });
});

describe('addDays', () => {
  it('moves across month and year boundaries', () => {
    expect(dateKey(addDays(new Date(2026, 0, 31, 9, 0), 1))).toBe('2026-02-01');
    expect(dateKey(addDays(new Date(2026, 11, 31, 9, 0), 1))).toBe('2027-01-01');
    expect(dateKey(addDays(new Date(2026, 0, 1, 9, 0), -1))).toBe('2025-12-31');
  });
});
