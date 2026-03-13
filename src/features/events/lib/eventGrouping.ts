import { Row } from '@tanstack/react-table';
import { Event } from '@/src/types';
import { EventRow } from '@/src/features/events/types';

type GroupRowsByCategoryParams = {
  rows: Row<EventRow>[];
  events: Event[];
  showEmptyCategories: boolean;
  /** Extra category names to show as empty groups (e.g. from "New Category"). */
  customCategories?: string[];
};

export function groupRowsByCategory({
  rows,
  events,
  showEmptyCategories,
  customCategories = [],
}: GroupRowsByCategoryParams): Record<string, Row<EventRow>[]> {
  const groups: Record<string, Row<EventRow>[]> = {};

  if (showEmptyCategories) {
    const allCategories = new Set<string>();

    events.forEach((event) => {
      event.categories.forEach((category) => {
        allCategories.add(category);
      });
    });
    customCategories.forEach((c) => allCategories.add(c));

    allCategories.forEach((category) => {
      groups[category] = [];
    });
  }

  rows.forEach((row) => {
    const categories =
      row.original.categories.length > 0
        ? row.original.categories
        : ['Uncategorized'];

    categories.forEach((category) => {
      if (!groups[category]) {
        groups[category] = [];
      }

      const alreadyInGroup = groups[category].some(
        (existingRow) => existingRow.id === row.id,
      );

      if (!alreadyInGroup) {
        groups[category].push(row);
      }
    });
  });

  const sortedEntries = Object.entries(groups).sort(([a], [b]) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });

  return Object.fromEntries(sortedEntries);
}

