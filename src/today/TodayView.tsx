import { Flame } from 'lucide-react';
import type { DailyLogHandle } from '@/data/useVireData';
import { EX, SLOTS } from '@/content/plan';
import { DAY_NAMES, t } from '@/content/strings';
import { weekdayIdx } from '@/domain/clock';
import { burnedKcal, eatenKcal, remainingKcal, waterGoalGlasses } from '@/domain/log';
import type { Profile, SlotKey, StoredPlan, Swap } from '@/domain/schema';
import { MealCard } from '@/ui/MealCard';
import { ExtrasCard } from './ExtrasCard';
import { MovementCard } from './MovementCard';
import { WaterCard } from './WaterCard';

/**
 * The Today tab: the whole day, editable.
 *
 * Where Now answers "what next", this is the ledger — five meals, movement,
 * water, and anything eaten on top. The summary bar is the only number that
 * matters at a glance, and it is the one place burned calories visibly come back
 * off the intake.
 */
export function TodayView({
  profile,
  plan,
  log: logHandle,
  now,
}: {
  profile: Profile;
  plan: StoredPlan;
  log: DailyLogHandle;
  now: Date;
}) {
  const { log, update } = logHandle;
  const wd = weekdayIdx(now);
  const day = plan.days[wd];

  const eaten = eatenKcal(log, day);
  const burned = burnedKcal(log, wd);
  const remaining = remainingKcal(log, day, wd, profile.target);
  const over = remaining < 0;

  const setSlot = (slot: SlotKey, value: boolean | Swap) =>
    update((prev) => ({ ...prev, m: { ...prev.m, [slot]: value } }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-sub text-sm">
          {DAY_NAMES[wd]} {now.getDate()}.{now.getMonth() + 1}.
        </p>
        <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26 }}>
          {t.today.title}
        </h1>
      </div>

      <div className="bg-ink flex items-center justify-between gap-3 rounded-2xl p-4">
        <div className="min-w-0">
          <p className="text-xs" style={{ color: '#B9C6BF' }}>
            {t.today.eatenBurned(eaten, burned)}
          </p>
          <p className="disp font-bold text-white" style={{ fontSize: 20 }}>
            {over ? t.today.over(Math.abs(remaining)) : t.today.remaining(remaining)}
          </p>
        </div>
        <Flame
          size={22}
          className="shrink-0"
          aria-hidden="true"
          // Berry-tinted when over budget. The number beside it already says so;
          // this is reinforcement, not the signal.
          style={{ color: over ? '#E8A9AC' : 'var(--color-cloud)' }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {SLOTS.map((slot) => (
          <MealCard
            key={slot}
            slot={slot}
            meal={day[slot]}
            entry={log.m[slot]}
            onToggle={() => setSlot(slot, !log.m[slot])}
            onLogSwap={(swap) => setSlot(slot, swap)}
            onClearSwap={() => setSlot(slot, false)}
          />
        ))}
      </div>

      <MovementCard
        exercise={EX[wd]}
        done={log.ex}
        extra={log.exx}
        onToggleDone={() => update((prev) => ({ ...prev, ex: !prev.ex }))}
        onAdd={(entry) =>
          update((prev) => ({ ...prev, exx: [...prev.exx, { n: entry.n, k: entry.k }] }))
        }
        onRemove={(index) =>
          update((prev) => ({ ...prev, exx: prev.exx.filter((_, i) => i !== index) }))
        }
      />

      <WaterCard
        glasses={log.water}
        goal={waterGoalGlasses(profile.waterMl)}
        onChange={(glasses) => update((prev) => ({ ...prev, water: glasses }))}
      />

      <ExtrasCard
        extras={log.extra}
        onAdd={(entry) => update((prev) => ({ ...prev, extra: [...prev.extra, entry] }))}
        onRemove={(index) =>
          update((prev) => ({ ...prev, extra: prev.extra.filter((_, i) => i !== index) }))
        }
      />

      {/* Health guardrail 4: the numbers are estimates, and say so. */}
      <p className="text-sub px-1 text-xs">{t.today.disclaimer}</p>
    </section>
  );
}
