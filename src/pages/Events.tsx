import React, { useState, useMemo, useEffect } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Property, Team, PropertyBundle } from '@/src/types';
import { EventRow } from '@/src/features/events/types';
import { buildEventRows } from '@/src/features/events/lib/eventRows';
import { groupRowsByCategory } from '@/src/features/events/lib/eventGrouping';
import { getEventTableColumns } from '@/src/features/events/page/eventTableColumns';
import { EventEditorSheet } from '@/src/features/events/editor/EventEditorSheet';
import { EventsList } from '@/src/features/events/EventsList';
import { EventEditorSheet as ApiEventEditorSheet } from '@/src/features/events/EventEditorSheet';
import { useEvents } from '@/src/features/events/hooks/useEvents';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { 
  Plus,
  GitMerge,
  X,
  Columns,
  Filter,
} from 'lucide-react';
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

export function Events() {
  const data = useActiveData();
  const { activeBranchId, branches, mergeBranch, approveBranch, selectedItemIdToEdit, setSelectedItemIdToEdit, updateEvent, addCustomCategory } = useStore();
  
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    propertyBundles: false,
    groupProperties: false,
    destinations: false,
    metrics: false,
  });
  
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<'Category' | 'List'>('List');
  const [apiEventSheetEventId, setApiEventSheetEventId] = useState<string | null>(null);
  const [isApiEventSheetOpen, setIsApiEventSheetOpen] = useState(false);
  const eventsApi = useEvents();

  // Popover / Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Customize & Filter states
  const [showEmptyCategories, setShowEmptyCategories] = useState(false);
  const [showEventVariants, setShowEventVariants] = useState(true);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [stakeholderFilters, setStakeholderFilters] = useState<string[]>([]);

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

  const canMerge = activeBranch && activeBranch.approvals.length > 0;

  // Flatten and Filter events
  const flatTableData = useMemo<EventRow[]>(() => {
    return buildEventRows({
      events: data.events,
      teams: data.teams as Team[],
      showEventVariants,
      sourceFilters,
      stakeholderFilters,
    });
  }, [data.events, data.teams, showEventVariants, sourceFilters, stakeholderFilters]);

  const columns = useMemo<ColumnDef<EventRow>[]>(() => {
    return getEventTableColumns({
      teams: data.teams as Team[],
      properties: data.properties as Property[],
      propertyBundles: data.propertyBundles as PropertyBundle[],
      updateEvent,
    });
  }, [data.teams, data.properties, data.propertyBundles, updateEvent]);

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

  const groupedRows = useMemo(() => {
    return groupRowsByCategory({
      rows: table.getRowModel().rows,
      events: data.events,
      showEmptyCategories,
      customCategories: data.customCategories ?? [],
    });
  }, [table.getRowModel().rows, showEmptyCategories, data.events, data.customCategories]);

  const toggleSourceFilter = (source: string) => {
    setSourceFilters(prev => prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]);
  };

  const toggleStakeholderFilter = (team: string) => {
    setStakeholderFilters(prev => prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--surface-default)] relative">
      
      <div className={`px-6 py-4 border-b bg-white flex flex-col gap-4 relative ${(isCustomizeOpen || isFilterOpen) ? 'z-50' : 'z-20'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Events <span className="text-gray-400 font-normal text-lg">({flatTableData.length})</span></h1>
            <Button
              onClick={() => {
                if (viewMode === 'List') {
                  setApiEventSheetEventId(null);
                  setIsApiEventSheetOpen(true);
                } else {
                  handleCreateNew();
                }
              }}
              size="sm"
              className="gap-2"
            >
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
                <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-5">
                  <div className="mb-4 pb-4 border-b border-gray-100">
                    <h4 className="font-bold text-sm text-gray-900">Customize view</h4>
                    <p className="text-xs text-gray-500 mt-1">Configure this view to highlight information most important to you.</p>
                  </div>
                  <div className="space-y-4 mb-4 pb-4 border-b border-gray-100">
                     <label className="flex items-center justify-between cursor-pointer">
                       <span className="text-[13px] font-bold text-gray-600">Show empty categories</span>
                       <div className={`w-10 h-5 rounded-full relative transition-colors ${showEmptyCategories ? 'bg-green-500' : 'bg-gray-200'}`}>
                         <input type="checkbox" checked={showEmptyCategories} onChange={e => setShowEmptyCategories(e.target.checked)} className="hidden" />
                         <div className={`w-5 h-5 bg-white rounded-full absolute top-0 shadow-sm transition-all ${showEmptyCategories ? 'right-0' : 'left-0 border border-gray-200'}`}></div>
                       </div>
                     </label>
                     <label className="flex items-center justify-between cursor-pointer">
                       <span className="text-[13px] font-bold text-gray-600">Show event variants</span>
                       <div className={`w-10 h-5 rounded-full relative transition-colors ${showEventVariants ? 'bg-green-500' : 'bg-gray-200'}`}>
                         <input type="checkbox" checked={showEventVariants} onChange={e => setShowEventVariants(e.target.checked)} className="hidden" />
                         <div className={`w-5 h-5 bg-white rounded-full absolute top-0 shadow-sm transition-all ${showEventVariants ? 'right-0' : 'left-0 border border-gray-200'}`}></div>
                       </div>
                     </label>
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 mb-4">Column order and visibility</h4>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                     {table.getAllLeafColumns().map(column => (
                        <label key={column.id} className="flex items-center justify-between cursor-pointer group">
                           <div className="flex items-center gap-3">
                             <div className="w-3 h-3 flex flex-col gap-[2px] opacity-30 group-hover:opacity-100"><div className="w-full h-[2px] bg-gray-600 rounded"></div><div className="w-full h-[2px] bg-gray-600 rounded"></div><div className="w-full h-[2px] bg-gray-600 rounded"></div></div>
                             <span className="text-[13px] font-medium text-gray-600">{column.columnDef.header as string}</span>
                           </div>
                           <div className={`w-10 h-5 rounded-full relative transition-colors ${column.getIsVisible() ? 'bg-green-500' : 'bg-gray-200'}`}>
                             <input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} className="hidden" />
                             <div className={`w-5 h-5 bg-white rounded-full absolute top-0 shadow-sm transition-all ${column.getIsVisible() ? 'right-0' : 'left-0 border border-gray-200'}`}></div>
                           </div>
                        </label>
                     ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <Button onClick={() => { setIsFilterOpen(!isFilterOpen); setIsCustomizeOpen(false); }} variant="ghost" className="h-8 gap-2 text-gray-500 hover:text-gray-700 px-3">
                <Filter className="w-4 h-4" /> Filter
                {(sourceFilters.length > 0 || stakeholderFilters.length > 0) && (
                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] ml-1">{sourceFilters.length + stakeholderFilters.length}</span>
                )}
              </Button>
              {isFilterOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 flex flex-col">
                  <div className="p-3 border-b border-gray-100">
                    <Input placeholder="Filter by..." className="h-8 text-sm bg-gray-50 border-none focus-visible:ring-0 font-medium" />
                  </div>
                  <div className="p-4 max-h-72 overflow-y-auto space-y-6">
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Sources</div>
                      <div className="space-y-3">
                        {data.sources.length === 0 ? (
                          <span className="text-[13px] text-gray-500">No sources in workspace</span>
                        ) : (
                          data.sources.map((s) => (
                            <label key={s.id} className="flex items-center gap-3 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={sourceFilters.includes(s.name)}
                                onChange={() => toggleSourceFilter(s.name)}
                                className="rounded border-gray-300 w-4 h-4 text-gray-500 focus:ring-0 cursor-pointer"
                              />
                              <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{s.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Stakeholders</div>
                      <div className="space-y-3">
                        {data.teams.length === 0 ? (
                          <span className="text-[13px] text-gray-500">No teams in workspace</span>
                        ) : (
                          data.teams.map((t) => (
                            <label key={t.id} className="flex items-center gap-3 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={stakeholderFilters.includes(t.name)}
                                onChange={() => toggleStakeholderFilter(t.name)}
                                className="rounded border-gray-300 w-4 h-4 text-gray-500 focus:ring-0 cursor-pointer"
                              />
                              <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{t.name}</span>
                            </label>
                          ))
                        )}
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
               <button onClick={() => { setIsCategoryModalOpen(false); setNewCategoryName(''); }} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6">
               <label className="block text-sm font-semibold text-gray-600 mb-2">Name</label>
               <Input
                 value={newCategoryName}
                 onChange={(e) => setNewCategoryName(e.target.value)}
                 className="mb-6 focus-visible:ring-[var(--color-info)]"
                 placeholder="e.g. Checkout, Search"
               />
               <p className="text-sm text-gray-500 leading-relaxed mb-1">
                 <strong className="text-gray-700">Categories</strong> are a way to create a organized structure for events and metrics. It is useful to create categories for important features and/or important flows in the product.
               </p>
               <a href="#" className="text-sm font-bold text-[var(--color-info)] hover:underline">Docs ↗</a>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
               <Button variant="ghost" onClick={() => { setIsCategoryModalOpen(false); setNewCategoryName(''); }} className="text-gray-600">Cancel</Button>
               <Button
                 disabled={!newCategoryName.trim()}
                 onClick={() => {
                   const name = newCategoryName.trim();
                   if (name) {
                     addCustomCategory(name);
                     setNewCategoryName('');
                     setIsCategoryModalOpen(false);
                   }
                 }}
                 variant={newCategoryName.trim() ? 'default' : 'secondary'}
               >
                 Create
               </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col relative z-10">
        {viewMode === 'List' ? (
          <div className="flex-1 overflow-hidden flex flex-col p-6 bg-[var(--surface-default)]">
            <EventsList
              onOpenCreate={() => {
                setApiEventSheetEventId(null);
                setIsApiEventSheetOpen(true);
              }}
              onOpenEvent={(id) => {
                setApiEventSheetEventId(id);
                setIsApiEventSheetOpen(true);
              }}
            />
          </div>
        ) : (
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
                    <tr className="bg-gray-50 border-y border-gray-200">
                      <td colSpan={columns.length} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <input type="checkbox" className="mt-1 rounded border-gray-300 w-4 h-4 text-gray-500 focus:ring-0" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Category</span>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="font-bold text-gray-700 text-[15px] leading-tight">{category}</span>
                              <span className="bg-gray-400 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">{rows.length} events</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                    
                    {rows.map(row => (
                      <tr 
                        key={row.id} 
                        onClick={() => handleOpenEvent(row.original.originalEvent.id, row.original.variantId)}
                        className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 cursor-pointer"
                      >
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} className="px-4 py-3 text-sm text-gray-900 align-top">
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
                      <td key={cell.id} className="px-4 py-3 text-sm text-gray-900 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">
                    No events found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <ApiEventEditorSheet
        isOpen={isApiEventSheetOpen}
        onClose={() => setIsApiEventSheetOpen(false)}
        eventId={apiEventSheetEventId}
        createEvent={eventsApi.createEvent}
        attachProperty={eventsApi.attachProperty}
        updatePresence={eventsApi.updatePresence}
        getEventWithProperties={eventsApi.getEventWithProperties}
        mutationError={eventsApi.mutationError}
        clearMutationError={eventsApi.clearMutationError}
        onEventCreated={(id) => {
          setApiEventSheetEventId(id);
          eventsApi.refetch();
        }}
      />

      <Sheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        hideHeader={true}
        className="w-[1000px]" // Extra wide panel
      >
        {isSheetOpen && (
          <EventEditorSheet
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