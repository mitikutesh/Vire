import { DAY_STRIP } from '@/content/plan';
import { SLOT_LABEL } from '@/content/strings';
import { C } from '@/design/tokens';
import { stripPct } from '@/domain/clock';
import { isEaten } from '@/domain/log';
import type { DailyLog, SlotKey } from '@/domain/schema';

interface DayStripProps {
  /** Current time as fractional hours. */
  nowHour: number;
  log: DailyLog;
}

/**
 * The signature element: the whole day as one 05–23 h line.
 *
 * Ink dots are meals, the cloudberry dot is movement, the cloudberry line is
 * time already spent, and the pulsing marker is now. It answers "where am I in
 * the day, and what have I missed" without a single number.
 *
 * Entirely decorative — every fact it shows is also in the cards below, so it
 * is hidden from assistive tech rather than read out as a row of dots.
 */
export function DayStrip({ nowHour, log }: DayStripProps) {
  return (
    <div className="px-1 pt-1 pb-4" aria-hidden="true">
      <div className="relative" style={{ height: 26 }}>
        {/* the full day */}
        <div
          className="absolute left-0 right-0"
          style={{ top: 11, height: 2, background: C.line, borderRadius: 2 }}
        />
        {/* time already spent */}
        <div
          className="absolute left-0"
          style={{
            top: 11,
            height: 2,
            width: `${stripPct(nowHour)}%`,
            background: C.cloud,
            borderRadius: 2,
            transition: 'width .5s',
          }}
        />

        {DAY_STRIP.dots.map((dot) => {
          const isMovement = dot.slot === 'ex';
          const done = isMovement ? log.ex : isEaten(log.m[dot.slot as SlotKey]);
          const accent = isMovement ? C.cloud : C.ink;

          return (
            <div
              key={dot.slot}
              className="absolute flex flex-col items-center"
              style={{ left: `${stripPct(dot.at)}%`, top: 5, transform: 'translateX(-50%)' }}
            >
              <span
                className="rounded-full"
                style={{
                  width: 13,
                  height: 13,
                  background: done ? accent : C.card,
                  border: `2px solid ${accent}`,
                }}
              />
              <span style={{ fontSize: 8, color: C.sub, marginTop: 2, fontWeight: 600 }}>
                {isMovement ? 'move' : SLOT_LABEL[dot.slot as SlotKey].label[0]}
              </span>
            </div>
          );
        })}

        {/* now */}
        <div
          className="absolute"
          style={{ left: `${stripPct(nowHour)}%`, top: 0, transform: 'translateX(-50%)' }}
        >
          <span
            className="pulse block rounded-full"
            style={{
              width: 9,
              height: 9,
              background: C.cloud,
              border: '2px solid #fff',
              boxShadow: `0 0 0 2px ${C.cloud}`,
            }}
          />
        </div>
      </div>

      <div className="flex justify-between" style={{ fontSize: 9, color: C.sub }}>
        {DAY_STRIP.ticks.map((tick) => (
          <span key={tick}>{String(tick).padStart(2, '0')}</span>
        ))}
      </div>
    </div>
  );
}
