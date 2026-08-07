import { describe, expect, it } from 'vitest';
import { starterPlan } from '@/content/starter-plan';
import { dataOf, parsePlanEvent, takeFrames } from './plan-stream';

const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

describe('takeFrames', () => {
  it('returns complete frames and keeps the partial one back', () => {
    // The whole point: chunk boundaries have nothing to do with frame
    // boundaries, and parsing half a frame invents a failure that never happened.
    const { frames, rest } = takeFrames('data: {"a":1}\n\ndata: {"b":2');
    expect(frames).toEqual(['data: {"a":1}']);
    expect(rest).toBe('data: {"b":2');
  });

  it('leaves nothing behind when the buffer ends on a boundary', () => {
    const { frames, rest } = takeFrames('data: {"a":1}\n\ndata: {"b":2}\n\n');
    expect(frames).toHaveLength(2);
    expect(rest).toBe('');
  });

  it('reassembles a frame split across chunks', () => {
    const chunks = ['data: {"type":"day"', ',"day":3,"state":"done"}\n\n'];
    let buffer = '';
    const seen: string[] = [];
    for (const chunk of chunks) {
      buffer += chunk;
      const { frames, rest } = takeFrames(buffer);
      buffer = rest;
      seen.push(...frames);
    }
    expect(seen).toHaveLength(1);
    expect(parsePlanEvent(dataOf(seen[0]!))).toEqual({ type: 'day', day: 3, state: 'done' });
  });
});

describe('dataOf', () => {
  it('joins a payload spread over several data lines', () => {
    expect(dataOf('data: {"type":\ndata: "error","error":"not_saved"}')).toBe(
      '{"type":"error","error":"not_saved"}',
    );
  });

  it('ignores comment and id lines', () => {
    expect(dataOf(': keep-alive\nid: 7\ndata: {"x":1}')).toBe('{"x":1}');
  });
});

describe('parsePlanEvent', () => {
  it('reads a day event', () => {
    expect(parsePlanEvent(dataOf(frame({ type: 'day', day: 0, state: 'run' })))).toEqual({
      type: 'day',
      day: 0,
      state: 'run',
    });
  });

  it('reads a plan event', () => {
    const plan = { ...starterPlan(1), planId: 'p1' };
    const event = parsePlanEvent(JSON.stringify({ type: 'plan', plan }));
    expect(event).toMatchObject({ type: 'plan' });
  });

  it('reads both failure events', () => {
    expect(parsePlanEvent('{"type":"error","error":"partial","failedDays":[5]}')).toEqual({
      type: 'error',
      error: 'partial',
      failedDays: [5],
    });
    expect(parsePlanEvent('{"type":"error","error":"not_saved"}')).toEqual({
      type: 'error',
      error: 'not_saved',
    });
  });

  it('ignores an event it does not understand instead of failing the run', () => {
    // A browser can hold a cached bundle for weeks, so an old client will meet a
    // new server. Skipping an unknown event beats aborting mid-generation.
    expect(parsePlanEvent('{"type":"warming-up"}')).toBeNull();
    expect(parsePlanEvent('not json at all')).toBeNull();
    expect(parsePlanEvent('null')).toBeNull();
  });

  it('rejects a day event with an out-of-range day', () => {
    expect(parsePlanEvent('{"type":"day","day":9,"state":"done"}')).toBeNull();
    expect(parsePlanEvent('{"type":"day","day":0,"state":"cooking"}')).toBeNull();
  });

  it('rejects a plan payload that is not a week', () => {
    // Better to report a failure than to hand a view six days and let it throw
    // while rendering.
    expect(
      parsePlanEvent('{"type":"plan","plan":{"v":1,"planId":"p","days":[],"groc":[]}}'),
    ).toBeNull();
    expect(parsePlanEvent('{"type":"plan","plan":{"v":2,"planId":"p"}}')).toBeNull();
  });
});
