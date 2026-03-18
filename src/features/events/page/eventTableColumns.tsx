import React from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Event, Team, Property, PropertyBundle, Source, TrackingStatus } from '@/src/types';
import { EventRow } from '@/src/features/events/types';
import { getSourceColor } from '@/src/features/events/lib/sourcePresentation';

type GetEventTableColumnsParams = {
  teams: Team[];
  properties: Property[];
  propertyBundles: PropertyBundle[];
  updateEvent: (id: string, event: Partial<Event>) => void;
};

export function getEventTableColumns({
  teams,
  properties,
  propertyBundles,
  updateEvent,
}: GetEventTableColumnsParams): ColumnDef<EventRow>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const isVariant = row.original.label === 'Variant';
        return (
          <div className="flex flex-col py-1 group">
            {isVariant ? (
              <div className="pl-6 relative">
                <div className="absolute left-2 top-2 border-l-2 border-b-2 border-gray-300 w-3 h-3 rounded-bl"></div>
                <span className="text-[11px] text-gray-500 font-medium leading-none">
                  {row.original.baseEventName} -
                </span>
                <div className="text-sm font-bold text-gray-900 leading-tight mt-0.5 group-hover:text-[var(--color-info)]">
                  {row.original.name}
                </div>
              </div>
            ) : (
              <span className="text-sm font-semibold text-gray-900 leading-tight group-hover:text-[var(--color-info)]">
                {row.original.name}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'label',
      header: 'Event Label',
      cell: ({ row }) => (
        <span
          className={`text-[11px] px-3 py-1 rounded-full border font-medium ${
            row.original.label === 'Base'
              ? 'bg-white text-gray-600 border-gray-200'
              : 'bg-purple-50 text-purple-700 border-purple-200'
          }`}
        >
          {row.original.label}
        </span>
      ),
    },
    {
      id: 'trackingStatus',
      header: 'Status',
      cell: ({ row }) => {
        const event = row.original.originalEvent;
        const isVariant = row.original.label === 'Variant';
        const variantId = row.original.variantId;

        const status: TrackingStatus = isVariant && variantId
          ? (event.variants?.find((v) => v.id === variantId)?.trackingStatus ?? 'Draft')
          : (event.customFields?.trackingStatus || 'Draft');

        const colors: Record<TrackingStatus, string> = {
          Draft: 'bg-gray-100 text-gray-600',
          Ready: 'bg-blue-100 text-blue-700',
          Implementing: 'bg-yellow-100 text-yellow-700',
          Implemented: 'bg-emerald-100 text-emerald-700',
        };

        const handleChange = (value: string) => {
          if (isVariant && variantId) {
            updateEvent(event.id, {
              variants: (event.variants ?? []).map((v) =>
                v.id === variantId ? { ...v, trackingStatus: value as TrackingStatus } : v,
              ),
            });
          } else {
            updateEvent(event.id, {
              customFields: {
                ...event.customFields,
                trackingStatus: value,
              },
            });
          }
        };

        return (
          <select
            value={status}
            onChange={(e) => handleChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className={`text-[11px] font-bold px-2 py-1 rounded-full border-none focus:ring-0 cursor-pointer ${
              colors[status] || colors.Draft
            }`}
          >
            <option value="Draft">Draft</option>
            <option value="Ready">Ready</option>
            <option value="Implementing">Implementing</option>
            <option value="Implemented">Implemented</option>
          </select>
        );
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 whitespace-normal break-words block min-w-[200px]">
          {row.original.description || '-'}
        </span>
      ),
    },
    {
      accessorKey: 'ownerTeamId',
      header: 'Owners',
      cell: ({ row }) => {
        const team = teams.find((t) => t.id === row.original.ownerTeamId);
        return team ? (
          <span className="text-xs text-gray-700">{team.name}</span>
        ) : (
          <span className="text-xs text-gray-400 italic">-</span>
        );
      },
    },
    {
      accessorKey: 'stakeholderTeamIds',
      header: 'Stakeholders',
      cell: ({ row }) => {
        const names = row.original.stakeholderTeamIds
          .map((id) => teams.find((t) => t.id === id)?.name)
          .filter(Boolean) as string[];

        if (!names.length) {
          return (
            <span className="text-xs text-gray-400 italic">-</span>
          );
        }

        return (
          <span className="text-xs text-gray-600 truncate max-w-[150px] block">
            {names.length}: {names.join(', ')}
          </span>
        );
      },
    },
    {
      accessorKey: 'categories',
      header: 'Category',
      cell: ({ row }) => (
        <div className="text-xs text-gray-600">
          {row.original.categories.join(', ') || '-'}
        </div>
      ),
      filterFn: 'arrIncludesSome',
    },
    {
      id: 'propertyBundles',
      header: 'Property Bundles',
      cell: ({ row }) => {
        const propIds = new Set(
          row.original.actions.flatMap((a) => [
            ...a.eventProperties,
            ...a.systemProperties,
          ]),
        );

        const bundles = propertyBundles.filter(
          (b) =>
            b.propertyIds.every((id) => propIds.has(id)) &&
            b.propertyIds.length > 0,
        );

        if (!bundles.length) {
          return (
            <span className="text-xs text-gray-400 italic">-</span>
          );
        }

        return (
          <span className="text-xs text-gray-600 truncate max-w-[150px] block">
            {bundles.map((b) => b.name).join(', ')}
          </span>
        );
      },
    },
    {
      id: 'eventProperties',
      header: 'Event Properties',
      cell: ({ row }) => {
        const propIds = Array.from(
          new Set(
            row.original.actions.flatMap((a) => a.eventProperties),
          ),
        );

        if (!propIds.length) {
          return (
            <span className="text-xs text-orange-500 font-medium">
              No event properties
            </span>
          );
        }

        const names = propIds
          .map((id) => properties.find((p) => p.id === id)?.name)
          .filter(Boolean) as string[];

        return (
          <span className="text-xs text-gray-600 truncate max-w-[200px] block">
            {names.length}: {names.join(', ')}
          </span>
        );
      },
    },
    {
      id: 'groupProperties',
      header: 'Group Properties',
      cell: () => (
        <span className="text-xs text-gray-400 italic">-</span>
      ),
    },
    {
      accessorKey: 'sources',
      header: 'Sources',
      cell: ({ row }) => {
        if (!row.original.sources.length) {
          return (
            <span className="text-xs text-gray-400 italic">-</span>
          );
        }

        return (
          <div className="flex flex-wrap gap-1 items-center text-xs text-gray-600">
            <span className="font-medium mr-1">
              {row.original.sources.length}:
            </span>
            {row.original.sources.map((s) => (
              <span
                key={s.id}
                className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded-full border"
              >
                <span
                  className={`w-[14px] h-[14px] rounded-full ${getSourceColor(
                    s.name,
                  )} text-white flex items-center justify-center text-[8px] font-bold`}
                >
                  P
                </span>
                {s.name}
              </span>
            ))}
          </div>
        );
      },
      filterFn: (row, columnId, filterValue) => {
        const sources = row.getValue(columnId) as Source[];
        return sources.some((s) => filterValue.includes(s.id));
      },
    },
    {
      accessorKey: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const actionTypes = Array.from(
          new Set(row.original.actions.map((a) => a.type)),
        );

        if (!actionTypes.length) {
          return (
            <span className="text-xs text-gray-400 italic">-</span>
          );
        }

        const formatted = actionTypes.map((t) =>
          t === 'Log Event'
            ? 'Logs event'
            : t === 'Log Page View'
            ? 'Logs page view'
            : t,
        );

        return (
          <span className="text-xs text-gray-600">
            {formatted.join(', ')}
          </span>
        );
      },
    },
    {
      accessorKey: 'tags',
      header: 'Tags',
      cell: ({ row }) => (
        <span className="text-xs text-gray-600 truncate max-w-[120px] block">
          {row.original.tags.join(', ') || '-'}
        </span>
      ),
    },
    {
      id: 'destinations',
      header: 'Destinations',
      cell: () => (
        <span className="text-xs text-gray-400 italic">-</span>
      ),
    },
    {
      id: 'metrics',
      header: 'Metrics',
      cell: () => (
        <span className="text-xs text-gray-400 italic">-</span>
      ),
    },
  ];
}

