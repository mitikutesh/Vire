import { useState } from 'react';
import { ExternalLink, RotateCcw } from 'lucide-react';
import type { GrocStateHandle } from '@/data/useVireData';
import { t } from '@/content/strings';
import { GROC_CATS, STORE_TAGS } from '@/domain/constants';
import type { StoreTag } from '@/domain/constants';
import { kLink, sLink } from '@/domain/links';
import type { Deal, GrocItem, OfferScan, StoredPlan } from '@/domain/schema';
import { AreaCard } from './AreaCard';
import { OffersCard } from './OffersCard';

/** What the Shop tab needs to render and drive the offer scan. */
export interface OffersProps {
  scan: OfferScan | null;
  loaded: boolean;
  scanning: boolean;
  failed: unknown;
  onScan: () => void;
}

/**
 * The Shop tab: the week's list, organised for a single trip.
 *
 * Two pieces of state, both scoped to the plan: what is in the basket, and which
 * chain each item is assigned to. The store tag is manual and cycles
 * – → S → K → Lidl → –, because there is no price API to decide it — S-Group has
 * none at all and Kesko's is closed to individuals (PLAN §12), so the per-item
 * links and the user's own judgement are the design, not a stopgap.
 */

const NEXT_TAG: Record<string, StoreTag | undefined> = {
  '': 'S',
  S: 'K',
  K: 'L',
  L: undefined,
};

type Filter = 'all' | StoreTag;

export function ShopView({
  plan,
  groc: grocHandle,
  city,
  onCityChange,
  savingCity = false,
  offers,
}: {
  plan: StoredPlan;
  groc: GrocStateHandle;
  city: string;
  /** Writes back to the profile — the offer scan reads the same field (E4.3). */
  onCityChange: (city: string) => void;
  savingCity?: boolean;
  offers: OffersProps;
}) {
  const { groc, update } = grocHandle;
  const [filter, setFilter] = useState<Filter>('all');

  const items = plan.groc;
  const checkedCount = items.filter((item) => groc.checked[item.id]).length;
  const countFor = (tag: StoreTag) => items.filter((item) => groc.store[item.id] === tag).length;

  const shown = filter === 'all' ? items : items.filter((item) => groc.store[item.id] === filter);

  const toggleChecked = (id: string) =>
    update((prev) => ({ ...prev, checked: { ...prev.checked, [id]: !prev.checked[id] } }));

  const cycleTag = (id: string) =>
    update((prev) => {
      const next = NEXT_TAG[prev.store[id] ?? ''];
      const store = { ...prev.store };
      // Deleted rather than set to undefined: the state is validated on the way
      // out, and an explicit undefined is not a store tag.
      if (next) store[id] = next;
      else delete store[id];
      return { ...prev, store };
    });

  // Only the ticks are cleared. Store assignments are the user's map of the trip
  // and survive emptying the basket.
  const resetChecked = () => update((prev) => ({ ...prev, checked: {} }));

  /**
   * One tap to send every discounted item to the chain it is cheapest at.
   *
   * It overwrites existing tags for those items on purpose: the user asked for the
   * discount store, and silently keeping an older manual choice would make the
   * button do nothing visible on exactly the items they had already thought about.
   */
  const applyDeals = (deals: readonly Deal[]) =>
    update((prev) => ({
      ...prev,
      store: { ...prev.store, ...Object.fromEntries(deals.map((d) => [d.id, d.store])) },
    }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-sub text-sm">{t.shop.subtitle}</p>
        <h1 className="disp text-ink font-extrabold" style={{ fontSize: 26 }}>
          {t.shop.title}
        </h1>
      </div>

      <AreaCard city={city} onCityChange={onCityChange} saving={savingCity} />

      <OffersCard
        offers={offers.scan}
        loaded={offers.loaded}
        items={items}
        scanning={offers.scanning}
        failed={offers.failed}
        onScan={offers.onScan}
        onApply={applyDeals}
      />

      <div className="border-line bg-card flex flex-col gap-2 rounded-2xl border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink text-sm font-semibold">
            {t.shop.basket(checkedCount, items.length)}
          </p>
          <button
            type="button"
            onClick={resetChecked}
            disabled={checkedCount === 0}
            className="text-lake flex items-center gap-1 text-sm font-medium disabled:opacity-40"
          >
            <RotateCcw size={13} aria-hidden="true" />
            {t.shop.reset}
          </button>
        </div>
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={checkedCount}
          aria-valuetext={t.shop.basket(checkedCount, items.length)}
          className="bg-paper block overflow-hidden rounded-full"
          style={{ height: 8 }}
        >
          <span
            className="bg-cloud block h-full rounded-full"
            style={{
              width: `${items.length === 0 ? 0 : Math.round((checkedCount / items.length) * 100)}%`,
              transition: 'width .2s',
            }}
          />
        </span>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t.shop.filterGroupAria}>
        <FilterChip
          label={t.shop.filterAll(items.length)}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {STORE_TAGS.map((tag) => (
          <FilterChip
            key={tag}
            label={t.shop.filterFor(tag, countFor(tag))}
            active={filter === tag}
            tag={tag}
            onClick={() => setFilter(tag)}
          />
        ))}
      </div>

      <p className="text-sub px-1 text-xs">{t.shop.tagHint}</p>

      {shown.length === 0 ? (
        // Only reachable through a filter: the plan always has a list.
        <p className="text-sub px-1 text-sm">{t.shop.filterEmpty}</p>
      ) : (
        GROC_CATS.map((cat) => {
          const inCat = shown.filter((item) => item.cat === cat);
          if (inCat.length === 0) return null;
          return (
            <div key={cat} className="flex flex-col gap-1">
              <p className="text-cloud px-1 text-xs font-bold tracking-wide uppercase">{cat}</p>
              <ul className="border-line bg-card overflow-hidden rounded-2xl border">
                {inCat.map((item, i) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    checked={Boolean(groc.checked[item.id])}
                    tag={groc.store[item.id]}
                    first={i === 0}
                    onToggle={() => toggleChecked(item.id)}
                    onCycleTag={() => cycleTag(item.id)}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

function FilterChip({
  label,
  active,
  tag,
  onClick,
}: {
  label: string;
  active: boolean;
  tag?: StoreTag;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full border px-3 py-1 text-xs font-semibold"
      style={{
        // The chains keep their own brand colours here: this is functional
        // identification, not app accent (CLAUDE.md design rules).
        borderColor: active ? chainColor(tag) : 'var(--color-line)',
        background: active ? chainSoft(tag) : 'var(--color-card)',
        color: active ? chainColor(tag) : 'var(--color-sub)',
      }}
    >
      {label}
    </button>
  );
}

const chainColor = (tag?: StoreTag) =>
  tag ? `var(--color-store-${tag.toLowerCase()})` : 'var(--color-ink)';
const chainSoft = (tag?: StoreTag) =>
  tag ? `var(--color-store-${tag.toLowerCase()}-soft)` : 'var(--color-paper)';

function ItemRow({
  item,
  checked,
  tag,
  first,
  onToggle,
  onCycleTag,
}: {
  item: GrocItem;
  checked: boolean;
  tag: StoreTag | undefined;
  first: boolean;
  onToggle: () => void;
  onCycleTag: () => void;
}) {
  return (
    <li
      className="flex items-center gap-3 px-3 py-3"
      style={first ? undefined : { borderTop: '1px solid var(--color-line)' }}
    >
      {/* Siblings, not nested: the prototype put the tag button inside the row's
          checkbox, which is invalid and unreachable by keyboard (I4). */}
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${checked ? t.shop.uncheckAria : t.shop.checkAria} ${item.n}`}
        onClick={onToggle}
        className="border-line flex shrink-0 items-center justify-center rounded-md border"
        style={{
          width: 22,
          height: 22,
          background: checked ? 'var(--color-cloud)' : 'var(--color-card)',
          borderColor: checked ? 'var(--color-cloud)' : 'var(--color-line)',
        }}
      >
        {checked ? (
          <span className="text-xs font-bold text-white" aria-hidden="true">
            ✓
          </span>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className="text-ink truncate text-sm font-medium"
          style={checked ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}
        >
          {item.n} <span className="text-sub font-normal">· {item.fi}</span>
        </p>
        <p className="text-sub text-xs">
          {item.q}
          {item.st ? t.shop.staple : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <a
          href={sLink(item.fi)}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={t.shop.priceAtS(item.n)}
          className="text-lake text-xs font-semibold"
        >
          S<ExternalLink size={9} className="inline" aria-hidden="true" />
        </a>
        <a
          href={kLink(item.fi)}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={t.shop.priceAtK(item.n)}
          className="text-lake text-xs font-semibold"
        >
          K<ExternalLink size={9} className="inline" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={onCycleTag}
          aria-label={t.shop.assignStoreAria(item.n, tag)}
          className="flex items-center justify-center rounded-full border text-xs font-bold"
          style={{
            width: 24,
            height: 24,
            borderColor: tag ? chainColor(tag) : 'var(--color-line)',
            background: tag ? chainSoft(tag) : 'transparent',
            color: tag ? chainColor(tag) : 'var(--color-sub)',
          }}
        >
          {/* "+" rather than a dash placeholder: it is what tapping does, and
              the untagged chip is the one that wants an invitation. */}
          {tag ?? '+'}
        </button>
      </div>
    </li>
  );
}
