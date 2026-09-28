/**
 * Shared empty-state row for list pages (T-4-09): one sentence describing what's missing, plus the
 * button that leads to the next action. Rendered as a single table cell so it drops into any table
 * body with a `colSpan`.
 */
import React from 'react';
import { Button } from './Button';

export function EmptyState({
  colSpan,
  message,
  actionLabel,
  onAction,
}: {
  colSpan: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-10 text-center">
        <p className="text-sm text-gray-500 mb-3">{message}</p>
        {actionLabel && onAction && (
          <Button onClick={onAction} className="mx-auto">
            {actionLabel}
          </Button>
        )}
      </td>
    </tr>
  );
}
