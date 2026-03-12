import React, { useState, useMemo } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Property, PropertyValueType, PropertyBundle } from '@/src/types';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';
import { Sheet } from '@/src/components/ui/Sheet';
import { Search, Plus, Trash2, AlertCircle, Package, Check, X, Columns, GitMerge, CheckCircle2 } from 'lucide-react';
import { toSnakeCase, toPascalCase } from '@/src/lib/utils';
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

export function Properties() {
  const data = useActiveData();
  const { activeBranchId, branches, mergeBranch, approveBranch, selectedItemIdToEdit, setSelectedItemIdToEdit } = useStore();
  
  const [activeTab, setActiveTab] = useState<'properties' | 'bundles'>('properties');
  
  // Table state
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Property state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isPropertySheetOpen, setIsPropertySheetOpen] = useState(false);
  const [isCreatingProperty, setIsCreatingProperty] = useState(false);

  // Bundle state
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [isBundleSheetOpen, setIsBundleSheetOpen] = useState(false);
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);

  React.useEffect(() => {
    if (selectedItemIdToEdit) {
      const property = data.properties.find(p => p.id === selectedItemIdToEdit);
      if (property) {
        setSelectedPropertyId(property.id);
        setIsCreatingProperty(false);
        setIsPropertySheetOpen(true);
        setActiveTab('properties');
        setSelectedItemIdToEdit(null);
      }
    }
  }, [selectedItemIdToEdit, data.properties, setSelectedItemIdToEdit]);

  const handleOpenProperty = (id: string) => {
    setSelectedPropertyId(id);
    setIsCreatingProperty(false);
    setIsPropertySheetOpen(true);
  };

  const handleCreateNewProperty = () => {
    setSelectedPropertyId(null);
    setIsCreatingProperty(true);
    setIsPropertySheetOpen(true);
  };

  const handleOpenBundle = (id: string) => {
    setSelectedBundleId(id);
    setIsCreatingBundle(false);
    setIsBundleSheetOpen(true);
  };

  const handleCreateNewBundle = () => {
    setSelectedBundleId(null);
    setIsCreatingBundle(true);
    setIsBundleSheetOpen(true);
  };

  const selectedProperty = selectedPropertyId ? data.properties.find(p => p.id === selectedPropertyId) : null;
  const selectedBundle = selectedBundleId ? data.propertyBundles.find(b => b.id === selectedBundleId) : null;
  const activeBranch = branches.find(b => b.id === activeBranchId);

  // Diff logic
  const diff = useMemo(() => {
    if (activeBranchId === 'main' || !activeBranch) return null;
    const baseProps = activeBranch.baseData.properties;
    const draftProps = activeBranch.draftData.properties;
    
    const newProps = draftProps.filter(dp => !baseProps.find(bp => bp.id === dp.id));
    const modifiedProps = draftProps.filter(dp => {
      const base = baseProps.find(bp => bp.id === dp.id);
      if (!base) return false;
      return JSON.stringify(base) !== JSON.stringify(dp);
    });
    
    return { newProps, modifiedProps };
  }, [activeBranchId, activeBranch]);

  const canMerge = activeBranch && activeBranch.approvals.length > 0;

  const columns = useMemo<ColumnDef<Property>[]>(() => {
    const baseCols: ColumnDef<Property>[] = [
      {
        accessorKey: 'name',
        header: 'Property Name',
        cell: info => {
          const prop = info.row.original;
          const isNew = diff?.newProps.some(p => p.id === prop.id);
          const isModified = diff?.modifiedProps.some(p => p.id === prop.id);
          return (
            <div className="flex items-center gap-2">
              {isNew && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
              {isModified && <span className="w-2 h-2 rounded-full bg-purple-400"></span>}
              <span className="font-mono font-medium text-blue-600 cursor-pointer hover:underline" onClick={() => handleOpenProperty(prop.id)}>
                {info.getValue() as string}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'property_value_type',
        header: 'Type',
        cell: info => {
          const prop = info.row.original;
          return (
            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-md border">
              {prop.is_list ? `[${info.getValue() as string}]` : info.getValue() as string}
            </span>
          );
        },
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
        accessorKey: 'description',
        header: 'Description',
        cell: info => <span className="text-gray-500 truncate max-w-[200px] block">{info.getValue() as string}</span>,
      },
      {
        id: 'usedIn',
        header: 'Used In',
        cell: info => {
          const count = info.row.original.attached_events.length;
          return <span className="text-gray-500">{count} event{count !== 1 ? 's' : ''}</span>;
        }
      }
    ];

    const customCols: ColumnDef<Property>[] = data.settings.customPropertyFields.map(cf => ({
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
  }, [data.settings.customPropertyFields, diff]);

  const table = useReactTable({
    data: data.properties,
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

  const filteredBundles = data.propertyBundles.filter(b =>
    b.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
    b.description.toLowerCase().includes(globalFilter.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties & Bundles</h1>
          <p className="text-sm text-gray-500 mt-1">Manage global properties and reusable property bundles.</p>
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
          {activeTab === 'properties' ? (
            <Button onClick={handleCreateNewProperty} className="gap-2">
              <Plus className="w-4 h-4" /> Add Property
            </Button>
          ) : (
            <Button onClick={handleCreateNewBundle} className="gap-2">
              <Plus className="w-4 h-4" /> Add Bundle
            </Button>
          )}
        </div>
      </div>

      <div className="px-8 pt-4 border-b bg-white">
        <div className="flex space-x-6">
          <button
            onClick={() => setActiveTab('properties')}
            className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'properties'
                ? 'border-[#3E52FF] text-[#3E52FF]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setActiveTab('bundles')}
            className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'bundles'
                ? 'border-[#3E52FF] text-[#3E52FF]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Property Bundles
          </button>
        </div>
      </div>

      <div className="p-8 flex-1 overflow-hidden flex flex-col">
        {activeTab === 'properties' && diff && (diff.newProps.length > 0 || diff.modifiedProps.length > 0) && (
          <div className="mb-8 p-4 bg-white border rounded-lg shadow-sm shrink-0">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-[#3E52FF]" /> Workbench Summary
            </h3>
            <div className="flex gap-4">
              {diff.newProps.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                  {diff.newProps.length} New
                </div>
              )}
              {diff.modifiedProps.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full bg-purple-400"></span>
                  {diff.modifiedProps.length} Modified
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

        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={`Search ${activeTab}...`}
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          {activeTab === 'properties' && (
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
          )}
        </div>

        {activeTab === 'properties' ? (
          <>
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
                        No properties found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between shrink-0">
              <div className="text-sm text-gray-500">
                Showing {table.getRowModel().rows.length} of {data.properties.length} properties
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
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-8">
            {filteredBundles.map(bundle => (
              <div
                key={bundle.id}
                onClick={() => handleOpenBundle(bundle.id)}
                className="bg-white border rounded-lg p-6 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-[#3E52FF]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-[#3E52FF]" />
                    <h3 className="font-semibold text-gray-900">{bundle.name}</h3>
                  </div>
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {bundle.propertyIds.length} props
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{bundle.description}</p>
                <div className="flex flex-wrap gap-2">
                  {bundle.propertyIds.slice(0, 3).map(pid => {
                    const prop = data.properties.find(p => p.id === pid);
                    if (!prop) return null;
                    return (
                      <span key={pid} className="text-xs font-mono bg-gray-50 border px-2 py-1 rounded text-gray-600">
                        {prop.name}
                      </span>
                    );
                  })}
                  {bundle.propertyIds.length > 3 && (
                    <span className="text-xs font-medium text-gray-500 px-2 py-1">
                      +{bundle.propertyIds.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            ))}
            {filteredBundles.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white border rounded-lg border-dashed">
                No property bundles found. Create one to group related properties.
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet
        isOpen={isPropertySheetOpen}
        onClose={() => setIsPropertySheetOpen(false)}
        title={isCreatingProperty ? "Create Property" : "Edit Property"}
      >
        {isPropertySheetOpen && (
          <PropertyEditor
            property={selectedProperty}
            isCreating={isCreatingProperty}
            onClose={() => setIsPropertySheetOpen(false)}
          />
        )}
      </Sheet>

      <Sheet
        isOpen={isBundleSheetOpen}
        onClose={() => setIsBundleSheetOpen(false)}
        title={isCreatingBundle ? "Create Property Bundle" : "Edit Property Bundle"}
      >
        {isBundleSheetOpen && (
          <BundleEditor
            bundle={selectedBundle}
            isCreating={isCreatingBundle}
            onClose={() => setIsBundleSheetOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}

function PropertyEditor({ property, isCreating, onClose }: { property: Property | null | undefined, isCreating: boolean, onClose: () => void }) {
  const data = useActiveData();
  const { addProperty, updateProperty, deleteProperty, auditConfig } = useStore();
  
  const [name, setName] = useState(property?.name || '');
  const [propertyValueType, setPropertyValueType] = useState<PropertyValueType>(property?.property_value_type || 'string');
  const [isList, setIsList] = useState(property?.is_list || false);
  const [description, setDescription] = useState(property?.description || '');
  const [categories, setCategories] = useState<string[]>(property?.categories || []);
  const [tags, setTags] = useState<string[]>(property?.tags || []);
  const [valueConstraints, setValueConstraints] = useState<string>(
    Array.isArray(property?.value_constraints) ? property.value_constraints.join(', ') : (property?.value_constraints || '')
  );
  const [customFields, setCustomFields] = useState<Record<string, any>>(property?.customFields || {});
  
  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');

  let suggestedName = null;
  if (name.trim().length > 0) {
    if (auditConfig.propertyNaming === 'snake_case') suggestedName = toSnakeCase(name);
    else if (auditConfig.propertyNaming === 'Title Case') suggestedName = toPascalCase(name).replace(/([A-Z])/g, ' $1').trim();
    else if (auditConfig.propertyNaming === 'camelCase') suggestedName = toPascalCase(name).replace(/^./, str => str.toLowerCase());
    else if (auditConfig.propertyNaming === 'PascalCase') suggestedName = toPascalCase(name);
    else if (auditConfig.propertyNaming === 'Sentence case') {
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
    if (auditConfig.propertyNaming === 'snake_case') finalName = toSnakeCase(name);
    else if (auditConfig.propertyNaming === 'Title Case') finalName = toPascalCase(name).replace(/([A-Z])/g, ' $1').trim();
    else if (auditConfig.propertyNaming === 'camelCase') finalName = toPascalCase(name).replace(/^./, str => str.toLowerCase());
    else if (auditConfig.propertyNaming === 'PascalCase') finalName = toPascalCase(name);
    else if (auditConfig.propertyNaming === 'Sentence case') {
      const spaced = name.replace(/[-_]+/g, ' ').trim();
      finalName = spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
    }

    const constraintsArray = valueConstraints.split(',').map(s => s.trim()).filter(Boolean);
    const finalConstraints = constraintsArray.length > 1 ? constraintsArray : valueConstraints;

    const newPropData = {
      name: finalName,
      description,
      property_value_type: propertyValueType,
      is_list: isList,
      categories,
      tags,
      value_constraints: finalConstraints,
      attached_events: property?.attached_events || [],
      customFields
    };

    if (isCreating) {
      addProperty(newPropData);
    } else if (property) {
      updateProperty(property.id, newPropData);
    }
    onClose();
  };

  const handleDelete = () => {
    if (property) {
      deleteProperty(property.id);
      onClose();
    }
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

  return (
    <div className="space-y-6 pb-24">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Property Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`e.g. ${auditConfig.propertyNaming === 'snake_case' ? 'user_id' : 'User Id'}`}
          className="font-mono"
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Value Type</label>
          <select
            value={propertyValueType}
            onChange={(e) => setPropertyValueType(e.target.value as PropertyValueType)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="string">String</option>
            <option value="integer">Integer</option>
            <option value="float">Float</option>
            <option value="boolean">Boolean</option>
          </select>
        </div>
        <div className="space-y-2 flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input 
              type="checkbox" 
              checked={isList} 
              onChange={(e) => setIsList(e.target.checked)}
              className="rounded border-gray-300 text-[#3E52FF] focus:ring-[#3E52FF]"
            />
            Is List (Array)
          </label>
        </div>
      </div>

      {data.settings.customPropertyFields.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-900 border-b pb-2">Custom Fields</h3>
          <div className="grid grid-cols-2 gap-4">
            {data.settings.customPropertyFields.map(cf => (
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
        <label className="text-sm font-medium text-gray-700">Value Constraints (Optional)</label>
        <Input
          value={valueConstraints}
          onChange={(e) => setValueConstraints(e.target.value)}
          placeholder="e.g. Free, Pro, Enterprise (comma separated) or regex"
        />
        <p className="text-xs text-gray-500">Comma-separated list for enums, or a regex pattern.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="What does this property represent?"
        />
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

      <div className="fixed bottom-0 right-0 w-[500px] p-6 bg-white border-t flex justify-between z-10">
        {!isCreating && property ? (
          <Button variant="destructive" onClick={handleDelete} className="gap-2">
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Property</Button>
        </div>
      </div>
    </div>
  );
}

function BundleEditor({ bundle, isCreating, onClose }: { bundle: PropertyBundle | null | undefined, isCreating: boolean, onClose: () => void }) {
  const data = useActiveData();
  const { addPropertyBundle, updatePropertyBundle, deletePropertyBundle } = useStore();
  
  const [name, setName] = useState(bundle?.name || '');
  const [description, setDescription] = useState(bundle?.description || '');
  const [propertyIds, setPropertyIds] = useState<string[]>(bundle?.propertyIds || []);

  const handleSave = () => {
    if (!name.trim()) return;
    
    if (isCreating) {
      addPropertyBundle({ name, description, propertyIds });
    } else if (bundle) {
      updatePropertyBundle(bundle.id, { name, description, propertyIds });
    }
    onClose();
  };

  const handleDelete = () => {
    if (bundle) {
      deletePropertyBundle(bundle.id);
      onClose();
    }
  };

  const toggleProperty = (id: string) => {
    setPropertyIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Bundle Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. E-commerce Properties"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="What properties are included in this bundle?"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Included Properties ({propertyIds.length})</label>
        <div className="border rounded-md max-h-64 overflow-y-auto divide-y bg-gray-50">
          {data.properties.map(prop => {
            const isSelected = propertyIds.includes(prop.id);
            return (
              <div 
                key={prop.id} 
                className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-100'}`}
                onClick={() => toggleProperty(prop.id)}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-[#3E52FF] border-[#3E52FF]' : 'border-gray-300 bg-white'}`}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <div className="font-mono text-sm font-medium text-gray-900">{prop.name}</div>
                  <div className="text-xs text-gray-500">{prop.description || 'No description'}</div>
                </div>
              </div>
            );
          })}
          {data.properties.length === 0 && (
            <div className="p-4 text-center text-sm text-gray-500">
              No properties available. Create some properties first.
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 right-0 w-[500px] p-6 bg-white border-t flex justify-between z-10">
        {!isCreating && bundle ? (
          <Button variant="destructive" onClick={handleDelete} className="gap-2">
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Bundle</Button>
        </div>
      </div>
    </div>
  );
}
