import { describe, expect, it } from 'vitest';
import { PREP } from '@/content/plan';
import { starterPlan } from '@/content/starter-plan';
import type { DayPlan, Meal, PrepStage } from './schema';
import {
  dateKeyInZone,
  eveningDigest,
  headStarts,
  hourInZone,
  instantAt,
  isAwake,
  placeStage,
  roundTo5,
  serveHour,
} from './prep';

const ZONE = 'Europe/Helsinki';
const BUFFER = PREP.defaultBufferMin;

const stage = (over: Partial<PrepStage> = {}): PrepStage => ({
  lead: 480,
  active: 5,
  do: 'Soak the chickpeas',
  ...over,
});

/**
 * A wall-clock instant *in Helsinki*, whatever zone the test runner uses.
 *
 * `new Date('2026-08-10T12:00:00')` parses as the runner's local time, so these
 * tests passed on a Helsinki laptop and failed in CI under UTC — the same
 * device-local assumption the module itself had. Building instants through the
 * zone is what makes the suite mean the same thing everywhere.
 */
const at = (iso: string): Date => {
  const [date, time] = iso.split('T');
  const [year, month, day] = date!.split('-').map(Number);
  const [hh, mm] = time!.split(':').map(Number);
  return instantAt({ year: year!, month: month!, day: day! }, hh! + mm! / 60, ZONE);
};

/** The wall-clock hour in Helsinki, which is what every assertion here means. */
const hourOf = (d: Date): number => hourInZone(d, ZONE);

describe('serving times', () => {
  it('reads them from the DayStrip, so there is only one such table', () => {
    // A second table would drift from the signature timeline the user looks at.
    expect(serveHour('b')).toBe(7.5);
    expect(serveHour('l')).toBe(12);
    expect(serveHour('d')).toBe(18.2);
  });

  it('rounds a computed time to something a person would write', () => {
    // Dinner sits at 18.2 because that is where the dot looks right on the
    // chart; unrounded arithmetic yields 17:12, which reads like a machine.
    expect(hourOf(roundTo5(at('2026-08-10T17:12:00')))).toBeCloseTo(17 + 10 / 60, 5);
    expect(hourOf(roundTo5(at('2026-08-10T17:13:00')))).toBeCloseTo(17 + 15 / 60, 5);
  });
});

describe('the waking window', () => {
  it('is narrower than the greeting boundary, which is the whole point', () => {
    // 05:12 clears a quietUntil=5 check and rings while the cook is asleep —
    // the exact case this feature exists to prevent.
    expect(isAwake(at('2026-08-10T05:12:00'), ZONE)).toBe(false);
    expect(isAwake(at('2026-08-10T07:00:00'), ZONE)).toBe(true);
    expect(isAwake(at('2026-08-10T21:30:00'), ZONE)).toBe(true);
    expect(isAwake(at('2026-08-10T22:00:00'), ZONE)).toBe(false);
  });

  it('reads the hour in the user’s zone, not the server’s', () => {
    // 03:00 UTC in August is 06:00 in Helsinki: asleep there, awake in UTC.
    const instant = new Date('2026-08-10T03:00:00Z');
    expect(hourInZone(instant, 'Europe/Helsinki')).toBe(6);
    expect(hourInZone(instant, 'UTC')).toBe(3);
  });
});

describe('placing a stage', () => {
  it('spends the buffer as slack when the window has room for it', () => {
    // Lunch 12:00, 2 h lead, 4 h of elastic room, 1 h buffer → start at 09:00
    // rather than 10:00, which is the "an hour or two to adjust" the owner asked
    // for.
    const serve = at('2026-08-10T12:00:00');
    const result = placeStage(
      stage({ lead: 120, leadMax: 240 }),
      serve,
      at('2026-08-10T06:00:00'),
      ZONE,
      BUFFER,
    );
    expect(result.kind).toBe('placed');
    if (result.kind !== 'placed') return;
    expect(hourOf(result.at)).toBe(9);
    expect(result.tonight).toBe(false);
  });

  it('refuses to spend a buffer a rigid stage does not have', () => {
    // No leadMax means the stage is safe only at `lead`. Starting an hour early
    // for the user's convenience would be the app inventing food-safety room.
    const serve = at('2026-08-10T12:00:00');
    const result = placeStage(stage({ lead: 120 }), serve, at('2026-08-10T06:00:00'), ZONE, BUFFER);
    expect(result.kind).toBe('placed');
    if (result.kind !== 'placed') return;
    expect(hourOf(result.at)).toBe(10);
  });

  it('moves the owner’s 8-hour lunch to the evening before, not to 03:00', () => {
    // The case that prompted the feature: 12:00 − 8 h − 1 h = 03:00.
    const serve = at('2026-08-10T12:00:00');
    const result = placeStage(
      stage({ lead: 480, leadMax: 960 }),
      serve,
      at('2026-08-09T08:00:00'),
      ZONE,
      BUFFER,
    );
    expect(result.kind).toBe('placed');
    if (result.kind !== 'placed') return;
    expect(result.tonight).toBe(true);
    expect(dateKeyInZone(result.at, ZONE)).toBe('2026-08-09');
    expect(isAwake(result.at, ZONE)).toBe(true);
  });

  it('never places a stage outside its own window', () => {
    // The defect that killed the first design: the fallback moved a long lead
    // LATER than ideal, silently shortening a brine. A placement must always
    // sit between serve-leadMax and serve-lead.
    const serve = at('2026-08-12T12:00:00');
    const s = stage({ lead: 1440, leadMax: 1440 }); // 24 h brine, rigid length
    const result = placeStage(s, serve, at('2026-08-10T00:00:00'), ZONE, BUFFER);
    if (result.kind === 'placed') {
      const earliest = serve.getTime() - 1440 * 60_000;
      const latest = serve.getTime() - 1440 * 60_000 + BUFFER * 60_000;
      expect(result.at.getTime()).toBeGreaterThanOrEqual(earliest - 5 * 60_000);
      expect(result.at.getTime()).toBeLessThanOrEqual(latest + 5 * 60_000);
    } else {
      // A 24 h window pinned to noon-the-day-before may have no waking instant;
      // reporting that is correct. What must never happen is a silent move.
      expect(result.kind).toBe('unschedulable');
    }
  });

  it('reports a rigid night-only stage instead of firing it', () => {
    // Rigid (no leadMax) with an ideal start at 02:00: there is no valid time,
    // and the honest answer is to say so while the user is still picking meals.
    const serve = at('2026-08-10T12:00:00');
    const result = placeStage(stage({ lead: 540 }), serve, at('2026-08-09T08:00:00'), ZONE, BUFFER);
    expect(result.kind).toBe('unschedulable');
  });

  it('reports a window that has already closed, so the card can offer a swap', () => {
    const serve = at('2026-08-10T12:00:00');
    const result = placeStage(
      stage({ lead: 120 }),
      serve,
      at('2026-08-10T11:00:00'), // ideal was 09:00, an hour ago
      ZONE,
      BUFFER,
    );
    expect(result.kind).toBe('passed');
  });

  it('lets an elastic stage reach back to a waking hour', () => {
    // leadMax is what separates "start this tonight instead" from "start this
    // in the middle of the night" — a boolean could not have said how far back.
    const serve = at('2026-08-10T12:00:00');
    const rigid = placeStage(stage({ lead: 600 }), serve, at('2026-08-09T08:00:00'), ZONE, BUFFER);
    const elastic = placeStage(
      stage({ lead: 600, leadMax: 1080 }),
      serve,
      at('2026-08-09T08:00:00'),
      ZONE,
      BUFFER,
    );
    expect(rigid.kind).toBe('unschedulable');
    expect(elastic.kind).toBe('placed');
  });
});

describe('breakfast, which is the hard case', () => {
  it('pushes nearly any lead to the evening before', () => {
    // Serving at 07:30 means even a 2 h lead computes to 04:30. Breakfast prep
    // is structurally "tonight or nothing", which only the digest handles well.
    const serve = at('2026-08-10T07:30:00');
    const result = placeStage(
      stage({ lead: 120, leadMax: 720 }),
      serve,
      at('2026-08-09T08:00:00'),
      ZONE,
      BUFFER,
    );
    expect(result.kind).toBe('placed');
    if (result.kind !== 'placed') return;
    expect(result.tonight).toBe(true);
  });
});

describe('daylight saving in Europe/Helsinki', () => {
  // The two days a year when naive "serve minus N hours" arithmetic is wrong.
  it('survives the spring forward, when 03:30 does not exist', () => {
    const serve = at('2026-03-29T12:00:00');
    const result = placeStage(
      stage({ lead: 480, leadMax: 960 }),
      serve,
      at('2026-03-28T08:00:00'),
      ZONE,
      BUFFER,
    );
    expect(result.kind).toBe('placed');
    if (result.kind !== 'placed') return;
    expect(isAwake(result.at, ZONE)).toBe(true);
  });

  it('survives the autumn back, when 03:30 happens twice', () => {
    const serve = at('2026-10-25T12:00:00');
    const result = placeStage(
      stage({ lead: 480, leadMax: 960 }),
      serve,
      at('2026-10-24T08:00:00'),
      ZONE,
      BUFFER,
    );
    expect(result.kind).toBe('placed');
    if (result.kind !== 'placed') return;
    expect(isAwake(result.at, ZONE)).toBe(true);
  });
});

describe('the week’s head starts', () => {
  const withPrep = (day: DayPlan, prep: PrepStage[]): DayPlan => ({
    ...day,
    l: { ...day.l, prep } as Meal,
  });

  it('is empty for a plan that needs no head start', () => {
    // The starter week is everyday cooking; nothing in it soaks overnight.
    const plan = starterPlan(1600);
    expect(headStarts(plan.days, at('2026-08-10T09:00:00'), ZONE, BUFFER)).toEqual([]);
  });

  it('finds tomorrow’s lunch and puts it in tonight’s digest', () => {
    const plan = starterPlan(1600);
    // Monday 2026-08-10; tomorrow is Tuesday, weekday index 1.
    const days = plan.days.map((day, i) =>
      i === 1 ? withPrep(day, [stage({ lead: 480, leadMax: 960 })]) : day,
    ) as unknown as DayPlan[];

    const now = at('2026-08-10T18:00:00');
    const digest = eveningDigest(days, now, ZONE, BUFFER);
    expect(digest).toHaveLength(1);
    expect(digest[0]?.slot).toBe('l');
    expect(digest[0]?.tonight).toBe(true);
    expect(isAwake(digest[0]!.start, ZONE)).toBe(true);
  });

  it('consolidates two meals into one list rather than two interruptions', () => {
    const plan = starterPlan(1600);
    const days = plan.days.map((day, i) =>
      i === 1
        ? {
            ...day,
            l: { ...day.l, prep: [stage({ lead: 480, leadMax: 960 })] },
            d: { ...day.d, prep: [stage({ lead: 900, leadMax: 1200, do: 'Thaw the fish' })] },
          }
        : day,
    ) as unknown as DayPlan[];

    const digest = eveningDigest(days, at('2026-08-10T18:00:00'), ZONE, BUFFER);
    expect(digest.length).toBeGreaterThanOrEqual(1);
    // One list, ordered by when to start.
    const times = digest.map((item) => item.start.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('instantAt', () => {
  it('turns a fractional DayStrip hour into a wall-clock time in the zone', () => {
    const result = instantAt({ year: 2026, month: 8, day: 10 }, 18.2, ZONE);
    expect(hourOf(result)).toBeCloseTo(18 + 12 / 60, 5);
  });

  it('reads the same wall clock from a different runtime zone', () => {
    // The property CI actually needed: the answer depends on the user's zone,
    // never on the server's.
    const helsinki = instantAt({ year: 2026, month: 8, day: 10 }, 12, 'Europe/Helsinki');
    expect(hourInZone(helsinki, 'Europe/Helsinki')).toBe(12);
    expect(hourInZone(helsinki, 'UTC')).toBe(9);
  });
});
