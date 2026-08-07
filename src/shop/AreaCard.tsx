import { ExternalLink, MapPin } from 'lucide-react';
import { CITIES } from '@/content/plan';
import { t } from '@/content/strings';
import type { StoreTag } from '@/domain/constants';
import { CHAIN_DEALS, CHAIN_STORES, mapsLink } from '@/domain/links';
import { SelectField } from '@/ui/Field';

/**
 * Where to shop, and this week's public offer pages.
 *
 * The city lives on the profile because the AI offer scan needs it too (E4.3), so
 * changing it here writes back rather than keeping a second copy — two places to
 * say where you live is two places to disagree.
 *
 * The chain deals links are the authority the offer scan defers to: guardrail 5
 * says the scan is best-effort, and these are what "verify" means in practice.
 */

const DEALS_LABEL: Record<StoreTag, string> = {
  S: t.shop.dealsS,
  K: t.shop.dealsK,
  L: t.shop.dealsL,
};

export function AreaCard({
  city,
  onCityChange,
  saving = false,
}: {
  city: string;
  onCityChange: (city: string) => void;
  /** True while the profile write is in flight; the select stays put meanwhile. */
  saving?: boolean;
}) {
  return (
    <section className="border-line bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <SelectField
        label={t.shop.areaLabel}
        value={city}
        options={CITIES.map((name) => ({ value: name as string, label: name }))}
        onChange={onCityChange}
        disabled={saving}
      />

      <ul className="flex flex-wrap gap-2">
        {CHAIN_STORES.map((store) => (
          <li key={store.name}>
            <a
              href={mapsLink(store.name, city)}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold"
              // The chains keep their own brand colours: functional
              // identification, not app accent (CLAUDE.md design rules).
              style={{
                borderColor: `var(--color-store-${store.tag.toLowerCase()})`,
                color: `var(--color-store-${store.tag.toLowerCase()})`,
                background: `var(--color-store-${store.tag.toLowerCase()}-soft)`,
              }}
            >
              <MapPin size={11} aria-hidden="true" />
              {t.shop.nearCity(store.name, city)}
            </a>
          </li>
        ))}
      </ul>

      <ul className="flex flex-col gap-1">
        {(Object.keys(CHAIN_DEALS) as StoreTag[]).map((tag) => (
          <li key={tag}>
            <a
              href={CHAIN_DEALS[tag]}
              target="_blank"
              rel="noreferrer noopener"
              className="text-lake flex items-center gap-1 text-sm font-medium"
            >
              {DEALS_LABEL[tag]}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
