'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Values must match the backend vocabulary in `services/api.ts` → MarketFilters.sort
export type SortOption = 'date_asc' | 'date_desc' | 'pool_desc';

const WEIGHT_CLASSES = [
  '',
  'Heavyweight',
  'Light Heavyweight',
  'Super Middleweight',
  'Middleweight',
  'Super Welterweight',
  'Welterweight',
  'Super Lightweight',
  'Lightweight',
  'Super Featherweight',
  'Featherweight',
  'Super Bantamweight',
  'Bantamweight',
  'Super Flyweight',
  'Flyweight',
  'Minimumweight',
] as const;

const CATEGORIES = [
  '',
  'Championship',
  'Undercard',
  'Exhibition',
  'Main Event',
] as const;

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Locked', value: 'locked' },
  { label: 'Resolved', value: 'resolved' },
] as const;

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'date_desc' },
  { label: 'Ending Soon', value: 'date_asc' },
  { label: 'Biggest Pool', value: 'pool_desc' },
];

export interface MarketFilterValues {
  status: string;
  search: string;
  sort: SortOption;
  weightClass: string;
  category?: string;
}

interface MarketFiltersProps {
  onChange?: (values: MarketFilterValues) => void;
}

export function MarketFilters({ onChange }: Readonly<MarketFiltersProps>): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state directly from URL search parameters (#926)
  const [activeStatus, setActiveStatus] = useState<string>(
    () => searchParams?.get('status') ?? ''
  );
  const [activeWeightClass, setActiveWeightClass] = useState<string>(
    () => searchParams?.get('weight_class') ?? searchParams?.get('weightClass') ?? ''
  );
  const [activeCategory, setActiveCategory] = useState<string>(
    () => searchParams?.get('category') ?? ''
  );
  const [activeSort, setActiveSort] = useState<SortOption>(
    () => (searchParams?.get('sort') as SortOption) || 'date_desc'
  );
  const [searchInput, setSearchInput] = useState<string>(
    () => searchParams?.get('search') ?? ''
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTabsRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState<string>('');

  // Sync state reactively when searchParams change (browser back/forward navigation)
  useEffect(() => {
    if (!searchParams) return;
    setActiveStatus(searchParams.get('status') ?? '');
    setActiveWeightClass(searchParams.get('weight_class') ?? searchParams.get('weightClass') ?? '');
    setActiveCategory(searchParams.get('category') ?? '');
    setActiveSort((searchParams.get('sort') as SortOption) || 'date_desc');
    setSearchInput(searchParams.get('search') ?? '');
  }, [searchParams]);

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam({ search: value || null });
    }, 300);
  };

  // Announce filter changes to assistive technology via aria-live region
  useEffect(() => {
    const parts: string[] = [];
    if (activeStatus) parts.push(`status ${activeStatus}`);
    if (activeWeightClass) parts.push(`weight class ${activeWeightClass}`);
    if (activeCategory) parts.push(`category ${activeCategory}`);
    if (searchInput) parts.push(`search "${searchInput}"`);
    parts.push(`sorted by ${SORT_OPTIONS.find((o) => o.value === activeSort)?.label ?? activeSort}`);
    setAnnouncement(`Filters updated: ${parts.join(', ')}`);
  }, [activeStatus, activeWeightClass, activeCategory, searchInput, activeSort]);

  useEffect(() => {
    onChange?.({
      status: activeStatus,
      search: searchInput,
      sort: activeSort,
      weightClass: activeWeightClass,
      category: activeCategory,
    });
  }, [activeStatus, searchInput, activeSort, activeWeightClass, activeCategory, onChange]);

  const handleStatusKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      statusTabsRef.current?.querySelectorAll('[role="tab"]') ?? []
    ) as HTMLElement[];
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const direction = e.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
      tabs[nextIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      tabs[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      tabs[tabs.length - 1]?.focus();
    }
  };

  return (
    <fieldset className="flex flex-wrap gap-3 items-center border-0 p-0 m-0">
      <legend className="sr-only">Market filters</legend>

      {/* Live region announcing filter changes to screen readers */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Weight class dropdown */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="market-filter-weight-class"
          className="text-xs font-medium text-gray-300"
        >
          Weight class
        </label>
        <select
          id="market-filter-weight-class"
          value={activeWeightClass}
          onChange={(e) => {
            setActiveWeightClass(e.target.value);
            setParam({ weight_class: e.target.value || null });
          }}
          className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <option value="">All Weight Classes</option>
          {WEIGHT_CLASSES.filter(Boolean).map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      {/* Category dropdown */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="market-filter-category"
          className="text-xs font-medium text-gray-300"
        >
          Category
        </label>
        <select
          id="market-filter-category"
          value={activeCategory}
          onChange={(e) => {
            setActiveCategory(e.target.value);
            setParam({ category: e.target.value || null });
          }}
          className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <option value="">All Categories</option>
          {CATEGORIES.filter(Boolean).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Status tabs */}
      <div className="flex flex-col gap-1">
        <span id="market-filter-status-label" className="text-xs font-medium text-gray-300">
          Status
        </span>
        <div
          ref={statusTabsRef}
          role="tablist"
          aria-labelledby="market-filter-status-label"
          className="flex rounded-lg overflow-hidden border border-gray-700"
          onKeyDown={handleStatusKeyDown}
        >
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeStatus === tab.value}
              tabIndex={activeStatus === tab.value ? 0 : -1}
              onClick={() => {
                setActiveStatus(tab.value);
                setParam({ status: tab.value || null });
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-inset ${
                activeStatus === tab.value
                  ? 'bg-amber-500 text-black font-semibold'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fighter name search */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="market-filter-search"
          className="text-xs font-medium text-gray-300"
        >
          Search fighters
        </label>
        <input
          id="market-filter-search"
          type="search"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search fighters…"
          className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 placeholder-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 w-48"
        />
      </div>

      {/* Sort dropdown */}
      <div className="flex flex-col gap-1 ml-auto">
        <label
          htmlFor="market-filter-sort"
          className="text-xs font-medium text-gray-300"
        >
          Sort by
        </label>
        <select
          id="market-filter-sort"
          value={activeSort}
          onChange={(e) => {
            setActiveSort(e.target.value as SortOption);
            setParam({ sort: e.target.value });
          }}
          className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}