import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { t } from '@/content/strings';
import { C } from '@/design/tokens';
import { BottomNav, type Tab } from './BottomNav';

interface AppShellProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onOpenSettings: () => void;
  /** Hidden while the first-run profile or the plan gate owns the screen. */
  showNav?: boolean;
  children: ReactNode;
}

/**
 * The frame: a single centred column capped at max-w-md with a fixed bottom
 * nav. Mobile-first is not a breakpoint here, it is the whole layout — the app
 * is used standing in a kitchen or a shop aisle.
 *
 * The brand is the plain cloudberry wordmark: no filled logo circle, per the
 * locked design rules.
 */
export function AppShell({
  tab,
  onTabChange,
  onOpenSettings,
  showNav = true,
  children,
}: AppShellProps) {
  return (
    <div className="bg-paper min-h-screen">
      <div className="mx-auto max-w-md px-4 pt-5 pb-28">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="disp text-cloud font-extrabold" style={{ fontSize: 21 }}>
              {t.app.wordmark}
            </span>
            <span className="text-sub text-xs">{t.app.tagline}</span>
          </div>
          <button
            type="button"
            aria-label={t.app.settingsAria}
            onClick={onOpenSettings}
            className="border-line bg-card rounded-full border p-2"
          >
            <Settings size={17} aria-hidden="true" style={{ color: C.ink }} />
          </button>
        </header>

        <main>{children}</main>
      </div>

      {showNav ? <BottomNav tab={tab} onChange={onTabChange} /> : null}
    </div>
  );
}
