import React, { useState, useMemo } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Event, Source, EventAction, EventVariant, PresenceRule } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import { Sheet } from '@/src/components/ui/Sheet';
import { Search, Plus, Trash2, AlertCircle, GitMerge, CheckCircle2, X, Settings2, Columns, Filter } from 'lucide-react';
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

export function Events() {
  const data = useActiveData();
  const { activeBranchId, branches, mergeBranch, approveBranch, selectedItemIdToEdit, setSelectedItemIdToEdit } = useStore();
  
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  React.useEffect(() => {
    if (selectedItemIdToEdit) {
      const event = data.events.find(e => e.id === selectedItemIdToEdit);
      if (event) {
        setSelectedEventId(event.id);
        setIsCreating(false);
        setIsSheetOpen(true);
        setSelectedItemIdToEdit(null);
      }
    }
  }, [selectedItemIdToEdit, data.events, setSelectedItemIdToEdit]);

  const handleOpenEvent = (id: string) => {
    setSelectedEventId(id);
    setIsCreating(false);
    setIsSheetOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedEventId(null);
    setIsCreating(true);
    setIsSheetOpen(true);
  };

  const selectedEvent = selectedEventId ? data.events.find(e => e.id === selectedEventId) : null;
  const activeBranch = branches.find(b => b.id === activeBranchId);

  // Diff logic
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

  const columns = useMemo<ColumnDef<Event>[]>(() => {
    const baseCols: ColumnDef<Event>[] = [
      {
        accessorKey: 'name',
        header: 'Event Name',
        cell: info => {
          const event = info.row.original;
          const isNew = diff?.newEvents.some(e => e.id === event.id);
          const isModified = diff?.modifiedEvents.some(e => e.id === event.id);
          return (
            <div className="flex items-center gap-2">
              {isNew && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
              {isModified && <span className="w-2 h-2 rounded-full bg-purple-400"></span>}
              <span className="font-mono font-medium text-blue-600 cursor-pointer hover:underline" onClick={() => handleOpenEvent(event.id)}>
                {info.getValue() as string}
              </span>
              {event.variants.length > 0 && <Badge variant="outline" className="text-[10px]">{event.variants.length} Variants</Badge>}
            </div>
          );
        },
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: info => <span className="text-gray-500 truncate max-w-[200px] block">{info.getValue() as string}</span>,
      },
      {
        accessorKey: 'categories',
        header: 'Categories',
        cell: info => {
          const cats = info.getValue() as string[];
          return <div className="flex gap-1 flex-wrap">{cats.map(c => <Badge key={c} variant="secondary">{c}</Badge>)}</div>;
        },
        filterFn: 'arrIncludesSome',
      },
      {
        accessorKey: 'sources',
        header: 'Sources',
        cell: info => {
          const srcs = info.getValue() as Source[];
          return <div className="flex gap-1 flex-wrap">{srcs.map(s => <Badge key={s.id} variant="outline">{s.name}</Badge>)}</div>;
        },
        filterFn: (row, columnId, filterValue) => {
          const sources = row.getValue(columnId) as Source[];
          return sources.some(s => filterValue.includes(s.id));
        }
      },
      {
        accessorKey: 'ownerTeamId',
        header: 'Owner',
        cell: info => {
          const teamId = info.getValue() as string;
          const team = data.teams.find(t => t.id === teamId);
          return team ? <Badge>{team.name}</Badge> : <span className="text-gray-400 italic">Unassigned</span>;
        },
        filterFn: 'equals',
      },
    ];

    const customCols: ColumnDef<Event>[] = data.settings.customEventFields.map(cf => ({
      id: `custom_${cf.id}`,
      accessorFn: row => row.customFields?.[cf.id],
      header: cf.name,
      cell: info => {
        const val = info.getValue();
        if (cf.type === 'url' && val) {
          return <a href={val as string} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Link</a>;
        }
        return <span>{val !== undefined ? String(val) : '-'}</span>;
      }
    }));

    return [...baseCols, ...customCols];
  }, [data.teams, data.settings.customEventFields, diff]);

  const table = useReactTable({
    data: data.events,
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

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your tracking plan events.</p>
        </div>
        <div className="flex gap-3">
          {activeBranchId !== 'main' && (
            <Button 
              variant={canMerge ? "default" : "secondary"}
              onClick={() => canMerge && mergeBranch(activeBranchId)}
              disabled={!canMerge}
              className="gap-2"
            >
              <GitMerge className="w-4 h-4" /> Merge Branch
            </Button>
          )}
          <Button onClick={handleCreateNew} className="gap-2">
            <Plus className="w-4 h-4" /> Add Event
          </Button>
        </div>
      </div>

      <div className="p-8 flex-1 overflow-hidden flex flex-col">
        {diff && (diff.newEvents.length > 0 || diff.modifiedEvents.length > 0) && (
          <div className="mb-8 p-4 bg-white border rounded-lg shadow-sm shrink-0">
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
                Impacted Stakeholders:{' '}
                <span className="font-medium">
                  {Array.from(new Set([...diff.newEvents, ...diff.modifiedEvents].flatMap(e => e.stakeholderTeamIds)))
                    .map(id => data.teams.find(t => t.id === id)?.name)
                    .filter(Boolean)
                    .join(', ') || 'None'}
                </span>
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

        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search events..."
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative group">
              <Button variant="outline" className="gap-2">
                <Columns className="w-4 h-4" /> Customize Columns
              </Button>
              <div className="absolute right-0 mt-2 w-48 bg-white border rounded-md shadow-lg p-2 hidden group-hover:block z-50">
                {table.getAllLeafColumns().map(column => {
                  return (
                    <div key={column.id} className="px-1 py-1">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          {...{
                            type: 'checkbox',
                            checked: column.getIsVisible(),
                            onChange: column.getToggleVisibilityHandler(),
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {column.columnDef.header as string}
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg shadow-sm flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y">
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500">
                    No events found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 flex items-center justify-between shrink-0">
          <div className="text-sm text-gray-500">
            Showing {table.getRowModel().rows.length} of {data.events.length} events
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <Sheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title={isCreating ? "Create Event" : "Edit Event"}
      >
        {isSheetOpen && (
          <EventEditor
            event={selectedEvent}
            isCreating={isCreating}
            onClose={() => setIsSheetOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}

function EventEditor({ event, isCreating, onClose }: { event: Event | null | undefined, isCreating: boolean, onClose: () => void }) {
  const data = useActiveData();
  const { addEvent, updateEvent, deleteEvent, auditConfig } = useStore();
  
  const [name, setName] = useState(event?.name || '');
  const [description, setDescription] = useState(event?.description || '');
  const [categories, setCategories] = useState<string[]>(event?.categories || []);
  const [tags, setTags] = useState<string[]>(event?.tags || []);
  const [sources, setSources] = useState<Source[]>(event?.sources || []);
  const [actions, setActions] = useState<EventAction[]>(event?.actions || [{ id: uuidv4(), type: 'Log Event', eventProperties: [], systemProperties: [], pinnedProperties: {} }]);
  const [variants, setVariants] = useState<EventVariant[]>(event?.variants || []);
  const [ownerTeamId, setOwnerTeamId] = useState<string>(event?.ownerTeamId || data.teams[0]?.id || '');
  const [stakeholderTeamIds, setStakeholderTeamIds] = useState<string[]>(event?.stakeholderTeamIds || []);
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
  
  if (suggestedName === name) {
    suggestedName = null;
  }

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

    if (isCreating) {
      addEvent(eventData as Event);
    } else if (event) {
      updateEvent(event.id, eventData);
    }
    onClose();
  };

  const handleDelete = () => {
    if (event) {
      deleteEvent(event.id);
      onClose();
    }
  };

  const toggleSource = (source: Source) => {
    setSources(prev => prev.find(s => s.id === source.id) ? prev.filter(s => s.id !== source.id) : [...prev, source]);
  };

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

  const addAction = () => {
    setActions([...actions, { id: uuidv4(), type: 'Log Event', eventProperties: [], systemProperties: [], pinnedProperties: {} }]);
  };

  const removeAction = (id: string) => {
    setActions(actions.filter(a => a.id !== id));
  };

  const updateActionType = (id: string, type: string) => {
    setActions(actions.map(a => a.id === id ? { ...a, type } : a));
  };

  const addPropertyToAction = (actionId: string, propId: string, listType: 'eventProperties' | 'systemProperties') => {
    setActions(actions.map(a => {
      if (a.id === actionId && !a[listType].includes(propId)) {
        return { ...a, [listType]: [...a[listType], propId] };
      }
      return a;
    }));
  };

  const removePropertyFromAction = (actionId: string, propId: string, listType: 'eventProperties' | 'systemProperties') => {
    setActions(actions.map(a => {
      if (a.id === actionId) {
        return { ...a, [listType]: a[listType].filter(id => id !== propId) };
      }
      return a;
    }));
  };

  const addVariant = () => {
    setVariants([...variants, { id: uuidv4(), name: 'New Variant', propertyOverrides: {} }]);
  };

  const removeVariant = (id: string) => {
    setVariants(variants.filter(v => v.id !== id));
  };

  const updateVariantName = (id: string, name: string) => {
    setVariants(variants.map(v => v.id === id ? { ...v, name } : v));
  };

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Event Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`e.g. ${auditConfig.eventNaming === 'snake_case' ? 'user_signed_up' : 'User Signed Up'}`}
        />
        {suggestedName && name.trim().length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded-md border border-gray-200">
            <AlertCircle className="w-4 h-4" />
            <span>Format:</span>
            <button onClick={() => setName(suggestedName!)} className="text-xs font-mono bg-white border px-1.5 py-0.5 rounded hover:bg-gray-100">
              {suggestedName}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="What does this event represent?"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Owner Team</label>
          <select
            value={ownerTeamId}
            onChange={(e) => setOwnerTeamId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select Owner...</option>
            {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Stakeholder Teams</label>
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
                  className="rounded border-gray-300 text-blue-600"
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      {data.settings.customEventFields.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2">Custom Fields</h3>
          <div className="grid grid-cols-2 gap-4">
            {data.settings.customEventFields.map(cf => (
              <div key={cf.id}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{cf.name}</label>
                {cf.type === 'boolean' ? (
                  <select
                    value={customFields[cf.id] !== undefined ? String(customFields[cf.id]) : ''}
                    onChange={e => setCustomFields({ ...customFields, [cf.id]: e.target.value === 'true' })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Sources</label>
        <div className="flex flex-wrap gap-2">
          {data.sources.map(source => (
            <button
              key={source.id}
              onClick={() => toggleSource(source)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                sources.find(s => s.id === source.id)
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {source.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Categories</label>
        <div className="flex gap-2">
          <Input 
            value={newCategory} 
            onChange={(e) => setNewCategory(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            placeholder="Add category..." 
          />
          <Button type="button" onClick={addCategory} variant="outline">Add</Button>
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
        <label className="text-sm font-medium text-gray-700">Tags</label>
        <div className="flex gap-2">
          <Input 
            value={newTag} 
            onChange={(e) => setNewTag(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="Add tag..." 
          />
          <Button type="button" onClick={addTag} variant="outline">Add</Button>
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

      {/* Actions Block */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Actions</label>
          <Button variant="outline" size="sm" onClick={addAction} className="h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Add Action
          </Button>
        </div>
        
        <div className="space-y-4">
          {actions.map((action, index) => (
            <div key={action.id} className="border rounded-md p-4 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Action {index + 1}</span>
                  <select
                    value={action.type}
                    onChange={(e) => updateActionType(action.id, e.target.value)}
                    className="border-none bg-gray-50 rounded px-2 py-1 text-sm font-medium focus:ring-0"
                  >
                    <option value="Log Event">Log Event</option>
                    <option value="Log Page View">Log Page View</option>
                    <option value="Identify User">Identify User</option>
                    <option value="Update Group">Update Group</option>
                  </select>
                </div>
                <button onClick={() => removeAction(action.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Event Properties */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700">Event Properties</label>
                    <div className="flex gap-2">
                      <select 
                        className="text-[10px] border rounded px-1 py-0.5 bg-gray-50"
                        onChange={(e) => {
                          if (e.target.value) {
                            const bundle = data.propertyBundles.find(b => b.id === e.target.value);
                            if (bundle) {
                              setActions(actions.map(a => {
                                if (a.id === action.id) {
                                  const newProps = new Set([...a.eventProperties, ...bundle.propertyIds]);
                                  return { ...a, eventProperties: Array.from(newProps) };
                                }
                                return a;
                              }));
                            }
                            e.target.value = '';
                          }
                        }}
                        value=""
                      >
                        <option value="">+ Add Bundle</option>
                        {data.propertyBundles.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                      <select 
                        className="text-[10px] border rounded px-1 py-0.5 bg-gray-50"
                        onChange={(e) => {
                          if (e.target.value) {
                            addPropertyToAction(action.id, e.target.value, 'eventProperties');
                            e.target.value = '';
                          }
                        }}
                        value=""
                      >
                        <option value="">+ Add Property</option>
                        {data.properties.filter(p => !action.eventProperties.includes(p.id)).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="border rounded-md divide-y bg-gray-50 min-h-[60px]">
                    {action.eventProperties.map(propId => {
                      const prop = data.properties.find(p => p.id === propId);
                      if (!prop) return null;
                      return (
                        <div key={propId} className="p-2 flex items-center justify-between text-xs group">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{prop.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-6 text-[10px] w-24 px-1"
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
                            <button onClick={() => removePropertyFromAction(action.id, propId, 'eventProperties')} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {action.eventProperties.length === 0 && (
                      <div className="p-2 text-xs text-gray-400 italic text-center">No event properties</div>
                    )}
                  </div>
                </div>

                {/* System Properties */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700">System Properties</label>
                    <select 
                      className="text-[10px] border rounded px-1 py-0.5 bg-gray-50"
                      onChange={(e) => {
                        if (e.target.value) {
                          addPropertyToAction(action.id, e.target.value, 'systemProperties');
                          e.target.value = '';
                        }
                      }}
                      value=""
                    >
                      <option value="">+ Add Property</option>
                      {data.properties.filter(p => !action.systemProperties.includes(p.id)).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="border rounded-md divide-y bg-gray-50 min-h-[60px]">
                    {action.systemProperties.map(propId => {
                      const prop = data.properties.find(p => p.id === propId);
                      if (!prop) return null;
                      return (
                        <div key={propId} className="p-2 flex items-center justify-between text-xs group">
                          <span className="font-mono font-medium">{prop.name}</span>
                          <button onClick={() => removePropertyFromAction(action.id, propId, 'systemProperties')} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                    {action.systemProperties.length === 0 && (
                      <div className="p-2 text-xs text-gray-400 italic text-center">No system properties</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {actions.length === 0 && (
            <div className="p-4 text-sm text-gray-500 text-center bg-gray-50 border rounded-md border-dashed">
              No actions defined. Add an action to attach properties.
            </div>
          )}
        </div>
      </div>

      {/* Variants Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Variants</label>
          <Button variant="outline" size="sm" onClick={addVariant} className="h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Add Variant
          </Button>
        </div>
        {variants.length > 0 ? (
          <div className="space-y-4">
            {variants.map(variant => (
              <div key={variant.id} className="border rounded-md p-4 bg-gray-50 space-y-4">
                <div className="flex items-center justify-between">
                  <Input 
                    value={variant.name} 
                    onChange={(e) => updateVariantName(variant.id, e.target.value)}
                    className="h-8 text-sm font-medium bg-white w-1/2"
                    placeholder="Variant Name"
                  />
                  <button onClick={() => removeVariant(variant.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Trigger Overrides</label>
                  <Input 
                    value={variant.triggerOverrides || ''} 
                    onChange={(e) => {
                      setVariants(variants.map(v => v.id === variant.id ? { ...v, triggerOverrides: e.target.value } : v));
                    }}
                    className="h-8 text-xs bg-white"
                    placeholder="e.g. Only triggers when cart_value > 100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Property Overrides</label>
                  <div className="bg-white border rounded-md divide-y">
                    {Array.from(new Set(actions.flatMap(a => [...a.eventProperties, ...a.systemProperties]))).map((propId: string) => {
                      const prop = data.properties.find(p => p.id === propId);
                      if (!prop) return null;
                      
                      const override = variant.propertyOverrides?.[propId] || {};
                      
                      return (
                        <div key={propId} className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-medium text-gray-900">{prop.name}</span>
                          </div>
                          <div className="flex gap-2">
                            <select
                              className="text-xs border rounded p-1.5 bg-gray-50 w-1/2"
                              value={override.presence || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setVariants(variants.map(v => {
                                  if (v.id === variant.id) {
                                    const newOverrides = { ...v.propertyOverrides };
                                    if (val) {
                                      newOverrides[propId] = { ...newOverrides[propId], presence: val as any };
                                    } else {
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
                              className="h-7 text-xs bg-gray-50 w-1/2"
                              placeholder="Override Constraints (e.g. regex)"
                              value={Array.isArray(override.constraints) ? override.constraints.join(', ') : override.constraints || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setVariants(variants.map(v => {
                                  if (v.id === variant.id) {
                                    const newOverrides = { ...v.propertyOverrides };
                                    if (val) {
                                      newOverrides[propId] = { ...newOverrides[propId], constraints: val };
                                    } else {
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
                      <div className="p-3 text-xs text-gray-500 italic text-center">
                        Add properties to actions to configure overrides.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 italic">No variants defined.</div>
        )}
      </div>

      <div className="fixed bottom-0 right-0 w-[500px] p-6 bg-white border-t flex justify-between z-10">
        <div className="flex gap-2">
          {!isCreating && event && (
            <Button variant="destructive" onClick={handleDelete} className="gap-2">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Event</Button>
        </div>
      </div>
    </div>
  );
}
