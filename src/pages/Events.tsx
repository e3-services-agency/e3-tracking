import React, { useState, useMemo, useEffect } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Event, Source, EventAction, EventVariant } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { 
  Search, Plus, Trash2, AlertCircle, GitMerge, CheckCircle2, 
  X, Columns, Code, MessageSquare, Filter, Image as ImageIcon, ChevronRight,
  UserPlus
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
  Row,
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

  // Popover / Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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
            <div className="flex flex-col -my-2 py-2 group">
              {isVariant ? (
                <div className="pl-6 relative">
                  <div className="absolute left-2 top-2 border-l-2 border-b-2 border-gray-300 w-3 h-3 rounded-bl"></div>
                  <span className="text-[11px] text-gray-500 font-medium leading-none">{row.original.baseEventName} -</span>
                  <div className="text-sm font-bold text-gray-900 leading-tight mt-0.5 group-hover:text-[#3E52FF]">{row.original.name}</div>
                </div>
              ) : (
                <span className="text-sm font-semibold text-gray-900 leading-tight group-hover:text-[#3E52FF]">{row.original.name}</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'label',
        header: 'Event Label',
        cell: ({ row }) => (
          <span className={`text-[11px] px-3 py-1 rounded-full border font-medium ${row.original.label === 'Base' ? 'bg-white text-gray-600 border-gray-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
            {row.original.label}
          </span>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => <span className="text-xs text-gray-500 whitespace-normal break-words block">{row.original.description || '-'}</span>,
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
    const groups: Record<string, Row<EventRow>[]> = {};
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
    <div className="flex-1 flex flex-col h-full bg-[#F9FAFB] relative">
      
      {/* Top Header matching Avo UI */}
      <div className="px-6 py-4 border-b bg-white flex flex-col gap-4 relative z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Events <span className="text-gray-400 font-normal text-lg">({data.events.length})</span></h1>
            <Button onClick={handleCreateNew} className="h-8 gap-2 bg-[#F11578] hover:bg-[#D10F65] text-white border-none shadow-sm rounded-md px-3">
              <Plus className="w-4 h-4" /> New Event
            </Button>
            <Button onClick={() => setIsCategoryModalOpen(true)} variant="outline" className="h-8 gap-2 bg-white text-gray-600 border-gray-200 shadow-sm rounded-md px-3">
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

            <div className="relative">
              <Button onClick={() => { setIsCustomizeOpen(!isCustomizeOpen); setIsFilterOpen(false); }} variant="ghost" className="h-8 gap-2 text-gray-500 hover:text-gray-700 px-3">
                <Columns className="w-4 h-4" /> Customize
              </Button>
              {isCustomizeOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-4">
                  <div className="mb-4 pb-4 border-b border-gray-100">
                    <h4 className="font-bold text-sm text-gray-900">Customize view</h4>
                    <p className="text-xs text-gray-500 mt-1">Configure this view to highlight information most important to you.</p>
                  </div>
                  <div className="space-y-3 mb-4 pb-4 border-b border-gray-100">
                     <label className="flex items-center justify-between cursor-pointer">
                       <span className="text-sm text-gray-600">Show empty categories</span>
                       <div className="w-8 h-4 bg-gray-200 rounded-full relative"><div className="w-4 h-4 bg-white border border-gray-200 rounded-full absolute left-0"></div></div>
                     </label>
                     <label className="flex items-center justify-between cursor-pointer">
                       <span className="text-sm text-gray-600">Show event variants</span>
                       <div className="w-8 h-4 bg-green-500 rounded-full relative"><div className="w-4 h-4 bg-white rounded-full absolute right-0 shadow-sm"></div></div>
                     </label>
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 mb-3">Column order and visibility</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                     {table.getAllLeafColumns().map(column => (
                        <label key={column.id} className="flex items-center justify-between cursor-pointer group">
                           <div className="flex items-center gap-2">
                             <div className="w-3 h-3 flex flex-col gap-0.5 opacity-30 group-hover:opacity-100"><div className="w-full h-0.5 bg-gray-600"></div><div className="w-full h-0.5 bg-gray-600"></div><div className="w-full h-0.5 bg-gray-600"></div></div>
                             <span className="text-sm text-gray-600">{column.columnDef.header as string}</span>
                           </div>
                           <input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} className="w-4 h-4 rounded text-green-500 focus:ring-green-500 border-gray-300" />
                        </label>
                     ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <Button onClick={() => { setIsFilterOpen(!isFilterOpen); setIsCustomizeOpen(false); }} variant="ghost" className="h-8 gap-2 text-gray-500 hover:text-gray-700 px-3">
                <Filter className="w-4 h-4" /> Filter
              </Button>
              {isFilterOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 flex flex-col">
                  <div className="p-3 border-b border-gray-100">
                    <Input placeholder="Filter by..." className="h-8 text-sm bg-gray-50 border-none focus-visible:ring-0" />
                  </div>
                  <div className="p-3 max-h-64 overflow-y-auto space-y-4">
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Sources</div>
                      <div className="space-y-2">
                        {['Website', 'Backend', 'iOS', 'Android'].map(s => (
                          <label key={s} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded border-gray-300 text-[#3E52FF]" />
                            <span className="text-sm text-gray-700">{s}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Stakeholders</div>
                      <div className="space-y-2">
                        {['Central data team', 'Checkout team', 'Search team'].map(s => (
                          <label key={s} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded border-gray-300 text-[#3E52FF]" />
                            <span className="text-sm text-gray-700">{s}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

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

      {/* Backdrop for Popovers */}
      {(isCustomizeOpen || isFilterOpen) && (
        <div className="fixed inset-0 z-40" onClick={() => { setIsCustomizeOpen(false); setIsFilterOpen(false); }}></div>
      )}

      {/* New Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-[500px] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
               <h2 className="text-xl font-bold text-gray-900">New Category</h2>
               <button onClick={() => setIsCategoryModalOpen(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6">
               <label className="block text-sm font-semibold text-gray-600 mb-2">Name</label>
               <Input className="mb-6 focus-visible:ring-[#3E52FF]" />
               <p className="text-sm text-gray-500 leading-relaxed mb-1">
                 <strong className="text-gray-700">Categories</strong> are a way to create a organized structure for events and metrics. It is useful to create categories for important features and/or important flows in the product.
               </p>
               <a href="#" className="text-sm font-bold text-[#3E52FF] hover:underline">Docs ↗</a>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
               <Button variant="ghost" onClick={() => setIsCategoryModalOpen(false)} className="text-gray-600">Cancel</Button>
               <Button disabled className="bg-gray-300 text-white cursor-not-allowed">Create</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col relative z-10">
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
                      <tr 
                        key={row.id} 
                        onClick={() => handleOpenEvent(row.original.originalEvent.id, row.original.variantId)}
                        className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 cursor-pointer"
                      >
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} className="px-4 py-3 text-sm text-gray-900 align-middle">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr 
                    key={row.id} 
                    onClick={() => handleOpenEvent(row.original.originalEvent.id, row.original.variantId)}
                    className="hover:bg-gray-50 transition-colors border-b border-gray-100 cursor-pointer"
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3 text-sm text-gray-900 align-middle">
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
        hideHeader={true}
        className="w-[700px]"
      >
        {isSheetOpen && (
          <AvoEventEditor
            key={selectedEvent?.id || 'new'}
            event={selectedEvent}
            variantId={selectedVariantId}
            isCreating={isCreating}
            onClose={() => setIsSheetOpen(false)}
            onSwitchVariant={(vId) => setSelectedVariantId(vId)}
          />
        )}
      </Sheet>
    </div>
  );
}

/**
 * Refined Editor mimicking the exact Avo.app right-sidebar specification
 */
function AvoEventEditor({ event, variantId, isCreating, onClose, onSwitchVariant }: { event: Event | null | undefined, variantId?: string, isCreating: boolean, onClose: () => void, onSwitchVariant?: (id: string) => void }) {
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

  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');

  // Modals inside Panel
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');
  const [isAddActionPopoverOpen, setIsAddActionPopoverOpen] = useState(false);

  const activeVariant = variants.find(v => v.id === variantId);

  const handleCreateVariant = () => {
    if (!newVariantName.trim()) return;
    const newV = { id: uuidv4(), name: newVariantName, propertyOverrides: {} };
    setVariants([...variants, newV]);
    setIsVariantModalOpen(false);
    setNewVariantName('');
    if (onSwitchVariant) onSwitchVariant(newV.id);
  };

  const handleAddAction = (type: string) => {
    setActions([...actions, { id: uuidv4(), type, eventProperties: [], systemProperties: [], pinnedProperties: {} }]);
    setIsAddActionPopoverOpen(false);
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
      ownerTeamId, stakeholderTeamIds
    };

    if (isCreating) addEvent(eventData as Event);
    else if (event) updateEvent(event.id, eventData);
    
    onClose();
  };

  // Pseudo Codegen Builder
  const generateCodegen = () => {
    const fnName = toPascalCase(name).replace(/^./, str => str.toLowerCase());
    const variantSuffix = activeVariant ? toPascalCase(activeVariant.name) : '';
    const props = Array.from(new Set(actions.flatMap(a => [...a.eventProperties, ...a.systemProperties])));
    
    return `Avo.${fnName}${variantSuffix}({
${props.map(pid => {
  const p = data.properties.find(prop => prop.id === pid);
  if (!p) return '';
  const camelProp = toPascalCase(p.name).replace(/^./, s => s.toLowerCase());
  return `  ${camelProp}: ${camelProp}, // ${p.property_value_type}`;
}).filter(Boolean).join('\n')}
});`;
  };

  return (
    <div className="flex flex-col h-full bg-white relative font-sans -mx-6 -my-6">
      
      {/* Header matching Avo explicitly */}
      <div className="px-8 py-5 flex justify-between items-start border-b border-gray-100 sticky top-0 bg-white z-20">
        <div className="flex-1 pr-4">
          <div className="text-[11px] font-semibold text-gray-500 tracking-wider mb-1 uppercase">
             Event {variantId ? 'Variant' : ''}
          </div>
          <div className="flex items-center gap-2">
            {variantId && <span className="text-[22px] font-bold text-gray-400">{name} - </span>}
            <input 
              value={variantId ? activeVariant?.name : name}
              onChange={e => variantId 
                ? setVariants(variants.map(v => v.id === variantId ? { ...v, name: e.target.value } : v))
                : setName(e.target.value)
              }
              className={`text-[22px] font-bold border-none px-0 h-auto focus-visible:ring-0 w-full shadow-none outline-none ${variantId ? 'text-gray-900' : 'text-gray-900'}`}
              placeholder="Event Name"
            />
          </div>
          {variantId && (
            <div className="text-xs text-gray-500 mt-1">
              Variation of <span className="text-[#3E52FF] font-semibold cursor-pointer hover:underline" onClick={() => onSwitchVariant?.('')}>{name}</span>
              <div className="mt-0.5">When a user views a web page within the website</div>
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 bg-gray-50 rounded-full p-2">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10 pb-32">
        
        {/* Stakeholders & Ownership */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[15px] font-bold text-gray-900">Stakeholders & Ownership</h3>
            <button className="text-[13px] font-semibold text-[#3E52FF] hover:underline">+ Add stakeholder</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ownerTeamId}
              onChange={(e) => setOwnerTeamId(e.target.value)}
              className="text-[13px] font-medium border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 shadow-sm"
            >
              {data.teams.map(t => <option key={t.id} value={t.id}>{t.name} (Owner)</option>)}
            </select>
            {stakeholderTeamIds.map(id => {
              const team = data.teams.find(t => t.id === id);
              if (!team) return null;
              return (
                <span key={id} className="text-[13px] font-medium border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 shadow-sm flex items-center gap-2">
                  {team.name}
                  <button onClick={() => setStakeholderTeamIds(stakeholderTeamIds.filter(tid => tid !== id))} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                </span>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[15px] font-bold text-gray-900">Description</h3>
          </div>
          <textarea
            value={variantId ? activeVariant?.description || '' : description}
            onChange={(e) => variantId 
              ? setVariants(variants.map(v => v.id === variantId ? { ...v, description: e.target.value } : v))
              : setDescription(e.target.value)
            }
            className="w-full text-[14px] text-gray-700 bg-white border border-gray-200 rounded-md p-4 min-h-[100px] resize-y focus:outline-none focus:ring-1 focus:ring-[#3E52FF] shadow-sm"
            placeholder={variantId ? "Describe this variant's specific context..." : "Describe the user action..."}
          />
        </div>

        {/* Variants Section (Only show on Base Event) */}
        {!variantId && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-[15px] font-bold text-gray-900">Variants</h3>
              <button 
                className="text-[13px] font-semibold text-[#3E52FF] hover:underline"
                onClick={() => setIsVariantModalOpen(true)}
              >
                + New Variant
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 text-[13px] font-bold text-gray-600">
                {variants.length} Variant{variants.length !== 1 && 's'}
              </div>
              {variants.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {variants.map(v => (
                    <div key={v.id} className="p-4 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                      <div className="cursor-pointer" onClick={() => onSwitchVariant?.(v.id)}>
                        <div className="text-[15px] font-bold text-gray-900 group-hover:text-[#3E52FF]">{v.name}</div>
                        <div className="text-[13px] font-semibold text-[#3E52FF] mt-1">{Object.keys(v.propertyOverrides).length} Overrides</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full border border-gray-200 font-medium">Website</span>
                        <button onClick={() => setVariants(variants.filter(x => x.id !== v.id))} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[13px] text-gray-500 bg-white p-5 text-center italic">No variants created.</div>
              )}
            </div>
          </div>
        )}

        {/* Mock Triggers Section */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[15px] font-bold text-gray-900">Triggered when</h3>
            <button className="text-[13px] font-semibold text-[#3E52FF] hover:underline">+ New Trigger</button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 w-40 bg-white flex flex-col gap-2 shrink-0 shadow-sm cursor-pointer hover:border-gray-300 transition-colors">
                <div className="w-full h-24 bg-gray-50 rounded-md flex items-center justify-center border border-gray-100">
                  <ImageIcon className="w-6 h-6 text-gray-300" />
                </div>
                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mt-1">Source Independ...</div>
                <div className="text-[13px] font-bold text-gray-900 leading-tight line-clamp-2">Lands on {variantId ? 'product' : 'home'} page</div>
                <div className="text-[11px] text-gray-500 line-clamp-1">User lands on...</div>
              </div>
            ))}
          </div>
        </div>

        {/* Compact Sources */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[15px] font-bold text-gray-900">Sources</h3>
            {variantId && <button className="text-[#3E52FF] text-[13px] font-semibold hover:underline">Edit on variant</button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.sources.map(source => {
              const isSelected = sources.find(s => s.id === source.id);
              if (!isSelected && variantId) return null; // Don't show unselected sources on variant mode
              
              return (
                <div 
                  key={source.id} 
                  className={`border rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm cursor-pointer transition-colors ${isSelected ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                  onClick={() => {
                    if (!variantId) {
                      if (isSelected) setSources(sources.filter(s => s.id !== source.id));
                      else setSources([...sources, source]);
                    }
                  }}
                >
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                  <span className={`text-[13px] font-bold ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>{source.name}</span>
                  {isSelected && (
                    <div className="w-[14px] h-[14px] rounded-full bg-emerald-500 text-white flex items-center justify-center text-[8px] font-bold ml-1">P</div>
                  )}
                </div>
              );
            })}
            {!variantId && (
              <button className="text-[#3E52FF] text-[13px] font-semibold hover:underline ml-2">+ Add Source</button>
            )}
          </div>
        </div>

        {/* Actions & Properties */}
        <div>
          <div className="flex items-center justify-between mb-3 relative">
            <h3 className="text-[15px] font-bold text-gray-900">Actions</h3>
          </div>

          <div className="space-y-4">
            {actions.map((action, idx) => (
              <div key={action.id} className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                <div className="bg-white px-5 py-4 border-b border-gray-100 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-7 h-7 rounded border border-gray-200 bg-white flex items-center justify-center text-gray-400 shadow-sm">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      {!variantId ? (
                        <select
                          value={action.type}
                          onChange={(e) => setActions(actions.map(a => a.id === action.id ? { ...a, type: e.target.value } : a))}
                          className="font-bold text-[15px] text-gray-900 bg-transparent border-none focus:ring-0 p-0 hover:bg-gray-50 rounded transition-colors -ml-1 cursor-pointer"
                        >
                          <option value="Log Event">Log Event</option>
                          <option value="Log Page View">Log Page View</option>
                          <option value="Identify User">Identify User</option>
                          <option value="Update Group">Update Group</option>
                        </select>
                      ) : (
                        <div className="font-bold text-[15px] text-gray-900">{action.type}</div>
                      )}
                      <div className="text-[12px] text-gray-500 mt-1">Track page view in your analytics tool to be able use their automatic page tracking capabilities.</div>
                    </div>
                  </div>
                </div>
                
                <div className="p-5 space-y-6">
                  {/* Event Properties */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Event Properties</div>
                    
                    {/* Mock Property Bundle block */}
                    <div className="border border-gray-200 rounded-lg p-3 flex items-start justify-between mb-4 bg-white shadow-sm hover:border-gray-300 cursor-pointer transition-colors">
                       <div className="flex items-start gap-2">
                         <ChevronRight className="w-4 h-4 text-gray-400 mt-0.5" />
                         <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[13px] text-gray-900">product_properties</span>
                              <span className="text-[11px] text-gray-500 font-medium">Bundle of 5 Properties</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">Properties relating to products</div>
                         </div>
                       </div>
                    </div>

                    <div className="space-y-4">
                      {action.eventProperties.map(propId => {
                        const prop = data.properties.find(p => p.id === propId);
                        if (!prop) return null;
                        const override = variantId ? activeVariant?.propertyOverrides[propId] : undefined;
                        const presence = override?.presence || prop.attached_events.find(e => e.eventId === event?.id)?.presence || 'Always sent';
                        const isPinned = !!override?.constraints;
                        
                        return (
                          <div key={propId} className="flex flex-col group border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-[13px] text-gray-900">{prop.name}</span>
                              <span className="font-mono text-[11px] text-gray-500">{prop.property_value_type}</span>
                              <span className="text-[11px] text-gray-500 font-medium">{presence}</span>
                              {isPinned && <span className="text-[11px] font-semibold text-emerald-600 ml-auto bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Pinned to "{override.constraints}" (on this event variant)</span>}
                            </div>
                            <div className="text-[12px] text-gray-500 mt-1.5">{prop.description}</div>
                          </div>
                        );
                      })}
                    </div>
                    {!variantId && (
                      <button className="text-[#3E52FF] text-[13px] font-semibold hover:underline mt-4">+ Add Event Property</button>
                    )}
                    {variantId && (
                      <button className="text-[#3E52FF] text-[13px] font-semibold hover:underline mt-4">+ Add Event Property to Variant</button>
                    )}
                  </div>

                  {/* System Properties */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">System Properties</div>
                    <div className="space-y-4">
                      {action.systemProperties.map(propId => {
                        const prop = data.properties.find(p => p.id === propId);
                        if (!prop) return null;
                        return (
                          <div key={propId} className="flex flex-col group border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-[13px] text-gray-900">{prop.name}</span>
                              <span className="font-mono text-[11px] text-gray-500">{prop.property_value_type}</span>
                              <span className="text-[11px] text-gray-500 font-medium">Always sent</span>
                            </div>
                            <div className="text-[12px] text-gray-500 mt-1.5">{prop.description}</div>
                          </div>
                        );
                      })}
                    </div>
                    {!variantId && (
                      <button className="text-[#3E52FF] text-[13px] font-semibold hover:underline mt-4">+ Add System Property</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            <div className="relative">
              {!variantId && (
                <button onClick={() => setIsAddActionPopoverOpen(!isAddActionPopoverOpen)} className="text-[#3E52FF] text-[14px] font-semibold hover:underline mt-2">+ Add Action</button>
              )}
              {isAddActionPopoverOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAddActionPopoverOpen(false)}></div>
                  <div className="absolute top-full left-0 mt-2 w-[450px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2">
                    <button onClick={() => handleAddAction('Update User Properties')} className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg text-left transition-colors">
                      <UserPlus className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                         <div className="font-bold text-[14px] text-gray-900">Update User Properties</div>
                         <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">Add one or more user properties that should be attached to the user's profile in your analytics tool.</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Categories & Tags */}
        <div className="grid grid-cols-1 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-[15px] font-bold text-gray-800">Categories</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <span key={cat} className="flex items-center gap-1 text-[12px] font-medium bg-blue-50 text-blue-700 px-3 py-1.5 rounded border border-blue-100">
                  {cat}
                  <button onClick={() => setCategories(categories.filter(c => c !== cat))}><X className="w-3 h-3" /></button>
                </span>
              ))}
              {!variantId && (
                <button className="text-[#3E52FF] text-[13px] font-semibold hover:underline flex items-center gap-1">
                  + Add Category
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-[15px] font-bold text-gray-800">Tags</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-[12px] font-medium bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-100">
                  {tag}
                  <button onClick={() => setTags(tags.filter(t => t !== tag))}><X className="w-3 h-3" /></button>
                </span>
              ))}
              {!variantId && (
                <div className="flex items-center">
                   <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }} placeholder="Add tag..." className="h-8 text-[12px] border-dashed w-32 border-gray-300" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tracking Code Snippet */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[15px] font-bold text-gray-800 flex items-center gap-2">
              <Code className="w-4 h-4 text-gray-400" /> Tracking Code
            </h3>
          </div>
          <div className="bg-[#2A2A2A] rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-[#333333] text-[11px] font-bold text-gray-300 border-b border-[#444] flex justify-between">
              <span>Website - Javascript (Codegen)</span>
            </div>
            <pre className="p-4 text-[12px] font-mono text-[#E0E0E0] overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {generateCodegen()}
            </pre>
            <div className="px-4 py-2.5 bg-[#222222] text-[11px] text-gray-400 font-mono flex items-center gap-3 border-t border-[#111]">
              <span className="text-gray-500">Codegen using Avo CLI:</span>
              <span className="text-white font-semibold">$ avo pull --branch main "Website"</span>
            </div>
          </div>
        </div>

        {/* Mock History Log matching screenshot */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          <div className="text-[#3E52FF] font-semibold text-[13px] text-center mb-4 cursor-pointer hover:underline">Load older activity...</div>
          <div className="text-[12px] text-gray-600 space-y-1.5 font-medium">
            <p><strong className="text-gray-800">Avo Cado</strong> added the property bundle <strong className="text-gray-800">product_properties</strong> <span className="text-gray-400 font-normal">4 months ago</span></p>
            <p><strong className="text-gray-800">Avo Cado</strong> cleared the property bundle override for <strong className="text-gray-800">product_properties</strong> <span className="text-gray-400 font-normal">4 months ago</span></p>
            <p><strong className="text-gray-800">Avo Cado</strong> added the property <strong className="text-gray-800">product_category</strong> <span className="text-gray-400 font-normal">4 months ago</span></p>
            <p><strong className="text-gray-800">Avo Cado</strong> set the absence of the property <strong className="text-gray-800">product_category</strong> to <strong className="text-gray-800">always sent</strong> <span className="text-gray-400 font-normal">4 months ago</span></p>
            <p><strong className="text-gray-800">Avo Cado</strong> added the property bundle <strong className="text-gray-800">product_properties</strong> <span className="text-gray-400 font-normal">4 months ago</span></p>
            <p><strong className="text-gray-800">Avo Cado</strong> set the absence of the property <strong className="text-gray-800">product_price_usd</strong> to <strong className="text-gray-800">sometimes sent</strong> <span className="text-gray-400 font-normal">4 months ago</span></p>
            <p><strong className="text-gray-800">Avo Cado</strong> connected variant <strong className="text-gray-800">page_viewed - product</strong> to trigger <span className="text-gray-400 font-normal">4 months ago</span></p>
            <p><strong className="text-gray-800">Avo Cado</strong> pinned the property <strong className="text-gray-800">page_category</strong> to "Product" <span className="text-gray-400 font-normal">4 months ago</span></p>
            <p><strong className="text-gray-800">Ján Pan</strong> connected variant <strong className="text-gray-800">page_viewed - product</strong> to trigger <span className="text-gray-400 font-normal">about 19 hours ago on</span> <span className="text-gray-400">main</span></p>
          </div>
        </div>

      </div>

      {/* Footer Activity Log / Comment mock */}
      <div className="absolute bottom-0 w-full bg-white border-t border-gray-200 p-4 flex gap-3 items-center shadow-[0_-4px_15px_-1px_rgba(0,0,0,0.05)] z-40 px-6">
         <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">JA</div>
         <input 
           placeholder="Write a comment on this event..." 
           className="flex-1 text-[13px] bg-transparent border-none focus:ring-0 outline-none text-gray-600 placeholder:text-gray-400"
         />
         <div className="flex gap-2">
            {!isCreating && event && !variantId && (
              <Button variant="outline" onClick={() => { deleteEvent(event.id); onClose(); }} className="h-9 text-[13px] text-red-600 border-red-200 hover:bg-red-50 px-4">
                Archive Event
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="h-9 text-[13px] px-4 text-gray-600 border-gray-300">Cancel</Button>
            <Button onClick={handleSave} className="h-9 text-[13px] bg-[#3E52FF] hover:bg-blue-600 shadow-sm rounded-md px-6">Save</Button>
         </div>
      </div>

      {/* Create Event Variant Modal */}
      {isVariantModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-[450px] overflow-hidden">
            <div className="p-8">
               <h2 className="text-2xl font-bold text-gray-900 mb-2">Create event variant</h2>
               <p className="text-[15px] text-gray-700 leading-relaxed mb-6">
                 Give the variant a descriptive name. It will not impact how the event name is sent to destinations.
               </p>
               
               <div className="flex items-center gap-2">
                 <span className="text-[15px] font-bold text-gray-900">{name} -</span>
                 <Input 
                   value={newVariantName} 
                   onChange={e => setNewVariantName(e.target.value)} 
                   placeholder="Type a variant name..." 
                   className="flex-1 text-[15px] h-10 border-2 border-[#3E52FF] focus-visible:ring-0 rounded-lg shadow-sm"
                   autoFocus
                   onKeyDown={(e) => { if (e.key === 'Enter') handleCreateVariant(); }}
                 />
               </div>
            </div>
            <div className="px-8 py-5 bg-white flex justify-end gap-3">
               <Button variant="outline" onClick={() => setIsVariantModalOpen(false)} className="h-10 px-6 text-[15px] text-gray-600 border-gray-300 rounded-lg">Cancel</Button>
               <Button onClick={handleCreateVariant} disabled={!newVariantName.trim()} className="h-10 px-6 text-[15px] bg-[#C1C3C8] text-white disabled:opacity-100 rounded-lg border-none shadow-none font-bold data-[valid=true]:bg-[#3E52FF]" data-valid={!!newVariantName.trim()}>Create variant</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}