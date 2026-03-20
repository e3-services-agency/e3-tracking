/**
 * Catalog detail: governance card + fields list. Add field, set lookup key. E3 branding.
 */
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Key, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  CATALOG_FIELD_DATA_TYPES,
  CATALOG_FIELD_FAMILIES,
  CATALOG_FIELD_ITEM_LEVELS,
  CATALOG_FIELD_SOURCE_MAPPING_TYPES,
  type CatalogFieldDataType,
  type CatalogFieldFamily,
  type CatalogFieldItemLevel,
  type CatalogFieldRow,
  type CatalogFieldSourceMappingType,
  type CatalogRow,
  type CatalogType,
} from '@/src/types/schema';
import { useCatalogs } from '../hooks/useCatalogs';

const EMERALD = 'var(--brand-primary)';

function getDefaultItemLevel(catalogType: CatalogType): CatalogFieldItemLevel {
  if (catalogType === 'Product') return 'parent';
  if (catalogType === 'Variant') return 'variant';
  return 'general';
}

function CatalogTypeBadge({ type }: { type: CatalogType }) {
  const styles: Record<CatalogType, string> = {
    Product: 'bg-blue-100 text-blue-800 border-blue-200',
    Variant: 'bg-purple-100 text-purple-800 border-purple-200',
    General: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${styles[type]}`}>
      Type: {type}
    </span>
  );
}

export interface CatalogDetailProps {
  catalog: CatalogRow;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
}

export function CatalogDetail({ catalog, onBack, onEdit, onDelete }: CatalogDetailProps) {
  const {
    fetchCatalogFields,
    createCatalogField,
    setFieldLookupKey,
    updateCatalogField,
    deleteCatalogField,
  } = useCatalogs();
  const [fields, setFields] = useState<CatalogFieldRow[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [addFieldName, setAddFieldName] = useState('');
  const [addFieldDescription, setAddFieldDescription] = useState('');
  const [addFieldDataType, setAddFieldDataType] = useState<CatalogFieldDataType>('string');
  const [addFieldFamily, setAddFieldFamily] = useState<CatalogFieldFamily>('custom');
  const [addFieldItemLevel, setAddFieldItemLevel] = useState<CatalogFieldItemLevel>(
    getDefaultItemLevel(catalog.catalog_type)
  );
  const [addSourceMappingType, setAddSourceMappingType] =
    useState<CatalogFieldSourceMappingType>('json_field');
  const [addSourceValue, setAddSourceValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldName, setEditFieldName] = useState('');
  const [editFieldDescription, setEditFieldDescription] = useState('');
  const [editFieldDataType, setEditFieldDataType] = useState<CatalogFieldDataType>('string');
  const [editFieldFamily, setEditFieldFamily] = useState<CatalogFieldFamily>('custom');
  const [editFieldItemLevel, setEditFieldItemLevel] = useState<CatalogFieldItemLevel>('general');
  const [editSourceMappingType, setEditSourceMappingType] =
    useState<CatalogFieldSourceMappingType>('json_field');
  const [editSourceValue, setEditSourceValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingCatalog, setDeletingCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAddFieldForm = () => {
    setAddFieldName('');
    setAddFieldDescription('');
    setAddFieldDataType('string');
    setAddFieldFamily('custom');
    setAddFieldItemLevel(getDefaultItemLevel(catalog.catalog_type));
    setAddSourceMappingType('json_field');
    setAddSourceValue('');
  };

  const reloadFields = async () => {
    setLoadingFields(true);
    const list = await fetchCatalogFields(catalog.id);
    setFields(list);
    setLoadingFields(false);
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingFields(true);
    fetchCatalogFields(catalog.id).then((list) => {
      if (!cancelled) {
        setFields(list);
        setLoadingFields(false);
      }
    });
    return () => { cancelled = true; };
  }, [catalog.id, fetchCatalogFields]);

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = addFieldName.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    const result = await createCatalogField(catalog.id, {
      name,
      description: addFieldDescription.trim() || null,
      data_type: addFieldDataType,
      is_lookup_key: false,
      field_family: addFieldFamily,
      item_level: addFieldItemLevel,
      source_mapping_json: addSourceValue.trim()
        ? {
            mapping_type: addSourceMappingType,
            source_value: addSourceValue.trim(),
          }
        : null,
    });
    setAdding(false);
    if (result.success) {
      await reloadFields();
      resetAddFieldForm();
    } else {
      setError(('error' in result && result.error) ? result.error : 'Failed to add field');
    }
  };

  const handleSetLookupKey = async (fieldId: string) => {
    setError(null);
    const result = await setFieldLookupKey(catalog.id, fieldId);
    if (result.success) {
      await reloadFields();
    } else {
      setError(('error' in result && result.error) ? result.error : 'Failed to set lookup key');
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('Remove this field?')) return;
    setError(null);
    const result = await deleteCatalogField(catalog.id, fieldId);
    if (result.success) {
      await reloadFields();
    } else {
      setError(('error' in result && result.error) ? result.error : 'Failed to delete field');
    }
  };

  const handleStartEditField = (field: CatalogFieldRow) => {
    setEditingFieldId(field.id);
    setEditFieldName(field.name);
    setEditFieldDescription(field.description ?? '');
    setEditFieldDataType(field.data_type);
    setEditFieldFamily(field.field_family);
    setEditFieldItemLevel(field.item_level);
    setEditSourceMappingType(field.source_mapping_json?.mapping_type ?? 'json_field');
    setEditSourceValue(field.source_mapping_json?.source_value ?? '');
    setError(null);
  };

  const handleCancelEditField = () => {
    setEditingFieldId(null);
    setEditFieldName('');
    setEditFieldDescription('');
    setEditFieldDataType('string');
    setEditFieldFamily('custom');
    setEditFieldItemLevel('general');
    setEditSourceMappingType('json_field');
    setEditSourceValue('');
  };

  const handleSaveFieldEdit = async (fieldId: string) => {
    const trimmedName = editFieldName.trim();
    if (!trimmedName) return;

    setSavingEdit(true);
    setError(null);
    const result = await updateCatalogField(catalog.id, fieldId, {
      name: trimmedName,
      description: editFieldDescription.trim() || null,
      data_type: editFieldDataType,
      field_family: editFieldFamily,
      item_level: editFieldItemLevel,
      source_mapping_json: editSourceValue.trim()
        ? {
            mapping_type: editSourceMappingType,
            source_value: editSourceValue.trim(),
          }
        : null,
    });
    setSavingEdit(false);

    if (!result.success) {
      setError(('error' in result && result.error) ? result.error : 'Failed to update field');
      return;
    }

    await reloadFields();
    handleCancelEditField();
  };

  const handleDeleteCatalog = async () => {
    const ok = window.confirm(`Delete catalog "${catalog.name}"?`);
    if (!ok) return;

    setDeletingCatalog(true);
    setError(null);
    const result = await onDelete();
    setDeletingCatalog(false);

    if (!result.success) {
      setError(('error' in result && result.error) ? result.error : 'Failed to delete catalog');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-white">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-500 hover:text-gray-900 gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit catalog
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteCatalog}
            disabled={deletingCatalog}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" /> {deletingCatalog ? 'Deleting…' : 'Delete catalog'}
          </Button>
        </div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          {catalog.name}
        </h1>
        {catalog.description && (
          <p className="text-gray-600 mt-1">{catalog.description}</p>
        )}
        {/* Governance card */}
        <div
          className="mt-4 rounded-lg border border-gray-200 overflow-hidden p-4 bg-white"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Data governance
          </div>
          <div className="flex flex-wrap gap-2">
            <CatalogTypeBadge type={(catalog.catalog_type as CatalogType) || 'General'} />
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
              Source: {catalog.source_system || '—'}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
              Sync: {catalog.sync_method || '—'}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
              Frequency: {catalog.update_frequency || '—'}
            </span>
            {catalog.owner && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                Owner: {catalog.owner}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-3" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Fields
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Add fields and choose exactly one as the Lookup Key (used to join event properties to this catalog).
          </p>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
          <form onSubmit={handleAddField} className="mb-6 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={addFieldName}
                onChange={(e) => setAddFieldName(e.target.value)}
                placeholder="Field name"
                className="font-mono"
              />
              <select
                value={addFieldDataType}
                onChange={(e) => setAddFieldDataType(e.target.value as CatalogFieldDataType)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {CATALOG_FIELD_DATA_TYPES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <select
                value={addFieldFamily}
                onChange={(e) => setAddFieldFamily(e.target.value as CatalogFieldFamily)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {CATALOG_FIELD_FAMILIES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <select
                value={addFieldItemLevel}
                onChange={(e) => setAddFieldItemLevel(e.target.value as CatalogFieldItemLevel)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {CATALOG_FIELD_ITEM_LEVELS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
            <Input
              value={addFieldDescription}
              onChange={(e) => setAddFieldDescription(e.target.value)}
              placeholder="Description (optional)"
            />
            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
              <select
                value={addSourceMappingType}
                onChange={(e) => setAddSourceMappingType(e.target.value as CatalogFieldSourceMappingType)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {CATALOG_FIELD_SOURCE_MAPPING_TYPES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <Input
                value={addSourceValue}
                onChange={(e) => setAddSourceValue(e.target.value)}
                placeholder="Source mapping value (optional)"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!addFieldName.trim() || adding} className="gap-1">
                <Plus className="w-4 h-4" /> {adding ? 'Adding…' : 'Add'}
              </Button>
            </div>
          </form>
          {loadingFields ? (
            <p className="text-gray-500 text-sm">Loading fields…</p>
          ) : fields.length === 0 ? (
            <p className="text-gray-500 text-sm">No fields yet. Add one above.</p>
          ) : (
            <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {fields.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start justify-between gap-4 px-4 py-3 bg-white hover:bg-gray-50/80"
                >
                  <div className="flex-1">
                    {editingFieldId === f.id ? (
                      <div className="space-y-2">
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input
                            value={editFieldName}
                            onChange={(e) => setEditFieldName(e.target.value)}
                            className="h-9 font-mono"
                            disabled={savingEdit}
                          />
                          <select
                            value={editFieldDataType}
                            onChange={(e) => setEditFieldDataType(e.target.value as CatalogFieldDataType)}
                            className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            disabled={savingEdit}
                          >
                            {CATALOG_FIELD_DATA_TYPES.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                          <select
                            value={editFieldFamily}
                            onChange={(e) => setEditFieldFamily(e.target.value as CatalogFieldFamily)}
                            className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            disabled={savingEdit}
                          >
                            {CATALOG_FIELD_FAMILIES.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                          <select
                            value={editFieldItemLevel}
                            onChange={(e) => setEditFieldItemLevel(e.target.value as CatalogFieldItemLevel)}
                            className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            disabled={savingEdit}
                          >
                            {CATALOG_FIELD_ITEM_LEVELS.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </div>
                        <Input
                          value={editFieldDescription}
                          onChange={(e) => setEditFieldDescription(e.target.value)}
                          className="h-9"
                          placeholder="Description"
                          disabled={savingEdit}
                        />
                        <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                          <select
                            value={editSourceMappingType}
                            onChange={(e) => setEditSourceMappingType(e.target.value as CatalogFieldSourceMappingType)}
                            className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            disabled={savingEdit}
                          >
                            {CATALOG_FIELD_SOURCE_MAPPING_TYPES.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                          <Input
                            value={editSourceValue}
                            onChange={(e) => setEditSourceValue(e.target.value)}
                            className="h-9"
                            placeholder="Source mapping value"
                            disabled={savingEdit}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-medium text-gray-900">{f.name}</span>
                          <span className="text-xs text-gray-500">{f.data_type}</span>
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {f.field_family}
                          </span>
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {f.item_level}
                          </span>
                          {f.is_lookup_key && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: EMERALD }}
                            >
                              <Key className="w-3 h-3" /> Lookup key
                            </span>
                          )}
                        </div>
                        {f.description && (
                          <p className="text-sm text-gray-600">{f.description}</p>
                        )}
                        {f.source_mapping_json && (
                          <p className="text-xs text-gray-500">
                            Source mapping: {f.source_mapping_json.mapping_type} = {f.source_mapping_json.source_value}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editingFieldId === f.id ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEditField}
                          disabled={savingEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveFieldEdit(f.id)}
                          disabled={!editFieldName.trim() || savingEdit}
                        >
                          {savingEdit ? 'Saving…' : 'Save'}
                        </Button>
                      </>
                    ) : (
                      <>
                        {!f.is_lookup_key && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetLookupKey(f.id)}
                          >
                            Set as lookup key
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEditField(f)}
                          className="gap-1 text-gray-500 hover:text-gray-900"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </Button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteField(f.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                      aria-label="Delete field"
                      disabled={editingFieldId === f.id || savingEdit}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
