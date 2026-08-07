import { CalendarDays, Clock, ShoppingBasket, Sun } from 'lucide-react';
import { t } from '@/content/strings';
import { C } from '@/design/tokens';

export const TABS = ['now', 'today', 'week', 'shop'] as const;
export type Tab = (typeof TABS)[number];

const TAB_META = {
  now: { label: t.nav.now, Icon: Clock },
  today: { label: t.nav.today, Icon: Sun },
  week: { label: t.nav.week, Icon: CalendarDays },
  shop: { label: t.nav.shop, Icon: ShoppingBasket },
} as const;

/**
 * Fixed bottom navigation — four destinations, thumb-reachable, no hamburger.
 * The active tab is the only cloudberry element, which is what makes "where am
 * I" readable at a glance.
 */
export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav
      className="border-line fixed bottom-0 left-0 right-0 border-t"
      style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)' }}
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map((id) => {
          const { label, Icon } = TAB_META[id];
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center gap-1 py-3"
            >
              <Icon size={20} aria-hidden="true" style={{ color: active ? C.cloud : C.sub }} />
              <span className="text-xs font-semibold" style={{ color: active ? C.cloud : C.sub }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
