/**
 * Catalog detail: governance card + fields list. Add field, set lookup key. E3 branding.
 */
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Key, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { CatalogRow, CatalogFieldRow, CatalogType } from '@/src/types/schema';
import { useCatalogs } from '../hooks/useCatalogs';

const SPACE_BLUE = '#1A1E38';
const EMERALD = '#0DCC96';

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
}

export function CatalogDetail({ catalog, onBack, onEdit }: CatalogDetailProps) {
  const {
    fetchCatalogFields,
    createCatalogField,
    setFieldLookupKey,
    deleteCatalogField,
  } = useCatalogs();
  const [fields, setFields] = useState<CatalogFieldRow[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [addFieldName, setAddFieldName] = useState('');
  const [addFieldType, setAddFieldType] = useState<string>('string');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      type: addFieldType,
      is_lookup_key: false,
    });
    setAdding(false);
    if (result.success) {
      setFields((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      setAddFieldName('');
    } else {
      setError(result.error ?? 'Failed to add field');
    }
  };

  const handleSetLookupKey = async (fieldId: string) => {
    setError(null);
    const result = await setFieldLookupKey(catalog.id, fieldId);
    if (result.success) {
      setFields((prev) =>
        prev.map((f) => ({ ...f, is_lookup_key: f.id === fieldId }))
      );
    } else {
      setError(result.error ?? 'Failed to set lookup key');
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('Remove this field?')) return;
    setError(null);
    const result = await deleteCatalogField(catalog.id, fieldId);
    if (result.success) {
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
    } else {
      setError(result.error ?? 'Failed to delete field');
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
          <form onSubmit={handleAddField} className="flex gap-2 mb-6">
            <Input
              value={addFieldName}
              onChange={(e) => setAddFieldName(e.target.value)}
              placeholder="Field name"
              className="flex-1 font-mono"
            />
            <select
              value={addFieldType}
              onChange={(e) => setAddFieldType(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </select>
            <Button type="submit" disabled={!addFieldName.trim() || adding} className="gap-1">
              <Plus className="w-4 h-4" /> Add
            </Button>
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
                  className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50/80"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-gray-900">{f.name}</span>
                    <span className="text-xs text-gray-500">{f.type}</span>
                    {f.is_lookup_key && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: EMERALD }}
                      >
                        <Key className="w-3 h-3" /> Lookup key
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!f.is_lookup_key && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetLookupKey(f.id)}
                      >
                        Set as lookup key
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteField(f.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                      aria-label="Delete field"
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
