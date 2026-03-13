import React from 'react';
import { Badge } from '@/src/components/ui/Badge';
import type { Property } from '@/src/types';
import type { ColumnDef } from '@tanstack/react-table';

type PropertyDiff = {
  newProps: Property[];
  modifiedProps: Property[];
} | null;

type GetPropertyTableColumnsParams = {
  customPropertyFields: any[];
  diff: PropertyDiff;
  onOpenProperty: (id: string) => void;
};

export function getPropertyTableColumns(
  params: GetPropertyTableColumnsParams,
): ColumnDef<Property>[] {
  const { customPropertyFields, diff, onOpenProperty } = params;

  const baseCols: ColumnDef<Property>[] = [
    {
      accessorKey: 'name',
      header: 'Property Name',
      cell: (info) => {
        const prop = info.row.original;
        const isNew = diff?.newProps.some((p) => p.id === prop.id);
        const isModified = diff?.modifiedProps.some((p) => p.id === prop.id);
        return (
          <div className="flex items-center gap-2">
            {isNew && (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
            {isModified && (
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            )}
            <span
              className="font-mono font-medium text-blue-600 cursor-pointer hover:underline"
              onClick={() => onOpenProperty(prop.id)}
            >
              {info.getValue() as string}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'property_value_type',
      header: 'Type',
      cell: (info) => {
        const prop = info.row.original;
        return (
          <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-md border">
            {prop.is_list
              ? `[${info.getValue() as string}]`
              : (info.getValue() as string)}
          </span>
        );
      },
    },
    {
      accessorKey: 'categories',
      header: 'Categories',
      cell: (info) => {
        const cats = info.getValue() as string[];
        return (
          <div className="flex gap-1 flex-wrap">
            {cats.map((c) => (
              <Badge key={c} variant="secondary">
                {c}
              </Badge>
            ))}
          </div>
        );
      },
      filterFn: 'arrIncludesSome',
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: (info) => (
        <span className="text-gray-500 truncate max-w-[200px] block">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      id: 'usedIn',
      header: 'Used In',
      cell: (info) => {
        const count = info.row.original.attached_events.length;
        return (
          <span className="text-gray-500">
            {count} event
            {count !== 1 ? 's' : ''}
          </span>
        );
      },
    },
  ];

  const customCols: ColumnDef<Property>[] = customPropertyFields.map((cf) => ({
    id: `custom_${cf.id}`,
    accessorFn: (row) => row.customFields?.[cf.id],
    header: cf.name,
    cell: (info) => {
      const val = info.getValue();
      if (cf.type === 'url' && val) {
        return (
          <a
            href={val as string}
            target="_blank"
            rel="noreferrer"
            className="text-blue-500 hover:underline"
          >
            Link
          </a>
        );
      }
      return <span>{val !== undefined ? String(val) : '-'}</span>;
    },
  }));

  return [...baseCols, ...customCols];
}

