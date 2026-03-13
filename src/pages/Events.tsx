import React, { useState, useMemo, useEffect } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Event, Source, EventAction, EventVariant, Property } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { 
  Search, Plus, Trash2, AlertCircle, GitMerge, CheckCircle2, 
  X, Columns, Code, MessageSquare, Filter, Image as ImageIcon, ChevronRight,
  UserPlus, Users, UserCheck, UserMinus, DollarSign, AppWindow, MonitorSmartphone,
  Server, Smartphone, UploadCloud
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
  baseEventName?: string;
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

const getSourceIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('web')) return <AppWindow className="w-4 h-4 text-gray-500" />;
  if (lower.includes('backend')) return <Server className="w-4 h-4 text-gray-500" />;
  if (lower.includes('ios') || lower.includes('android')) return <Smartphone className="w-4 h-4 text-gray-500" />;
  return <MonitorSmartphone className="w-4 h-4 text-gray-500" />;
};

export function Events() {
  const data = useActiveData();
  const { activeBranchId, branches, mergeBranch, approveBranch, selectedItemIdToEdit, setSelectedItemIdToEdit, updateEvent } = useStore();
  
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
  const [viewMode, setViewMode] = useState<'Category' | 'List'>('Category');

  // Popover / Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
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

  // Flatten and Filter events
  const flatTableData = useMemo<EventRow[]>(() => {
    const rows: EventRow[] = [];
    data.events.forEach(event => {
      const matchesSource = sourceFilters.length === 0 || event.sources.some(s => sourceFilters.includes(s.name));
      const matchesStakeholder = stakeholderFilters.length === 0 || event.stakeholderTeamIds.some(id => {
        const t = data.teams.find(tm => tm.id === id);
        return t && stakeholderFilters.includes(t.name);
      });

      if (matchesSource && matchesStakeholder) {
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
      }

      if (showEventVariants) {
        event.variants.forEach(variant => {
          if (matchesSource && matchesStakeholder) {
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
          }
        });
      }
    });
    return rows;
  }, [data.events, data.teams, showEventVariants, sourceFilters, stakeholderFilters]);

  const columns = useMemo<ColumnDef<EventRow>[]>(() => {
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
        id: 'trackingStatus',
        header: 'Status',
        cell: ({ row }) => {
          if (row.original.label === 'Variant') return null; // Status managed on Base
          const status = row.original.originalEvent.customFields?.trackingStatus || 'Draft';
          const colors = {
            'Draft': 'bg-gray-100 text-gray-600',
            'Ready': 'bg-blue-100 text-blue-700',
            'Implementing': 'bg-yellow-100 text-yellow-700',
            'Implemented': 'bg-emerald-100 text-emerald-700',
          };
          return (
            <select 
              value={status}
              onChange={e => updateEvent(row.original.originalEvent.id, { 
                customFields: { ...row.original.originalEvent.customFields, trackingStatus: e.target.value } 
              })}
              onClick={e => e.stopPropagation()}
              className={`text-[11px] font-bold px-2 py-1 rounded-full border-none focus:ring-0 cursor-pointer ${colors[status as keyof typeof colors] || colors['Draft']}`}
            >
              <option value="Draft">Draft</option>
              <option value="Ready">Ready</option>
              <option value="Implementing">Implementing</option>
              <option value="Implemented">Implemented</option>
            </select>
          );
        }
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => <span className="text-xs text-gray-500 whitespace-normal break-words block min-w-[200px]">{row.original.description || '-'}</span>,
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
      },
      {
        id: 'destinations',
        header: 'Destinations',
        cell: () => <span className="text-xs text-gray-400 italic">-</span>,
      },
      {
        id: 'metrics',
        header: 'Metrics',
        cell: () => <span className="text-xs text-gray-400 italic">-</span>,
      }
    ];
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
    const groups: Record<string, Row<EventRow>[]> = {};
    if (showEmptyCategories) {
      const allCats = new Set<string>();
      data.events.forEach(e => e.categories.forEach(c => allCats.add(c)));
      allCats.forEach(c => groups[c] = []);
    }

    table.getRowModel().rows.forEach(row => {
      const cats = row.original.categories.length ? row.original.categories : ['Uncategorized'];
      cats.forEach(cat => {
        if (!groups[cat]) groups[cat] = [];
        if (!groups[cat].find(r => r.id === row.id)) {
          groups[cat].push(row);
        }
      });
    });
    
    return Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => {
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        return a.localeCompare(b);
      })
    );
  }, [table.getRowModel().rows, showEmptyCategories, data.events]);

  const toggleSourceFilter = (source: string) => {
    setSourceFilters(prev => prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source]);
  };

  const toggleStakeholderFilter = (team: string) => {
    setStakeholderFilters(prev => prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F9FAFB] relative">
      
      <div className="px-6 py-4 border-b bg-white flex flex-col gap-4 relative z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Events <span className="text-gray-400 font-normal text-lg">({flatTableData.length})</span></h1>
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
                        {['Website', 'Backend', 'iOS', 'Android'].map(s => (
                          <label key={s} className="flex items-center gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={sourceFilters.includes(s)}
                              onChange={() => toggleSourceFilter(s)}
                              className="rounded border-gray-300 w-4 h-4 text-gray-500 focus:ring-0 cursor-pointer" 
                            />
                            <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{s}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Stakeholders</div>
                      <div className="space-y-3">
                        {['Central data team', 'Checkout team', 'Search team', 'Marketing', 'Core Product'].map(s => (
                          <label key={s} className="flex items-center gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={stakeholderFilters.includes(s)}
                              onChange={() => toggleStakeholderFilter(s)}
                              className="rounded border-gray-300 w-4 h-4 text-gray-500 focus:ring-0 cursor-pointer" 
                            />
                            <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{s}</span>
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
                    <tr className="bg-[#F8F9F9] border-y border-gray-200">
                      <td colSpan={columns.length} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <input type="checkbox" className="mt-1 rounded border-gray-300 w-4 h-4 text-gray-500 focus:ring-0" />
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
      </div>

      <Sheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        hideHeader={true}
        className="w-[1000px]" // Extra wide panel
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
  const [triggers, setTriggers] = useState<any[]>(event?.customFields?.triggers || []);
  const [activityLog, setActivityLog] = useState<{user: string, text: string, date: string}[]>(event?.customFields?.activityLog || []);

  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newComment, setNewComment] = useState('');

  // Modals inside Panel
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');
  
  const [isAddActionPopoverOpen, setIsAddActionPopoverOpen] = useState(false);
  const [isAddSourceModalOpen, setIsAddSourceModalOpen] = useState(false);
  const [isAddStakeholderOpen, setIsAddStakeholderOpen] = useState(false);
  
  // Trigger state
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [triggerImgBase64, setTriggerImgBase64] = useState<string | null>(null);
  const [triggerSource, setTriggerSource] = useState<string>('Source Independent');
  const [triggerDesc, setTriggerDesc] = useState<string>('');
  
  // Property Add Modals
  const [isAddEventPropertyModalOpen, setIsAddEventPropertyModalOpen] = useState<string | null>(null); // holds actionId
  const [isAddSystemPropertyModalOpen, setIsAddSystemPropertyModalOpen] = useState<string | null>(null); // holds actionId
  const [hoveredPropId, setHoveredPropId] = useState<string | null>(null);
  const [propSearch, setPropSearch] = useState('');

  const activeVariant = variants.find(v => v.id === variantId);

  // Helper to log changes to the activity log
  const logAction = (text: string) => {
    setActivityLog(prev => [{ user: 'You', text, date: 'Just now' }, ...prev]);
  };

  const handleAddComment = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newComment.trim()) {
      logAction(`commented: "${newComment.trim()}"`);
      setNewComment('');
    }
  };

  const handleCreateVariant = () => {
    if (!newVariantName.trim()) return;
    const newV = { id: uuidv4(), name: newVariantName, propertyOverrides: {} };
    setVariants([...variants, newV]);
    logAction(`created the variant: ${newVariantName}`);
    setIsVariantModalOpen(false);
    setNewVariantName('');
    if (onSwitchVariant) onSwitchVariant(newV.id);
  };

  const handleAddAction = (type: string) => {
    setActions([...actions, { id: uuidv4(), type, eventProperties: [], systemProperties: [], pinnedProperties: {} }]);
    logAction(`added the action ${type}`);
    setIsAddActionPopoverOpen(false);
  };

  const saveTrigger = () => {
    const newTrigger = { id: uuidv4(), image: triggerImgBase64, source: triggerSource, desc: triggerDesc };
    setTriggers([...triggers, newTrigger]);
    logAction(`added a new trigger`);
    setIsTriggerModalOpen(false);
    setTriggerImgBase64(null);
    setTriggerDesc('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(file) {
       const reader = new FileReader();
       reader.onload = (event) => setTriggerImgBase64(event.target?.result as string);
       reader.readAsDataURL(file);
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
      ownerTeamId, stakeholderTeamIds, customFields: { ...event?.customFields, triggers, activityLog }
    };

    if (isCreating) addEvent(eventData as Event);
    else if (event) updateEvent(event.id, eventData);
    
    onClose();
  };

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

  const availableEventProps = data.properties.filter(p => !actions.flatMap(a => a.eventProperties).includes(p.id));
  const availableSystemProps = data.properties.filter(p => !actions.flatMap(a => a.systemProperties).includes(p.id));
  
  const filteredAvailableProps = (isAddEventPropertyModalOpen ? availableEventProps : availableSystemProps).filter(p => p.name.toLowerCase().includes(propSearch.toLowerCase()));

  // Automatically select first item in property picker
  useEffect(() => {
    if (filteredAvailableProps.length > 0) {
       if (!hoveredPropId || !filteredAvailableProps.find(p => p.id === hoveredPropId)) {
          setHoveredPropId(filteredAvailableProps[0].id);
       }
    } else {
       setHoveredPropId(null);
    }
  }, [filteredAvailableProps, hoveredPropId]);

  return (
    <div className="flex flex-col h-full bg-white relative font-sans -mx-6 -my-6">
      
      {/* Header fixing variant layout perfectly */}
      <div className="px-8 py-6 flex justify-between items-start border-b border-gray-100 sticky top-0 bg-white z-20 shadow-sm">
        <div className="flex-1 pr-4">
          <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-2 uppercase flex items-center gap-2">
             Event {variantId ? 'Variant' : ''}
          </div>
          <div className="flex items-center w-full max-w-[800px] mb-1">
            {variantId && <span className="text-[28px] font-bold text-gray-400 mr-2 whitespace-nowrap">{name} -</span>}
            <input 
              value={variantId ? activeVariant?.name : name}
              onChange={e => {
                if (variantId) setVariants(variants.map(v => v.id === variantId ? { ...v, name: e.target.value } : v));
                else setName(e.target.value);
              }}
              className={`text-[28px] font-bold border-none px-0 h-auto focus-visible:ring-0 flex-1 min-w-0 shadow-none outline-none ${variantId ? 'text-gray-900' : 'text-gray-900'}`}
              placeholder="Event Name"
            />
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 bg-gray-50 rounded-full p-2 mt-2 shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10 pb-32">
        
        {/* Stakeholders & Ownership */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[15px] font-bold text-gray-900">Stakeholders & Ownership</h3>
            <div className="relative">
              <button onClick={() => setIsAddStakeholderOpen(!isAddStakeholderOpen)} className="text-[13px] font-semibold text-[#3E52FF] hover:underline">+ Add stakeholder</button>
              {isAddStakeholderOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsAddStakeholderOpen(false)}></div>
                  <div className="absolute top-full left-0 mt-2 w-[220px] bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-2 max-h-48 overflow-y-auto">
                    {data.teams.filter(t => !stakeholderTeamIds.includes(t.id)).map(t => (
                      <button key={t.id} onClick={() => { setStakeholderTeamIds([...stakeholderTeamIds, t.id]); logAction(`added the stakeholder ${t.name}`); setIsAddStakeholderOpen(false); }} className="w-full flex items-center px-4 py-2 hover:bg-gray-50 text-left text-[14px] font-medium text-gray-700">
                        {t.name}
                      </button>
                    ))}
                    {data.teams.filter(t => !stakeholderTeamIds.includes(t.id)).length === 0 && <div className="px-4 py-2 text-xs text-gray-500 italic">All teams added</div>}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={ownerTeamId}
              onChange={(e) => {
                setOwnerTeamId(e.target.value);
                const t = data.teams.find(tm => tm.id === e.target.value);
                if (t) logAction(`changed owner to ${t.name}`);
              }}
              className="text-[13px] font-medium border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-700 shadow-sm min-w-[160px] outline-none"
            >
              {data.teams.map(t => <option key={t.id} value={t.id}>{t.name} (Owner)</option>)}
            </select>
            {stakeholderTeamIds.map(id => {
              const team = data.teams.find(t => t.id === id);
              if (!team) return null;
              return (
                <span key={id} className="text-[13px] font-medium border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-700 shadow-sm flex items-center gap-2">
                  {team.name}
                  <button onClick={() => { setStakeholderTeamIds(stakeholderTeamIds.filter(tid => tid !== id)); logAction(`removed the stakeholder ${team.name}`); }} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3"/></button>
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
            onBlur={() => logAction('updated the description')}
            className="w-full text-[14px] text-gray-800 bg-white border border-gray-200 rounded-lg p-4 min-h-[100px] resize-y focus:outline-none focus:ring-1 focus:ring-[#3E52FF] shadow-sm leading-relaxed"
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
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 text-[13px] font-bold text-gray-700">
                {variants.length} Variant{variants.length !== 1 && 's'}
              </div>
              {variants.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {variants.map(v => (
                    <div key={v.id} className="p-4 flex items-center justify-between group hover:bg-gray-50 transition-colors">
                      <div className="cursor-pointer" onClick={() => onSwitchVariant?.(v.id)}>
                        <div className="text-[15px] font-bold text-gray-900 group-hover:text-[#3E52FF]">{v.name}</div>
                        <div className="text-[13px] font-semibold text-[#3E52FF] mt-1.5">{Object.keys(v.propertyOverrides).length} Overrides</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] bg-gray-100 text-gray-500 px-3 py-1 rounded-full border border-gray-200 font-medium">Website</span>
                        <button onClick={() => { setVariants(variants.filter(x => x.id !== v.id)); logAction(`removed variant ${v.name}`); }} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[14px] text-gray-500 bg-white p-5 text-center italic">No variants created.</div>
              )}
            </div>
          </div>
        )}

        {/* Functional Triggers Section */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[15px] font-bold text-gray-900">Triggered when</h3>
            <button onClick={() => setIsTriggerModalOpen(true)} className="text-[13px] font-semibold text-[#3E52FF] hover:underline">+ New Trigger</button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {triggers.length > 0 ? triggers.map(t => (
              <div key={t.id} className="border border-gray-200 rounded-lg p-4 w-48 bg-white flex flex-col gap-2 shrink-0 shadow-sm cursor-pointer hover:border-gray-300 transition-colors relative group">
                <button onClick={() => { setTriggers(triggers.filter(x => x.id !== t.id)); logAction('removed a trigger'); }} className="absolute top-2 right-2 text-white bg-black/50 p-1 rounded opacity-0 group-hover:opacity-100 z-10 hover:bg-red-500"><X className="w-3 h-3" /></button>
                <div className="w-full h-28 bg-gray-50 rounded-md flex items-center justify-center border border-gray-100 overflow-hidden relative">
                   {t.image ? <img src={t.image} className="object-cover w-full h-full" alt="Trigger" /> : <ImageIcon className="w-8 h-8 text-gray-300" />}
                </div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-2">{t.source || 'Source Independent'}</div>
                <div className="text-[14px] font-bold text-gray-900 leading-tight line-clamp-2">{t.name || 'Unnamed trigger'}</div>
                <div className="text-[12px] text-gray-500 line-clamp-1">{t.desc || 'No description...'}</div>
              </div>
            )) : (
              <div className="text-[13px] text-gray-500 italic p-1">No triggers defined. Add a trigger to show exactly when this event fires.</div>
            )}
          </div>
        </div>

        {/* Sources */}
        <div>
          <div className="flex items-center gap-3 mb-3 relative">
            <h3 className="text-[15px] font-bold text-gray-900">Sources</h3>
            {variantId && <button className="text-[#3E52FF] text-[13px] font-semibold hover:underline">Edit on variant</button>}
          </div>
          
          {sources.length === 0 ? (
             <div className="border border-orange-300 bg-orange-50 text-orange-700 p-4 rounded-lg text-[14px] font-medium mb-3">
               This event is not sent from any source yet
             </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {data.sources.map(source => {
                const isSelected = sources.find(s => s.id === source.id);
                if (!isSelected && variantId) return null;
                
                return (
                  <div 
                    key={source.id} 
                    className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-sm cursor-pointer transition-colors ${isSelected ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                    onClick={() => {
                      if (!variantId) {
                        if (isSelected) {
                           setSources(sources.filter(s => s.id !== source.id));
                           logAction(`removed the source ${source.name}`);
                        } else {
                           setSources([...sources, source]);
                           logAction(`added the source ${source.name}`);
                        }
                      }
                    }}
                  >
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                    <span className={`text-[14px] font-bold ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>{source.name}</span>
                    {isSelected && (
                      <div className="w-[16px] h-[16px] rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-bold ml-2 shadow-sm">P</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          <div className="relative mt-3">
            {!variantId && (
              <button onClick={() => setIsAddSourceModalOpen(!isAddSourceModalOpen)} className="text-[#3E52FF] text-[14px] font-semibold hover:underline">+ Add Source</button>
            )}
            {isAddSourceModalOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsAddSourceModalOpen(false)}></div>
                <div className="absolute top-full left-0 mt-2 w-[220px] bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-2">
                   {data.sources.map(s => (
                     <button key={s.id} onClick={() => { if(!sources.find(x => x.id === s.id)) { setSources([...sources, s]); logAction(`added the source ${s.name}`); } setIsAddSourceModalOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left text-[14px] font-medium text-gray-700">
                       {getSourceIcon(s.name)}
                       {s.name}
                     </button>
                   ))}
                   <div className="border-t border-gray-100 mt-1 pt-1">
                     <button className="w-full flex items-center px-4 py-2.5 text-left text-[14px] font-semibold text-[#3E52FF] hover:underline">
                       + Set Up New Source
                     </button>
                   </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions & Properties */}
        <div>
          <div className="flex items-center justify-between mb-3 relative">
            <h3 className="text-[15px] font-bold text-gray-900">Actions</h3>
          </div>

          {actions.length === 0 ? (
             <div className="border border-red-200 bg-red-50 p-5 rounded-lg mb-4">
               <div className="font-bold text-[14px] text-red-600">No Actions</div>
               <div className="text-[13px] text-red-500 mt-1">Nothing will happen when this Avo function is called since no actions have been defined.</div>
             </div>
          ) : (
            <div className="space-y-5">
              {actions.map((action, idx) => (
                <div key={action.id} className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                  <div className="bg-white px-6 py-5 border-b border-gray-100 flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5 w-8 h-8 rounded border border-gray-200 bg-white flex items-center justify-center text-gray-400 shadow-sm shrink-0">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        {!variantId ? (
                          <select
                            value={action.type}
                            onChange={(e) => {
                               setActions(actions.map(a => a.id === action.id ? { ...a, type: e.target.value } : a));
                               logAction(`changed action to ${e.target.value}`);
                            }}
                            className="font-bold text-[16px] text-gray-900 bg-transparent border-none focus:ring-0 p-0 hover:bg-gray-50 rounded transition-colors -ml-1 cursor-pointer"
                          >
                            <option value="Log Event">Log Event</option>
                            <option value="Log Page View">Log Page View</option>
                            <option value="Identify User">Identify User</option>
                            <option value="Update User Properties">Update User Properties</option>
                            <option value="Update Group">Update Group</option>
                            <option value="Log Revenue">Log Revenue</option>
                          </select>
                        ) : (
                          <div className="font-bold text-[16px] text-gray-900">{action.type}</div>
                        )}
                        <div className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">Send an event to your analytics tool by calling the corresponding tracking method in your analytics SDK or API.</div>
                      </div>
                    </div>
                    {!variantId && (
                       <button onClick={() => { setActions(actions.filter(a => a.id !== action.id)); logAction('removed an action'); }} className="text-gray-400 hover:text-red-500 mt-1"><Trash2 className="w-5 h-5" /></button>
                    )}
                  </div>
                  
                  <div className="p-6 space-y-8 bg-white">
                    {/* Event Properties */}
                    <div>
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">Event Properties</div>
                      
                      <div className="space-y-5">
                        {action.eventProperties.map(propId => {
                          const prop = data.properties.find(p => p.id === propId);
                          if (!prop) return null;
                          const override = variantId ? activeVariant?.propertyOverrides[propId] : undefined;
                          const presence = override?.presence || prop.attached_events.find(e => e.eventId === event?.id)?.presence || 'Always sent';
                          const isPinned = !!override?.constraints;
                          
                          return (
                            <div key={propId} className="flex flex-col group border-b border-gray-100 pb-5 last:border-0 last:pb-0">
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-[14px] text-gray-900">{prop.name}</span>
                                <span className="font-mono text-[11px] text-gray-500 font-medium">{prop.property_value_type}</span>
                                <span className="text-[12px] text-gray-600 font-medium">{presence}</span>
                                {isPinned && <span className="text-[11px] font-bold text-emerald-700 ml-auto bg-emerald-50 px-2.5 py-1 rounded border border-emerald-100">Pinned to "{override.constraints}" (on this event variant)</span>}
                                {!variantId && (
                                   <button onClick={() => { setActions(actions.map(a => a.id === action.id ? { ...a, eventProperties: a.eventProperties.filter(id => id !== propId) } : a)); logAction(`removed property ${prop.name}`); }} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 ml-2"><X className="w-4 h-4"/></button>
                                )}
                              </div>
                              <div className="text-[13px] text-gray-500 mt-2">{prop.description}</div>
                            </div>
                          );
                        })}
                        {action.eventProperties.length === 0 && <div className="text-xs text-gray-400 italic">No event properties attached.</div>}
                      </div>
                      
                      <div className="relative mt-5">
                        {!variantId ? (
                          <button onClick={() => { setIsAddEventPropertyModalOpen(action.id); setPropSearch(''); }} className="text-[#3E52FF] text-[14px] font-semibold hover:underline">+ Add Event Property</button>
                        ) : (
                          <button onClick={() => { setIsAddEventPropertyModalOpen(action.id); setPropSearch(''); }} className="text-[#3E52FF] text-[14px] font-semibold hover:underline">+ Add Event Property to Variant</button>
                        )}
                      </div>
                    </div>

                    {/* System Properties */}
                    <div>
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">System Properties</div>
                      <div className="space-y-5">
                        {action.systemProperties.map(propId => {
                          const prop = data.properties.find(p => p.id === propId);
                          if (!prop) return null;
                          return (
                            <div key={propId} className="flex flex-col group border-b border-gray-100 pb-5 last:border-0 last:pb-0">
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-[14px] text-gray-900">{prop.name}</span>
                                <span className="font-mono text-[11px] text-gray-500 font-medium">{prop.property_value_type}</span>
                                <span className="text-[12px] text-gray-600 font-medium">Always sent</span>
                                {!variantId && (
                                   <button onClick={() => { setActions(actions.map(a => a.id === action.id ? { ...a, systemProperties: a.systemProperties.filter(id => id !== propId) } : a)); logAction(`removed system property ${prop.name}`); }} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 ml-auto"><X className="w-4 h-4"/></button>
                                )}
                              </div>
                              <div className="text-[13px] text-gray-500 mt-2">{prop.description}</div>
                            </div>
                          );
                        })}
                        {action.systemProperties.length === 0 && <div className="text-xs text-gray-400 italic">No system properties attached.</div>}
                      </div>
                      <div className="relative mt-5">
                        {!variantId && (
                          <button onClick={() => { setIsAddSystemPropertyModalOpen(action.id); setPropSearch(''); }} className="text-[#3E52FF] text-[14px] font-semibold hover:underline">+ Add System Property</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="relative mt-5">
            {!variantId && (
              <button onClick={() => setIsAddActionPopoverOpen(!isAddActionPopoverOpen)} className="text-[#3E52FF] text-[15px] font-bold hover:underline border border-blue-200 bg-blue-50 px-4 py-2 rounded-lg">+ Add Action</button>
            )}
            {isAddActionPopoverOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsAddActionPopoverOpen(false)}></div>
                <div className="absolute top-full left-0 mt-2 w-[480px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2 max-h-[400px] overflow-y-auto">
                  
                  <button onClick={() => handleAddAction('Log Event')} className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors">
                    <MessageSquare className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                       <div className="font-bold text-[14px] text-gray-900">Log Event</div>
                       <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">Send an event to your analytics tool by calling the corresponding tracking method in your analytics SDK or API.</div>
                    </div>
                  </button>

                  <button onClick={() => handleAddAction('Update User Properties')} className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors">
                    <UserPlus className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                       <div className="font-bold text-[14px] text-gray-900">Update User Properties</div>
                       <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">Add one or more user properties that should be attached to the user's profile in your analytics tool.</div>
                    </div>
                  </button>

                  <button onClick={() => handleAddAction('Update Group')} className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors">
                    <Users className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                       <div className="font-bold text-[14px] text-gray-900">Update group</div>
                       <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">Associate users with groups and/or update group properties. All events sent after this event will tie the user to the identified group.</div>
                    </div>
                  </button>

                  <button onClick={() => handleAddAction('Identify User')} className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors">
                    <UserCheck className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                       <div className="font-bold text-[14px] text-gray-900">Identify User</div>
                       <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">Identify the user in your analytics tool such that they go from anonymous to a user with a user id.</div>
                    </div>
                  </button>

                  <button onClick={() => handleAddAction('Unidentify User')} className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors">
                    <UserMinus className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                       <div className="font-bold text-[14px] text-gray-900">Unidentify User</div>
                       <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">Unidentify the user in your analytics tool such that they go from an identified user with a user id to an anonymous user</div>
                    </div>
                  </button>

                  <button onClick={() => handleAddAction('Log Revenue')} className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors">
                    <DollarSign className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                       <div className="font-bold text-[14px] text-gray-900">Log Revenue</div>
                       <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">Track revenue in your analytics tool to be able to use its revenue analysis.</div>
                    </div>
                  </button>

                  <button onClick={() => handleAddAction('Log Page View')} className="w-full flex items-start gap-4 p-4 hover:bg-gray-50 rounded-lg text-left transition-colors">
                    <AppWindow className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                       <div className="font-bold text-[14px] text-gray-900">Log Page View</div>
                       <div className="text-[12px] text-gray-500 mt-1 leading-relaxed">Track page view in your analytics tool to be able use their automatic page tracking capabilities.</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Categories & Tags */}
        <div className="grid grid-cols-1 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-[15px] font-bold text-gray-800">Categories</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <span key={cat} className="flex items-center gap-2 text-[13px] font-medium bg-blue-50 text-blue-700 px-3 py-1.5 rounded border border-blue-100">
                  {cat}
                  <button onClick={() => { setCategories(categories.filter(c => c !== cat)); logAction(`removed category ${cat}`); }}><X className="w-3 h-3 hover:text-red-500" /></button>
                </span>
              ))}
              {!variantId && (
                <div className="flex items-center">
                   <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { addCategory(); logAction(`added category ${newCategory}`); } }} placeholder="+ Add Category..." className="h-9 text-[13px] border-dashed w-40 border-gray-300" />
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-[15px] font-bold text-gray-800">Tags</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-2 text-[13px] font-medium bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded border border-emerald-100">
                  {tag}
                  <button onClick={() => { setTags(tags.filter(t => t !== tag)); logAction(`removed tag ${tag}`); }}><X className="w-3 h-3 hover:text-red-500" /></button>
                </span>
              ))}
              {!variantId && (
                <div className="flex items-center">
                   <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { addTag(); logAction(`added tag ${newTag}`); } }} placeholder="+ Add tag..." className="h-9 text-[13px] border-dashed w-40 border-gray-300" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tracking Code Snippet */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-[15px] font-bold text-gray-800 flex items-center gap-2">
              <Code className="w-4 h-4 text-gray-400" /> Tracking Code
            </h3>
          </div>
          <div className="bg-[#2A2A2A] rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-[#333333] text-[12px] font-bold text-gray-300 border-b border-[#444] flex justify-between">
              <span>Website - Javascript (Codegen)</span>
            </div>
            <pre className="p-5 text-[13px] font-mono text-[#E0E0E0] overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {generateCodegen()}
            </pre>
            <div className="px-5 py-3 bg-[#222222] text-[12px] text-gray-400 font-mono flex items-center gap-3 border-t border-[#111]">
              <span className="text-gray-500">Codegen using Avo CLI:</span>
              <span className="text-white font-semibold">$ avo pull --branch main "Website"</span>
            </div>
          </div>
        </div>

        {/* Real History Log */}
        <div className="mt-12 border-t border-gray-200 pt-8 pb-8">
          <div className="text-[14px] text-gray-700 space-y-3 font-medium">
            {activityLog.map((log, i) => (
              <p key={i} className="flex items-start gap-2">
                 <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">JA</div>
                 <span><strong className="text-gray-900">{log.user}</strong> {log.text} <span className="text-gray-400 font-normal ml-1">{log.date}</span></span>
              </p>
            ))}
            {activityLog.length === 0 && (
              <p className="text-center text-gray-400 italic">No activity yet.</p>
            )}
          </div>
        </div>

      </div>

      {/* Footer Comment Input & Save Buttons */}
      <div className="absolute bottom-0 w-full bg-white border-t border-gray-200 p-4 flex gap-4 items-center shadow-[0_-4px_15px_-1px_rgba(0,0,0,0.05)] z-40 px-8">
         <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">JA</div>
         <input 
           placeholder="Write a comment on this event... (Press Enter to post)" 
           className="flex-1 text-[14px] bg-transparent border-none focus:ring-0 outline-none text-gray-800 placeholder:text-gray-400"
           value={newComment}
           onChange={(e) => setNewComment(e.target.value)}
           onKeyDown={handleAddComment}
         />
         <div className="flex gap-3">
            {!isCreating && event && !variantId && (
              <Button variant="outline" onClick={() => { deleteEvent(event.id); onClose(); }} className="h-10 text-[14px] font-bold text-red-600 border-red-200 hover:bg-red-50 px-5">
                Archive Event
              </Button>
            )}
            <Button onClick={handleSave} className="h-10 text-[14px] font-bold bg-[#3E52FF] hover:bg-blue-600 shadow-sm rounded-lg px-8">Save</Button>
         </div>
      </div>

      {/* Modals placed inside to overlay properly */}

      {/* Create Event Variant Modal */}
      {isVariantModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-[500px] overflow-hidden">
            <div className="p-8">
               <h2 className="text-2xl font-bold text-gray-900 mb-2">Create event variant</h2>
               <p className="text-[15px] text-gray-700 leading-relaxed mb-6">
                 Give the variant a descriptive name. It will not impact how the event name is sent to destinations.
               </p>
               
               <div className="flex items-center gap-2">
                 <span className="text-[15px] font-bold text-gray-900 whitespace-nowrap">{name} -</span>
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
            <div className="px-8 py-5 bg-white flex justify-end gap-3 border-t border-gray-100">
               <Button variant="outline" onClick={() => setIsVariantModalOpen(false)} className="h-10 px-6 text-[15px] text-gray-600 border-gray-300 rounded-lg">Cancel</Button>
               <Button onClick={handleCreateVariant} disabled={!newVariantName.trim()} className="h-10 px-6 text-[15px] bg-[#C1C3C8] text-white disabled:opacity-100 rounded-lg border-none shadow-none font-bold data-[valid=true]:bg-[#3E52FF]" data-valid={!!newVariantName.trim()}>Create variant</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Trigger Modal */}
      {isTriggerModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl w-[900px] h-[600px] flex overflow-hidden">
             {/* Left Upload Area */}
             <div className="flex-1 p-8 flex flex-col items-center justify-center border-r border-gray-200 bg-white">
               {!triggerImgBase64 ? (
                 <label className="w-[500px] h-[400px] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center bg-white cursor-pointer hover:bg-gray-50 transition-colors">
                    <ImageIcon className="w-12 h-12 text-gray-400 mb-4" />
                    <div className="text-[15px] font-bold text-gray-600">Select an image to upload</div>
                    <div className="text-[13px] text-gray-500 mt-1">or drag and drop it here</div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                 </label>
               ) : (
                 <div className="w-[500px] h-[400px] relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center">
                    <img src={triggerImgBase64} alt="Trigger Preview" className="max-w-full max-h-full object-contain" />
                    <button onClick={() => setTriggerImgBase64(null)} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded hover:bg-red-500"><X className="w-4 h-4"/></button>
                 </div>
               )}
             </div>
             {/* Right Form Area */}
             <div className="w-[300px] bg-white flex flex-col">
               <div className="flex justify-center p-3 border-b border-gray-100 bg-gray-50">
                 <div className="text-xs bg-gray-200 text-gray-600 font-bold px-3 py-1 rounded-full">New Trigger</div>
               </div>
               <div className="p-6 space-y-6 flex-1">
                 <div>
                   <div className="flex items-center justify-between mb-2">
                     <span className="text-[13px] font-bold text-gray-700">Sources</span>
                   </div>
                   <select 
                     className="w-full border border-gray-200 rounded-full px-3 py-1.5 text-[12px] text-gray-600 font-medium outline-none"
                     value={triggerSource}
                     onChange={e => setTriggerSource(e.target.value)}
                   >
                     <option value="Source Independent">Source Independent</option>
                     {data.sources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                   </select>
                 </div>
                 <div>
                   <div className="text-[13px] font-bold text-gray-700 mb-2">Trigger Description</div>
                   <textarea 
                     className="w-full text-[13px] border-none focus:ring-0 resize-none h-32 italic text-gray-600 p-0 outline-none placeholder:text-gray-400" 
                     placeholder="Trigger description..." 
                     value={triggerDesc}
                     onChange={e => setTriggerDesc(e.target.value)}
                   />
                 </div>
               </div>
               <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                 <Button variant="outline" onClick={() => setIsTriggerModalOpen(false)}>Cancel</Button>
                 <Button onClick={saveTrigger}>Save</Button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Add Property Modal */}
      {(isAddEventPropertyModalOpen || isAddSystemPropertyModalOpen) && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
           <div className="bg-white rounded-xl shadow-2xl w-[800px] h-[500px] flex overflow-hidden flex-col">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Add {isAddEventPropertyModalOpen ? 'Event' : 'System'} Property</h2>
                <button onClick={() => {setIsAddEventPropertyModalOpen(null); setIsAddSystemPropertyModalOpen(null); setPropSearch(''); }} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5"/></button>
              </div>
              <div className="flex-1 flex overflow-hidden">
                {/* Property List */}
                <div className="w-[350px] border-r border-gray-100 flex flex-col">
                  <div className="p-4 border-b border-gray-50">
                    <Input 
                       placeholder="Search properties..." 
                       value={propSearch}
                       onChange={e => setPropSearch(e.target.value)}
                       autoFocus
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {filteredAvailableProps.map(p => (
                      <div 
                        key={p.id} 
                        onMouseEnter={() => setHoveredPropId(p.id)}
                        onClick={() => {
                          const actionId = isAddEventPropertyModalOpen || isAddSystemPropertyModalOpen;
                          const listType = isAddEventPropertyModalOpen ? 'eventProperties' : 'systemProperties';
                          if(actionId) {
                            setActions(actions.map(a => a.id === actionId && !a[listType].includes(p.id) ? { ...a, [listType]: [...a[listType], p.id] } : a));
                            logAction(`added property ${p.name}`);
                          }
                          setIsAddEventPropertyModalOpen(null);
                          setIsAddSystemPropertyModalOpen(null);
                          setPropSearch('');
                        }}
                        className={`px-4 py-3 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${hoveredPropId === p.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <span className="font-bold text-[14px] text-gray-800">{p.name}</span>
                      </div>
                    ))}
                    {filteredAvailableProps.length === 0 && (
                      <div className="text-sm text-gray-500 text-center p-6">No available properties to add.</div>
                    )}
                  </div>
                </div>
                {/* Hover Details */}
                <div className="flex-1 bg-white p-8 flex flex-col justify-center">
                  {hoveredPropId ? (() => {
                    const hp = data.properties.find(p => p.id === hoveredPropId);
                    return hp ? (
                      <div className="mb-auto mt-4">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">{hp.name}</h3>
                        <div className="font-mono text-[12px] font-medium text-[#3E52FF] mb-6 bg-blue-50 inline-block self-start px-2 py-1 rounded">{hp.property_value_type}</div>
                        <p className="text-[15px] text-gray-700 leading-relaxed">{hp.description || 'No description provided.'}</p>
                      </div>
                    ) : null;
                  })() : (
                    <div className="m-auto text-sm text-gray-400 italic">Search and hover over a property to see details</div>
                  )}
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}