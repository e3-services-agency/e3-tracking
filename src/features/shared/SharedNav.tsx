/**
 * Left navigation of the shared view (T-4-14): a sticky column with a filter box on wide screens,
 * a dropdown below 1024px. The item whose target is on screen is highlighted (`activeId`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { flattenNav, scrollTopToReveal, toggleInSet, type NavItem } from './viewHelpers';

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
  // Group rows (Events, Custom events, ...) start expanded; a filter shows matches regardless.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  // Scroll only the nav container itself, never the window (scrollIntoView would move both).
  useEffect(() => {
    const container = navRef.current;
    const link = activeRef.current;
    if (!container || !link) return;
    container.scrollTop = scrollTopToReveal(container.scrollTop, container.clientHeight, link.offsetTop, link.offsetHeight);
  }, [activeId]);

  const renderItem = (item: NavItem, depth: number): React.ReactNode => {
    const hasChildren = !!item.children && item.children.length > 0;
    const filtering = query.trim() !== '';
    const isOpen = filtering || !collapsed.has(item.id);
    return (
      <li key={item.id}>
        <div className="flex items-center" style={{ paddingLeft: `${depth * 0.75}rem` }}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setCollapsed((prev) => toggleInSet(prev, item.id))}
              aria-expanded={isOpen}
              disabled={filtering}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.label}`}
              className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="shrink-0 w-[18px]" aria-hidden="true" />
          )}
          {hasChildren && !filtering ? (
            // A group label toggles the group exactly like its chevron (T-4-18); a native button
            // gives Enter/Space for free. While filtering the group is pinned open, so the label
            // navigates instead.
            <button
              type="button"
              onClick={() => setCollapsed((prev) => toggleInSet(prev, item.id))}
              aria-expanded={isOpen}
              className="block min-w-0 flex-1 truncate rounded py-1 pl-1 pr-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
              title={item.label}
            >
              {item.label}
            </button>
          ) : (
            <a
              href={`#${item.id}`}
              ref={item.id === activeId ? activeRef : undefined}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(item.id);
              }}
              aria-current={item.id === activeId ? 'location' : undefined}
              className={`block min-w-0 flex-1 truncate rounded py-1 pl-1 pr-2 text-sm ${
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
          )}
        </div>
        {hasChildren && isOpen && <ul>{item.children!.map((c) => renderItem(c, depth + 1))}</ul>}
      </li>
    );
  };

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
      <aside className="hidden lg:block w-64 shrink-0 self-stretch">
        <nav ref={navRef} aria-label="Contents" className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
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
