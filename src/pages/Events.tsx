import React, { useState, useMemo, useEffect } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Event, Source, EventAction, EventVariant } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { 
  Search, Plus, Trash2, AlertCircle, GitMerge, CheckCircle2, 
  X, Columns, Code, MessageSquare, Filter
} from 'lucide-react';
import { toSnakeCase, toPascalCase } from '@/src/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  ColumnFiltersState,
  VisibilityState,
} from '@tanstack/react-table';

// Unified row type for Base Events and Variants
type EventRow = {
  id: string;
  name: string;
  label: 'Base' | 'Variant';
  baseEventName?: string; // Used for formatting variant display
  description: string;
  categories: string[];
  sources: Source[];
  ownerTeamId?: string;
  stakeholderTeamIds: string[];
  actions: EventAction[];
  tags: string[];
  originalEvent: Event;
  variantId?: string;
};

// Helper for source icon colors
const getSourceColor = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('ios')) return 'bg-amber-400';
  if (lower.includes('android')) return 'bg-emerald-500';
  return 'bg-gray-400';
};

export function Events() {
  const data = useActiveData();
  const { activeBranchId, branches, mergeBranch, approveBranch, selectedItemIdToEdit, setSelectedItemIdToEdit } = useStore();
  
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<'Category' | 'List'>('Category');

  useEffect(() => {
    if (selectedItemIdToEdit) {
      const event = data.events.find(e => e.id === selectedItemIdToEdit);
      if (event) {
        setSelectedEventId(event.id);
        setSelectedVariantId(undefined);
        setIsCreating(false);
        setIsSheetOpen(true);
        setSelectedItemIdToEdit(null);
      }
    }
  }, [selectedItemIdToEdit, data.events, setSelectedItemIdToEdit]);

  const handleOpenEvent = (eventId: string, variantId?: string) => {
    setSelectedEventId(eventId);
    setSelectedVariantId(variantId);
    setIsCreating(false);
    setIsSheetOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedEventId(null);
    setSelectedVariantId(undefined);
    setIsCreating(true);
    setIsSheetOpen(true);
  };

  const selectedEvent = selectedEventId ? data.events.find(e => e.id === selectedEventId) : null;
  const activeBranch = branches.find(b => b.id === activeBranchId);

  // Diff logic for workbench summary
  const diff = useMemo(() => {
    if (activeBranchId === 'main' || !activeBranch) return null;
    const baseEvents = activeBranch.baseData.events;
    const draftEvents = activeBranch.draftData.events;
    
    const newEvents = draftEvents.filter(de => !baseEvents.find(be => be.id === de.id));
    const modifiedEvents = draftEvents.filter(de => {
      const base = baseEvents.find(be => be.id === de.id);
      if (!base) return false;
      return JSON.stringify(base) !== JSON.stringify(de);
    });
    
    return { newEvents, modifiedEvents };
  }, [activeBranchId, activeBranch]);

  const canMerge = activeBranch && activeBranch.approvals.length > 0;

  // Flatten events and variants into a single ordered list
  const flatTableData = useMemo<EventRow[]>(() => {
    const rows: EventRow[] = [];
    data.events.forEach(event => {
      // 1. Base Event
      rows.push({
        id: event.id,
        name: event.name,
        label: 'Base',
        description: event.description,
        categories: event.categories,
        sources: event.sources,
        ownerTeamId: event.ownerTeamId,
        stakeholderTeamIds: event.stakeholderTeamIds,
        actions: event.actions,
        tags: event.tags,
        originalEvent: event,
      });

      // 2. Variants
      event.variants.forEach(variant => {
        rows.push({
          id: `${event.id}-${variant.id}`,
          name: variant.name,
          label: 'Variant',
          baseEventName: event.name,
          description: variant.description || event.description,
          categories: event.categories,
          sources: event.sources, 
          ownerTeamId: event.ownerTeamId,
          stakeholderTeamIds: event.stakeholderTeamIds,
          actions: event.actions,
          tags: event.tags,
          originalEvent: event,
          variantId: variant.id,
        });
      });
    });
    return rows;
  }, [data.events]);

  const columns = useMemo<ColumnDef<EventRow>[]>(() => {
    const baseCols: ColumnDef<EventRow>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const isVariant = row.original.label === 'Variant';
          return (
            <div 
              className="flex flex-col cursor-pointer hover:bg-gray-50 -my-2 py-2" 
              onClick={() => handleOpenEvent(row.original.originalEvent.id, row.original.variantId)}
            >
              {isVariant ? (
                <>
                  <span className="text-[11px] text-gray-500 font-medium leading-none">{row.original.baseEventName} -</span>
                  <span className="text-sm font-bold text-gray-900 leading-tight mt-0.5">{row.original.name}</span>
                </>
              ) : (
                <span className="text-sm font-semibold text-gray-900 leading-tight">{row.original.name}</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'label',
        header: 'Event Label',
        cell: ({ row }) => (
          <span className={`text-[11px] px-3 py-1 rounded-full border font-medium ${row.original.label === 'Base' ? 'bg-white text-gray-600 border-gray-200' : 'bg-white text-gray-600 border-gray-200'}`}>
            {row.original.label}
          </span>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => <span className="text-xs text-gray-500 truncate max-w-[250px] block">{row.original.description || '-'}</span>,
      },
      {
        accessorKey: 'ownerTeamId',
        header: 'Owners',
        cell: ({ row }) => {
          const team = data.teams.find(t => t.id === row.original.ownerTeamId);
          return team ? <span className="text-xs text-gray-700">{team.name}</span> : <span className="text-xs text-gray-400 italic">-</span>;
        },
      },
      {
        accessorKey: 'stakeholderTeamIds',
        header: 'Stakeholders',
        cell: ({ row }) => {
          const names = row.original.stakeholderTeamIds.map(id => data.teams.find(t => t.id === id)?.name).filter(Boolean);
          if (!names.length) return <span className="text-xs text-gray-400 italic">-</span>;
          return <span className="text-xs text-gray-600 truncate max-w-[150px] block">{names.length}: {names.join(', ')}</span>;
        },
      },
      {
        accessorKey: 'categories',
        header: 'Category',
        cell: ({ row }) => <div className="text-xs text-gray-600">{row.original.categories.join(', ') || '-'}</div>,
        filterFn: 'arrIncludesSome',
      },
      {
        id: 'propertyBundles',
        header: 'Property Bundles',
        cell: ({ row }) => {
          const propIds = new Set(row.original.actions.flatMap(a => [...a.eventProperties, ...a.systemProperties]));
          const bundles = data.propertyBundles.filter(b => b.propertyIds.every(id => propIds.has(id)) && b.propertyIds.length > 0);
          if (!bundles.length) return <span className="text-xs text-gray-400 italic">-</span>;
          return <span className="text-xs text-gray-600 truncate max-w-[150px] block">{bundles.map(b => b.name).join(', ')}</span>;
        },
      },
      {
        id: 'eventProperties',
        header: 'Event Properties',
        cell: ({ row }) => {
          const propIds = Array.from(new Set(row.original.actions.flatMap(a => a.eventProperties)));
          if (!propIds.length) return <span className="text-xs text-orange-500 font-medium">No event properties</span>;
          const names = propIds.map(id => data.properties.find(p => p.id === id)?.name).filter(Boolean);
          return <span className="text-xs text-gray-600 truncate max-w-[200px] block">{names.length}: {names.join(', ')}</span>;
        },
      },
      {
        id: 'groupProperties',
        header: 'Group Properties',
        cell: () => <span className="text-xs text-gray-400 italic">-</span>,
      },
      {
        accessorKey: 'sources',
        header: 'Sources',
        cell: ({ row }) => {
          if (!row.original.sources.length) return <span className="text-xs text-gray-400 italic">-</span>;
          return (
            <div className="flex flex-wrap gap-1 items-center text-xs text-gray-600">
              <span className="font-medium mr-1">{row.original.sources.length}:</span>
              {row.original.sources.map(s => (
                <span key={s.id} className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded-full border">
                  <span className={`w-[14px] h-[14px] rounded-full ${getSourceColor(s.name)} text-white flex items-center justify-center text-[8px] font-bold`}>P</span>
                  {s.name}
                </span>
              ))}
            </div>
          );
        },
        filterFn: (row, columnId, filterValue) => {
          const sources = row.getValue(columnId) as Source[];
          return sources.some(s => filterValue.includes(s.id));
        }
      },
      {
        accessorKey: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const actionTypes = Array.from(new Set(row.original.actions.map(a => a.type)));
          if (!actionTypes.length) return <span className="text-xs text-gray-400 italic">-</span>;
          return <span className="text-xs text-gray-600">{actionTypes.map(t => t === 'Log Event' ? 'Logs event' : t === 'Log Page View' ? 'Logs page view' : t).join(', ')}</span>;
        },
      },
      {
        accessorKey: 'tags',
        header: 'Tags',
        cell: ({ row }) => <span className="text-xs text-gray-600 truncate max-w-[120px] block">{row.original.tags.join(', ') || '-'}</span>,
      }
    ];

    return baseCols;
  }, [data.teams, data.properties, data.propertyBundles]);

  const table = useReactTable({
    data: flatTableData,
    columns,
    state: {
      globalFilter,
      columnFilters,
      columnVisibility,
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Group the visible rows by category for rendering
  const groupedRows = useMemo(() => {
    const groups: Record<string, typeof table.getRowModel().rows> = {};
    table.getRowModel().rows.forEach(row => {
      const cat = row.original.categories[0] || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(row);
    });
    
    // Sort so Uncategorized is at the bottom, others alphabetically
    return Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => {
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        return a.localeCompare(b);
      })
    );
  }, [table.getRowModel().rows]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F9FAFB]">
      
      {/* Top Header matching Avo UI */}
      <div className="px-6 py-4 border-b bg-white flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Events <span className="text-gray-400 font-normal text-lg">({data.events.length})</span></h1>
            <Button onClick={handleCreateNew} className="h-8 gap-2 bg-[#F11578] hover:bg-[#D10F65] text-white border-none shadow-sm rounded-md px-3">
              <Plus className="w-4 h-4" /> New Event
            </Button>
            <Button variant="outline" className="h-8 gap-2 bg-white text-gray-600 border-gray-200 shadow-sm rounded-md px-3">
              <Plus className="w-4 h-4" /> New Category
            </Button>

            <div className="flex bg-gray-100 p-0.5 rounded-md ml-4 border border-gray-200 shadow-inner">
              <button 
                onClick={() => setViewMode('Category')}
                className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'Category' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Category
              </button>
              <button 
                onClick={() => setViewMode('List')}
                className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'List' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                List
              </button>
            </div>

            <Button variant="ghost" className="h-8 gap-2 text-gray-500 hover:text-gray-700 px-3">
              <Columns className="w-4 h-4" /> Customize
            </Button>
            <Button variant="ghost" className="h-8 gap-2 text-gray-500 hover:text-gray-700 px-3">
              <Filter className="w-4 h-4" /> Filter
            </Button>
          </div>
          
          <div className="flex gap-3">
            {activeBranchId !== 'main' && (
              <Button 
                variant={canMerge ? "default" : "secondary"}
                onClick={() => canMerge && mergeBranch(activeBranchId)}
                disabled={!canMerge}
                className="h-8 gap-2"
              >
                <GitMerge className="w-4 h-4" /> Merge Branch
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative">
        {diff && (diff.newEvents.length > 0 || diff.modifiedEvents.length > 0) && (
          <div className="m-6 mb-2 p-4 bg-white border rounded-lg shadow-sm shrink-0">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-[#3E52FF]" /> Workbench Summary
            </h3>
            <div className="flex gap-4">
              {diff.newEvents.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                  {diff.newEvents.length} New
                </div>
              )}
              {diff.modifiedEvents.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full bg-purple-400"></span>
                  {diff.modifiedEvents.length} Modified
                </div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Review changes before merging.
              </div>
              {activeBranch && activeBranch.approvals.length === 0 && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => approveBranch(activeBranchId, 't1')}
                  className="gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Approve Changes
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="bg-white flex-1 overflow-auto">
          <table className="w-full text-left border-collapse min-w-max">
            <thead className="bg-white sticky top-0 z-10 shadow-sm border-b">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="px-4 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            
            <tbody className="bg-white">
              {viewMode === 'Category' ? (
                Object.entries(groupedRows).map(([category, rows]) => (
                  <React.Fragment key={category}>
                    {/* Category Group Header */}
                    <tr className="bg-[#F8F9F9] border-y border-gray-200">
                      <td colSpan={columns.length} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <input type="checkbox" className="mt-1 rounded border-gray-300 w-4 h-4" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Category</span>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="font-bold text-gray-700 text-[15px] leading-tight">{category}</span>
                              <span className="bg-[#BFC4D0] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">{rows.length} events</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Category Rows */}
                    {rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap align-middle">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors border-b border-gray-100">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                    No events found. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title={isCreating ? "Create Event" : selectedVariantId ? `Event Variant` : "Event"}
      >
        {isSheetOpen && (
          <AvoEventEditor
            event={selectedEvent}
            variantId={selectedVariantId}
            isCreating={isCreating}
            onClose={() => setIsSheetOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}

/**
 * Refined Editor mimicking the full Avo.app right-sidebar specification
 */
function AvoEventEditor({ event, variantId, isCreating, onClose }: { event: Event | null | undefined, variantId?: string, isCreating: boolean, onClose: () => void }) {
  const data = useActiveData();
  const { addEvent, updateEvent, deleteEvent, auditConfig } = useStore();
  
  const [name, setName] = useState(event?.name || '');
  const [description, setDescription] = useState(event?.description || '');
  const [ownerTeamId, setOwnerTeamId] = useState<string>(event?.ownerTeamId || data.teams[0]?.id || '');
  const [stakeholderTeamIds, setStakeholderTeamIds] = useState<string[]>(event?.stakeholderTeamIds || []);
  const [categories, setCategories] = useState<string[]>(event?.categories || []);
  const [tags, setTags] = useState<string[]>(event?.tags || []);
  const [sources, setSources] = useState<Source[]>(event?.sources || []);
  const [actions, setActions] = useState<EventAction[]>(event?.actions || [{ id: uuidv4(), type: 'Log Event', eventProperties: [], systemProperties: [], pinnedProperties: {} }]);
  const [variants, setVariants] = useState<EventVariant[]>(event?.variants || []);
  const [customFields, setCustomFields] = useState<Record<string, any>>(event?.customFields || {});

  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');

  let suggestedName = null;
  if (name.trim().length > 0) {
    if (auditConfig.eventNaming === 'snake_case') suggestedName = toSnakeCase(name);
    else if (auditConfig.eventNaming === 'Title Case') suggestedName = toPascalCase(name).replace(/([A-Z])/g, ' $1').trim();
    else if (auditConfig.eventNaming === 'camelCase') suggestedName = toPascalCase(name).replace(/^./, str => str.toLowerCase());
    else if (auditConfig.eventNaming === 'PascalCase') suggestedName = toPascalCase(name);
    else if (auditConfig.eventNaming === 'Sentence case') {
      const spaced = name.replace(/[-_]+/g, ' ').trim();
      suggestedName = spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
    }
  }
  
  if (suggestedName === name) suggestedName = null;

  const addCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory('');
    }
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    
    let finalName = name;
    if (auditConfig.eventNaming === 'snake_case') finalName = toSnakeCase(name);
    else if (auditConfig.eventNaming === 'Title Case') finalName = toPascalCase(name).replace(/([A-Z])/g, ' $1').trim();
    else if (auditConfig.eventNaming === 'camelCase') finalName = toPascalCase(name).replace(/^./, str => str.toLowerCase());
    else if (auditConfig.eventNaming === 'PascalCase') finalName = toPascalCase(name);
    else if (auditConfig.eventNaming === 'Sentence case') {
      const spaced = name.replace(/[-_]+/g, ' ').trim();
      finalName = spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
    }

    const eventData = { 
      name: finalName, description, categories, tags, sources, actions, variants,
      ownerTeamId, stakeholderTeamIds, customFields
    };

    if (isCreating) addEvent(eventData as Event);
    else if (event) updateEvent(event.id, eventData);
    
    onClose();
  };

  const activeVariant = variants.find(v => v.id === variantId);

  // Pseudo Codegen Builder
  const generateCodegen = () => {
    const fnName = toPascalCase(name).replace(/^./, str => str.toLowerCase());
    const variantSuffix = activeVariant ? toPascalCase(activeVariant.name) : '';
    const props = Array.from(new Set(actions.flatMap(a => [...a.eventProperties, ...a.systemProperties])));
    
    return `// Javascript (Codegen)
Avo.${fnName}${variantSuffix}({
${props.map(pid => {
  const p = data.properties.find(prop => prop.id === pid);
  if (!p) return '';
  const camelProp = toPascalCase(p.name).replace(/^./, s => s.toLowerCase());
  return `  ${camelProp}: ${camelProp}, // ${p.property_value_type}`;
}).filter(Boolean).join('\n')}
});`;
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="px-6 pt-4 pb-2">
        {variantId ? (
          <div className="text-xs text-gray-500 mb-1">Variation of <span className="text-[#3E52FF] font-semibold cursor-pointer">{name}</span></div>
        ) : null}
        <Input 
          value={variantId ? activeVariant?.name : name}
          onChange={e => variantId 
            ? setVariants(variants.map(v => v.id === variantId ? { ...v, name: e.target.value } : v))
            : setName(e.target.value)
          }
          className="text-2xl font-bold border-none px-0 shadow-none focus-visible:ring-0 text-gray-900 h-auto"
          placeholder="Event Name"
        />
        {suggestedName && name.trim().length > 0 && !variantId && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2 mt-2 rounded-md border border-gray-200">
            <AlertCircle className="w-4 h-4" />
            <span>Format:</span>
            <button onClick={() => setName(suggestedName!)} className="text-xs font-mono bg-white border px-1.5 py-0.5 rounded hover:bg-gray-100">
              {suggestedName}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-8">
        
        {/* Stakeholders & Ownership */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Stakeholders & Ownership</h3>
          </div>
          <div className="flex flex-col gap-3">
            <select
              value={ownerTeamId}
              onChange={(e) => setOwnerTeamId(e.target.value)}
              className="text-xs border rounded px-2 py-1.5 bg-white text-gray-700 max-w-[200px]"
            >
              {data.teams.map(t => <option key={t.id} value={t.id}>{t.name} (Owner)</option>)}
            </select>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stakeholder Teams</label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-gray-50 min-h-[42px]">
                {data.teams.map(t => (
                  <label key={t.id} className="flex items-center gap-1 text-xs bg-white px-2 py-1 rounded border cursor-pointer hover:bg-gray-100">
                    <input
                      type="checkbox"
                      checked={stakeholderTeamIds.includes(t.id)}
                      onChange={(e) => {
                        if (e.target.checked) setStakeholderTeamIds([...stakeholderTeamIds, t.id]);
                        else setStakeholderTeamIds(stakeholderTeamIds.filter(id => id !== t.id));
                      }}
                      className="rounded border-gray-300 text-[#3E52FF]"
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Description</h3>
          <textarea
            value={variantId ? activeVariant?.description || '' : description}
            onChange={(e) => variantId 
              ? setVariants(variants.map(v => v.id === variantId ? { ...v, description: e.target.value } : v))
              : setDescription(e.target.value)
            }
            className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded p-3 min-h-[80px] resize-none focus:bg-white focus:ring-1 focus:ring-[#3E52FF] outline-none"
            placeholder="Add description..."
          />
        </div>

        {/* Custom Fields, Categories, Tags (Base Only) */}
        {!variantId && (
          <div className="grid grid-cols-1 gap-6">
            {data.settings.customEventFields.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Custom Fields</h3>
                <div className="grid grid-cols-2 gap-4">
                  {data.settings.customEventFields.map(cf => (
                    <div key={cf.id}>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{cf.name}</label>
                      {cf.type === 'boolean' ? (
                        <select
                          value={customFields[cf.id] !== undefined ? String(customFields[cf.id]) : ''}
                          onChange={e => setCustomFields({ ...customFields, [cf.id]: e.target.value === 'true' })}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
                        >
                          <option value="">Select...</option>
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      ) : (
                        <Input
                          type={cf.type === 'number' ? 'number' : 'text'}
                          value={customFields[cf.id] || ''}
                          onChange={e => setCustomFields({ ...customFields, [cf.id]: cf.type === 'number' ? Number(e.target.value) : e.target.value })}
                          placeholder={cf.type === 'url' ? 'https://...' : ''}
                          className="h-8 text-xs"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-900">Categories</label>
              <div className="flex gap-2">
                <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} placeholder="Add category..." className="h-8 text-xs" />
                <Button type="button" onClick={addCategory} variant="outline" className="h-8 text-xs">Add</Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {categories.map(cat => (
                  <span key={cat} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md border border-blue-200">
                    {cat}
                    <button onClick={() => setCategories(categories.filter(c => c !== cat))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-900">Tags</label>
              <div className="flex gap-2">
                <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} placeholder="Add tag..." className="h-8 text-xs" />
                <Button type="button" onClick={addTag} variant="outline" className="h-8 text-xs">Add</Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md border border-gray-200">
                    {tag}
                    <button onClick={() => setTags(tags.filter(t => t !== tag))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Variants Section (Only show on Base Event) */}
        {!variantId && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Variants</h3>
              <button 
                className="text-xs font-semibold text-[#3E52FF] hover:underline"
                onClick={() => setVariants([...variants, { id: uuidv4(), name: 'New Variant', propertyOverrides: {} }])}
              >
                + New Variant
              </button>
            </div>
            {variants.length > 0 ? (
              <div className="border rounded-md divide-y bg-white">
                {variants.map(v => (
                  <div key={v.id} className="p-3 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="text-sm font-bold text-gray-900">{v.name}</div>
                      <div className="text-xs text-[#3E52FF] mt-0.5">{Object.keys(v.propertyOverrides).length} Overrides</div>
                    </div>
                    <button onClick={() => setVariants(variants.filter(x => x.id !== v.id))} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded border border-dashed">No variants created.</div>
            )}
          </div>
        )}

        {/* Variant Overrides Section (Only show in Variant Mode) */}
        {variantId && activeVariant && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900">Trigger Overrides</h3>
              <Input
                value={activeVariant.triggerOverrides || ''}
                onChange={e => {
                  setVariants(variants.map(v => v.id === variantId ? { ...v, triggerOverrides: e.target.value } : v));
                }}
                placeholder="e.g. Only triggers when product_category = 'shoes'"
                className="text-sm h-10"
              />
            </div>
            
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Property Overrides</h3>
              <div className="bg-white border rounded-md divide-y">
                {Array.from(new Set(actions.flatMap(a => [...a.eventProperties, ...a.systemProperties]))).map(propId => {
                  const prop = data.properties.find(p => p.id === propId);
                  if (!prop) return null;
                  const override = activeVariant.propertyOverrides[propId] || {};
                  
                  return (
                    <div key={propId} className="p-3 flex items-center justify-between">
                      <span className="font-mono text-xs font-medium text-gray-900">{prop.name}</span>
                      <div className="flex gap-2">
                        <select
                          className="text-xs border rounded p-1.5 bg-gray-50 focus:ring-[#3E52FF]"
                          value={override.presence || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setVariants(variants.map(v => {
                              if (v.id === variantId) {
                                const newOverrides = { ...v.propertyOverrides };
                                if (val) newOverrides[propId] = { ...newOverrides[propId], presence: val as any };
                                else {
                                  delete newOverrides[propId]?.presence;
                                  if (Object.keys(newOverrides[propId] || {}).length === 0) delete newOverrides[propId];
                                }
                                return { ...v, propertyOverrides: newOverrides };
                              }
                              return v;
                            }));
                          }}
                        >
                          <option value="">Inherit Presence</option>
                          <option value="Always sent">Always sent</option>
                          <option value="Sometimes sent">Sometimes sent</option>
                          <option value="Never sent">Never sent</option>
                        </select>
                        <Input
                          className="h-7 text-xs w-48"
                          placeholder="Override Constraints"
                          value={Array.isArray(override.constraints) ? override.constraints.join(', ') : override.constraints || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setVariants(variants.map(v => {
                              if (v.id === variantId) {
                                const newOverrides = { ...v.propertyOverrides };
                                if (val) newOverrides[propId] = { ...newOverrides[propId], constraints: val };
                                else {
                                  delete newOverrides[propId]?.constraints;
                                  if (Object.keys(newOverrides[propId] || {}).length === 0) delete newOverrides[propId];
                                }
                                return { ...v, propertyOverrides: newOverrides };
                              }
                              return v;
                            }));
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {Array.from(new Set(actions.flatMap(a => [...a.eventProperties, ...a.systemProperties]))).length === 0 && (
                  <div className="p-4 text-xs text-gray-500 italic text-center">No properties connected to override.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sources */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Sources</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.sources.map(source => (
              <button
                key={source.id}
                onClick={() => {
                  if (sources.find(s => s.id === source.id)) setSources(sources.filter(s => s.id !== source.id));
                  else setSources([...sources, source]);
                }}
                className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                  sources.find(s => s.id === source.id)
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {source.name}
              </button>
            ))}
          </div>
        </div>

        {/* Actions & Properties */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Actions</h3>
            {!variantId && (
              <Button variant="outline" size="sm" onClick={() => setActions([...actions, { id: uuidv4(), type: 'Log Event', eventProperties: [], systemProperties: [], pinnedProperties: {} }])} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Action
              </Button>
            )}
          </div>

          {actions.map((action, idx) => (
            <div key={action.id} className="border rounded-lg bg-white overflow-hidden shadow-sm">
              <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-purple-100 flex items-center justify-center text-purple-600">
                    <MessageSquare className="w-3 h-3" />
                  </div>
                  {!variantId ? (
                    <select
                      value={action.type}
                      onChange={(e) => setActions(actions.map(a => a.id === action.id ? { ...a, type: e.target.value } : a))}
                      className="font-semibold text-sm text-gray-900 bg-transparent border-none focus:ring-0 p-0 hover:bg-gray-200 rounded px-1 transition-colors"
                    >
                      <option value="Log Event">Log Event</option>
                      <option value="Log Page View">Log Page View</option>
                      <option value="Identify User">Identify User</option>
                      <option value="Update Group">Update Group</option>
                    </select>
                  ) : (
                    <span className="font-semibold text-sm text-gray-900">{action.type}</span>
                  )}
                </div>
                {!variantId && (
                  <button onClick={() => setActions(actions.filter(a => a.id !== action.id))} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              <div className="p-4 space-y-6">
                {/* Event Properties */}
                <div>
                  <div className="flex items-center justify-between mb-3 border-b pb-2">
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Event Properties</div>
                    {!variantId && (
                      <div className="flex gap-2">
                        <select 
                          className="text-[10px] border rounded px-1 py-0.5 bg-gray-50"
                          onChange={(e) => {
                            if (e.target.value) {
                              const bundle = data.propertyBundles.find(b => b.id === e.target.value);
                              if (bundle) {
                                setActions(actions.map(a => a.id === action.id ? { ...a, eventProperties: Array.from(new Set([...a.eventProperties, ...bundle.propertyIds])) } : a));
                              }
                              e.target.value = '';
                            }
                          }}
                          value=""
                        >
                          <option value="">+ Add Bundle</option>
                          {data.propertyBundles.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <select 
                          className="text-[10px] border rounded px-1 py-0.5 bg-gray-50"
                          onChange={(e) => {
                            if (e.target.value) {
                              setActions(actions.map(a => a.id === action.id && !a.eventProperties.includes(e.target.value) ? { ...a, eventProperties: [...a.eventProperties, e.target.value] } : a));
                              e.target.value = '';
                            }
                          }}
                          value=""
                        >
                          <option value="">+ Add Property</option>
                          {data.properties.filter(p => !action.eventProperties.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    {action.eventProperties.map(propId => {
                      const prop = data.properties.find(p => p.id === propId);
                      if (!prop) return null;
                      const override = variantId ? activeVariant?.propertyOverrides[propId] : undefined;
                      const presence = override?.presence || prop.attached_events.find(e => e.eventId === event?.id)?.presence || 'Always sent';
                      
                      return (
                        <div key={propId} className="flex items-start justify-between group">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-gray-900">{prop.name}</span>
                              <span className="font-mono text-[10px] text-gray-500">{prop.property_value_type}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${presence === 'Always sent' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                                {presence}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1 line-clamp-1">{prop.description}</div>
                          </div>
                          {!variantId && (
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Input
                                className="h-7 text-xs w-28 px-2"
                                placeholder="Pin Value..."
                                value={action.pinnedProperties?.[propId] || ''}
                                onChange={(e) => {
                                  const newActions = [...actions];
                                  const aIdx = newActions.findIndex(a => a.id === action.id);
                                  newActions[aIdx] = {
                                    ...action,
                                    pinnedProperties: { ...(action.pinnedProperties || {}), [propId]: e.target.value }
                                  };
                                  setActions(newActions);
                                }}
                              />
                              <button onClick={() => setActions(actions.map(a => a.id === action.id ? { ...a, eventProperties: a.eventProperties.filter(id => id !== propId) } : a))} className="text-gray-400 hover:text-red-500 p-1">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {action.eventProperties.length === 0 && <div className="text-xs text-gray-400 italic">No event properties attached.</div>}
                  </div>
                </div>

                {/* System Properties */}
                <div>
                  <div className="flex items-center justify-between mb-3 border-b pb-2">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">System Properties</div>
                    {!variantId && (
                      <select 
                        className="text-[10px] border rounded px-1 py-0.5 bg-gray-50"
                        onChange={(e) => {
                          if (e.target.value) {
                            setActions(actions.map(a => a.id === action.id && !a.systemProperties.includes(e.target.value) ? { ...a, systemProperties: [...a.systemProperties, e.target.value] } : a));
                            e.target.value = '';
                          }
                        }}
                        value=""
                      >
                        <option value="">+ Add Property</option>
                        {data.properties.filter(p => !action.systemProperties.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="space-y-3">
                    {action.systemProperties.map(propId => {
                      const prop = data.properties.find(p => p.id === propId);
                      if (!prop) return null;
                      return (
                        <div key={propId} className="flex items-center justify-between group">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-gray-900">{prop.name}</span>
                            <span className="font-mono text-[10px] text-gray-500">{prop.property_value_type}</span>
                          </div>
                          {!variantId && (
                            <button onClick={() => setActions(actions.map(a => a.id === action.id ? { ...a, systemProperties: a.systemProperties.filter(id => id !== propId) } : a))} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {action.systemProperties.length === 0 && <div className="text-xs text-gray-400 italic">No system properties attached.</div>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tracking Code Snippet */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Code className="w-4 h-4" /> Tracking Code
          </div>
          <div className="bg-[#1E1E1E] rounded-lg border border-gray-800 overflow-hidden shadow-sm">
            <div className="px-4 py-2 bg-[#2D2D2D] text-xs font-mono text-gray-300 border-b border-gray-700 flex justify-between">
              <span>Javascript (Codegen)</span>
            </div>
            <pre className="p-4 text-xs font-mono text-[#D4D4D4] overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {generateCodegen()}
            </pre>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="absolute bottom-0 w-full bg-white border-t p-4 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        {!isCreating && event && !variantId && (
          <Button variant="destructive" onClick={() => { deleteEvent(event.id); onClose(); }} className="h-8 text-xs bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border-none shadow-none">
            Archive Event
          </Button>
        )}
        {variantId && (
           <Button variant="destructive" onClick={() => { 
             setVariants(variants.filter(v => v.id !== variantId));
             onClose(); 
           }} className="h-8 text-xs bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border-none shadow-none">
             Delete Variant
           </Button>
        )}
        {!(!isCreating && event) && !variantId && <div />}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs">Cancel</Button>
          <Button onClick={handleSave} className="h-8 text-xs bg-[#3E52FF] hover:bg-blue-600">Save</Button>
        </div>
      </div>
    </div>
  );
}