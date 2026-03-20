/**
 * Create/Edit Property slide-out sheet (Avo-style). Phase 1 schema + catalog mapping.
 * Save calls API via createProperty or updateProperty; API errors shown as red alert.
 */
import React, { useState, useEffect } from 'react';
import { Sheet } from '@/src/components/ui/Sheet';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  type CreatePropertyInput,
  type PropertyContext,
  type PropertyDataType,
  type PiiStatus,
  type PropertyRow,
  type PropertyMappingType,
} from '@/src/types/schema';
import type { ApiError } from '@/src/features/properties/hooks/useProperties';
import type { PropertyUpdatePayload } from '@/src/features/properties/hooks/useProperties';
import { useCatalogs } from '@/src/features/catalogs/hooks/useCatalogs';
import { AlertCircle, Link2, Braces, Brackets, Hash, Type, ToggleLeft, Sigma, Trash2 } from 'lucide-react';

const CONTEXTS: { value: PropertyContext; label: string }[] = [
  { value: 'event_property', label: 'Event Property' },
  { value: 'user_property', label: 'User Property' },
  { value: 'system_property', label: 'System Property' },
];

type UIPropertyDataType = PropertyDataType | 'array';
const UI_DATA_TYPES: { value: UIPropertyDataType; label: string }[] = [
  { value: 'string', label: 'string' },
  { value: 'integer', label: 'integer' },
  { value: 'float', label: 'float' },
  { value: 'boolean', label: 'boolean' },
  { value: 'object', label: 'object {}' },
  { value: 'array', label: 'array []' },
];

function dataTypeIcon(t: UIPropertyDataType): React.ReactNode {
  if (t === 'array') return <Brackets className="w-4 h-4" />;
  if (t === 'object') return <Braces className="w-4 h-4" />;
  if (t === 'boolean') return <ToggleLeft className="w-4 h-4" />;
  if (t === 'integer') return <Hash className="w-4 h-4" />;
  if (t === 'float') return <Sigma className="w-4 h-4" />;
  return <Type className="w-4 h-4" />;
}

const PII_OPTIONS: { value: PiiStatus; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'sensitive', label: 'Sensitive' },
  { value: 'highly_sensitive', label: 'Highly Sensitive' },
];

export interface PropertyEditorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** When set, sheet is in edit mode and uses updateProperty. */
  initialProperty?: PropertyRow | null;
  createProperty: (payload: CreatePropertyInput) => Promise<
    | { success: true; data: unknown }
    | { success: false; error: ApiError }
  >;
  updateProperty?: (id: string, payload: PropertyUpdatePayload) => Promise<
    | { success: true; data: unknown }
    | { success: false; error: ApiError }
  >;
  deleteProperty?: (id: string) => Promise<
    | { success: true }
    | { success: false; error: ApiError }
  >;
  mutationError: ApiError | null;
  clearMutationError: () => void;
}

export function PropertyEditorSheet({
  isOpen,
  onClose,
  initialProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  mutationError,
  clearMutationError,
}: PropertyEditorSheetProps) {
  const { catalogs, fetchCatalogFields } = useCatalogs();
  const [catalogFields, setCatalogFields] = useState<{ id: string; name: string; type: string; is_lookup_key: boolean }[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState<PropertyContext>('event_property');
  const [dataType, setDataType] = useState<UIPropertyDataType>('string');
  const [piiStatus, setPiiStatus] = useState<PiiStatus>('none');
  const [dataFormat, setDataFormat] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [mappingEnabled, setMappingEnabled] = useState(false);
  const [mappedCatalogId, setMappedCatalogId] = useState('');
  const [mappedFieldId, setMappedFieldId] = useState('');
  const [mappingType, setMappingType] = useState<PropertyMappingType>('mapped_value');

  const isEdit = Boolean(initialProperty?.id);

  useEffect(() => {
    if (isOpen) {
      setSaving(false);
      setDeleting(false);
      clearMutationError();
      if (initialProperty) {
        setName(initialProperty.name);
        setDescription(initialProperty.description ?? '');
        setContext(initialProperty.context);
        setDataType(initialProperty.data_type === 'list' || initialProperty.is_list ? 'array' : initialProperty.data_type);
        setPiiStatus(initialProperty.pii_status);
        setDataFormat(initialProperty.data_format ?? '');
        setMappingEnabled(Boolean(initialProperty.mapped_catalog_id && initialProperty.mapped_catalog_field_id));
        setMappedCatalogId(initialProperty.mapped_catalog_id ?? '');
        setMappedFieldId(initialProperty.mapped_catalog_field_id ?? '');
        setMappingType((initialProperty.mapping_type as PropertyMappingType) ?? 'mapped_value');
        setCatalogFields([]);
        if (initialProperty.mapped_catalog_id) {
          fetchCatalogFields(initialProperty.mapped_catalog_id).then((fields) =>
            setCatalogFields(fields.map((f) => ({ id: f.id, name: f.name, type: f.type, is_lookup_key: f.is_lookup_key })))
          );
        }
      } else {
        setName('');
        setDescription('');
        setContext('event_property');
        setDataType('string');
        setPiiStatus('none');
        setDataFormat('');
        setMappingEnabled(false);
        setMappedCatalogId('');
        setMappedFieldId('');
        setMappingType('mapped_value');
        setCatalogFields([]);
      }
    }
  }, [isOpen, clearMutationError, initialProperty, fetchCatalogFields]);

  useEffect(() => {
    if (mappedCatalogId) {
      fetchCatalogFields(mappedCatalogId).then((fields) =>
        setCatalogFields(fields.map((f) => ({ id: f.id, name: f.name, type: f.type, is_lookup_key: f.is_lookup_key })))
      );
      setMappedFieldId('');
    } else {
      setCatalogFields([]);
      setMappedFieldId('');
    }
  }, [mappedCatalogId, fetchCatalogFields]);

  const handleDelete = async () => {
    if (!isEdit || !initialProperty || !deleteProperty) return;

    const ok = window.confirm(`Delete property "${initialProperty.name}"?`);
    if (!ok) return;

    setDeleting(true);
    clearMutationError();
    const result = await deleteProperty(initialProperty.id);
    setDeleting(false);

    if (result.success) {
      onClose();
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSaving(true);
    clearMutationError();

    if (isEdit && initialProperty && updateProperty) {
      const normalizedDataType: PropertyDataType =
        dataType === 'array' ? 'list' : (dataType as PropertyDataType);
      const normalizedIsList = dataType === 'array';
      const payload: PropertyUpdatePayload = {
        name: trimmedName,
        description: description.trim() || undefined,
        context,
        data_type: normalizedDataType,
        pii_status: piiStatus,
        is_list: normalizedIsList,
        data_format: dataFormat.trim() || undefined,
      };
      if (mappingEnabled && mappedCatalogId && mappedFieldId) {
        payload.mapped_catalog_id = mappedCatalogId;
        payload.mapped_catalog_field_id = mappedFieldId;
        payload.mapping_type = mappingType;
      } else {
        payload.mapped_catalog_id = null;
        payload.mapped_catalog_field_id = null;
        payload.mapping_type = null;
      }
      const result = await updateProperty(initialProperty.id, payload);
      setSaving(false);
      if (result.success) onClose();
      return;
    }

    const normalizedDataType: PropertyDataType =
      dataType === 'array' ? 'list' : (dataType as PropertyDataType);
    const normalizedIsList = dataType === 'array';
    const payload: CreatePropertyInput = {
      name: trimmedName,
      description: description.trim() || null,
      context,
      data_type: normalizedDataType,
      pii_status: piiStatus,
      is_list: normalizedIsList,
      data_format: dataFormat.trim() || null,
      category: null,
      example_values_json: null,
      name_mappings_json: null,
      mapped_catalog_id: null,
      mapped_catalog_field_id: null,
      mapping_type: null,
    };
    if (mappingEnabled && mappedCatalogId && mappedFieldId) {
      payload.mapped_catalog_id = mappedCatalogId;
      payload.mapped_catalog_field_id = mappedFieldId;
      payload.mapping_type = mappingType;
    }

    const result = await createProperty(payload);
    setSaving(false);
    if (result.success) onClose();
  };

  const isMutating = saving || deleting;

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Property' : 'New Property'}
      className="w-[480px]"
    >
      <div className="space-y-6 pb-24">
        {mutationError && (
          <div
            className="p-4 rounded-lg bg-red-50 border border-red-200 flex gap-3"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">{mutationError.message}</p>
              {mutationError.details && (
                <p className="text-xs text-red-600 mt-1">{mutationError.details}</p>
              )}
              <p className="text-xs text-red-500 mt-1">
                Fix the error and try again. Check naming convention (e.g. snake_case) if enabled for this workspace.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. user_id, checkout_completed"
            className="font-mono"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this property represent?"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Property value type</label>
          <div className="flex gap-4 items-center flex-wrap">
            <select
              value={dataType}
              onChange={(e) => setDataType(e.target.value as UIPropertyDataType)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {UI_DATA_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <span className="inline-flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border rounded-md px-2 py-1">
              {dataTypeIcon(dataType)}
              <span className="font-mono">{dataType === 'array' ? 'array []' : dataType === 'object' ? 'object {}' : dataType}</span>
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Arrays and objects are first-class types; list storage is handled automatically.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Context</label>
          <select
            value={context}
            onChange={(e) => setContext(e.target.value as PropertyContext)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CONTEXTS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">PII Status</label>
          <select
            value={piiStatus}
            onChange={(e) => setPiiStatus(e.target.value as PiiStatus)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PII_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Data format (optional)</label>
          <Input
            value={dataFormat}
            onChange={(e) => setDataFormat(e.target.value)}
            placeholder="e.g. UUID, ISO-8601, email"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[var(--brand-primary)]" />
            Catalog Mapping (optional)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={mappingEnabled}
              onChange={(e) => setMappingEnabled(e.target.checked)}
              className="rounded border-gray-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
            />
            Map this property to a catalog field
          </label>
          {mappingEnabled && (
            <div className="space-y-3 pl-1 border-l-2 border-gray-200 pl-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Select Catalog</label>
                <select
                  value={mappedCatalogId}
                  onChange={(e) => setMappedCatalogId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  <option value="">— Choose catalog —</option>
                  {catalogs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {mappedCatalogId && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Select Field</label>
                    <select
                      value={mappedFieldId}
                      onChange={(e) => setMappedFieldId(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                    >
                      <option value="">— Choose field —</option>
                      {catalogFields.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-gray-500 mb-2">Relationship type</span>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="mappingType"
                          checked={mappingType === 'lookup_key'}
                          onChange={() => setMappingType('lookup_key')}
                          className="text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                        />
                        This property is the Lookup Key (event value joins to this catalog)
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="mappingType"
                          checked={mappingType === 'mapped_value'}
                          onChange={() => setMappingType('mapped_value')}
                          className="text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                        />
                        This property maps to the catalog field value
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Sources</label>
          <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
            Configure sources when attaching this property to events.
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 right-0 w-[480px] p-6 bg-white border-t flex justify-between gap-2 z-10">
        {isEdit && initialProperty ? (
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isMutating}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        ) : (
          <div />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isMutating}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isMutating || !name.trim()}>
            {saving ? 'Saving…' : 'Save Property'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
