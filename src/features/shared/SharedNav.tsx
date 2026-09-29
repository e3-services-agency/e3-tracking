/**
 * Left navigation of the shared view (T-4-14): a sticky column with a filter box on wide screens,
 * a dropdown below 1024px. The item whose target is on screen is highlighted (`activeId`).
 */
import React, { useEffect, useRef } from 'react';
import { flattenNav, type NavItem } from './viewHelpers';

export function SharedNav({
  items,
  allItems,
  activeId,
  query,
  onQuery,
  onNavigate,
}: {
  items: NavItem[];
  allItems: NavItem[];
  activeId: string | null;
  query: string;
  onQuery: (q: string) => void;
  onNavigate: (id: string) => void;
}) {
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const renderItem = (item: NavItem, depth: number): React.ReactNode => (
    <li key={item.id}>
      <a
        href={`#${item.id}`}
        ref={item.id === activeId ? activeRef : undefined}
        onClick={(e) => {
          e.preventDefault();
          onNavigate(item.id);
        }}
        aria-current={item.id === activeId ? 'location' : undefined}
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
        className={`block truncate rounded py-1 pr-2 text-sm ${
          item.id === activeId
            ? 'bg-gray-100 font-semibold text-gray-900 border-l-2 border-[var(--color-info)]'
            : depth === 0
              ? 'font-medium text-gray-800 hover:bg-gray-50'
              : 'text-gray-600 hover:bg-gray-50'
        }`}
        title={item.label}
      >
        {item.label}
      </a>
      {item.children && <ul>{item.children.map((c) => renderItem(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <>
      <div className="lg:hidden mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor="shared-nav-select">
          Jump to
        </label>
        <select
          id="shared-nav-select"
          value={activeId ?? ''}
          onChange={(e) => e.target.value && onNavigate(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Select a section or event</option>
          {flattenNav(allItems).map((f) => (
            <option key={f.id} value={f.id}>
              {'\u00a0\u00a0'.repeat(f.depth)}
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <aside className="hidden lg:block w-64 shrink-0">
        <nav aria-label="Contents" className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Filter events and sections"
            aria-label="Filter navigation"
            className="w-full mb-2 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
          <ul>{items.map((i) => renderItem(i, 0))}</ul>
          {items.length === 0 && <p className="text-xs text-gray-400 px-2">No match.</p>}
        </nav>
      </aside>
    </>
  );
}
