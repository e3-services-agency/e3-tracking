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
  type PropertyDataFormat,
  type PropertyDataType,
  type PropertyExampleValue,
  type PropertyNameMapping,
  type PropertyRow,
  type PropertyMappingType,
  PROPERTY_DATA_FORMATS,
} from '@/src/types/schema';
import type { ApiError } from '@/src/features/properties/hooks/useProperties';
import type { PropertyUpdatePayload } from '@/src/features/properties/hooks/useProperties';
import { useCatalogs } from '@/src/features/catalogs/hooks/useCatalogs';
import {
  AlertCircle,
  Braces,
  Brackets,
  Clock3,
  Hash,
  Link2,
  ToggleLeft,
  Trash2,
  Type,
} from 'lucide-react';

const CONTEXTS: { value: PropertyContext; label: string }[] = [
  { value: 'event_property', label: 'Event Property' },
  { value: 'user_property', label: 'User Property' },
  { value: 'system_property', label: 'System Property' },
];

const UI_DATA_TYPES: { value: PropertyDataType; label: string }[] = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'timestamp', label: 'timestamp' },
  { value: 'object', label: 'object {}' },
  { value: 'array', label: 'array []' },
];

function dataTypeIcon(t: PropertyDataType): React.ReactNode {
  if (t === 'array') return <Brackets className="w-4 h-4" />;
  if (t === 'object') return <Braces className="w-4 h-4" />;
  if (t === 'boolean') return <ToggleLeft className="w-4 h-4" />;
  if (t === 'number') return <Hash className="w-4 h-4" />;
  if (t === 'timestamp') return <Clock3 className="w-4 h-4" />;
  return <Type className="w-4 h-4" />;
}

function formatJson(value: unknown): string {
  return value === null || value === undefined ? '' : JSON.stringify(value, null, 2);
}

function parseOptionalJson<T>(value: string, fieldLabel: string): { value: T | null; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null };
  }

  try {
    return { value: JSON.parse(trimmed) as T };
  } catch {
    return { value: null, error: `${fieldLabel} must be valid JSON.` };
  }
}

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
  const [catalogFields, setCatalogFields] = useState<
    { id: string; name: string; data_type: string; is_lookup_key: boolean }[]
  >([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [context, setContext] = useState<PropertyContext>('event_property');
  const [dataType, setDataType] = useState<PropertyDataType>('string');
  const [pii, setPii] = useState(false);
  const [dataFormats, setDataFormats] = useState<PropertyDataFormat[]>([]);
  const [valueSchemaJson, setValueSchemaJson] = useState('');
  const [exampleValuesJson, setExampleValuesJson] = useState('');
  const [nameMappingsJson, setNameMappingsJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [mappingEnabled, setMappingEnabled] = useState(false);
  const [mappedCatalogId, setMappedCatalogId] = useState('');
  const [mappedFieldId, setMappedFieldId] = useState('');
  const [mappingType, setMappingType] = useState<PropertyMappingType>('mapped_value');

  const isEdit = Boolean(initialProperty?.id);

  useEffect(() => {
    if (isOpen) {
      setSaving(false);
      setDeleting(false);
      setEditorError(null);
      clearMutationError();
      if (initialProperty) {
        setName(initialProperty.name);
        setDescription(initialProperty.description ?? '');
        setCategory(initialProperty.category ?? '');
        setContext(initialProperty.context);
        setDataType(initialProperty.data_type);
        setPii(initialProperty.pii);
        setDataFormats(initialProperty.data_formats ?? []);
        setValueSchemaJson(formatJson(initialProperty.value_schema_json));
        setExampleValuesJson(formatJson(initialProperty.example_values_json));
        setNameMappingsJson(formatJson(initialProperty.name_mappings_json));
        setMappingEnabled(Boolean(initialProperty.mapped_catalog_id && initialProperty.mapped_catalog_field_id));
        setMappedCatalogId(initialProperty.mapped_catalog_id ?? '');
        setMappedFieldId(initialProperty.mapped_catalog_field_id ?? '');
        setMappingType((initialProperty.mapping_type as PropertyMappingType) ?? 'mapped_value');
        setCatalogFields([]);
        if (initialProperty.mapped_catalog_id) {
          fetchCatalogFields(initialProperty.mapped_catalog_id).then((fields) =>
            setCatalogFields(
              fields.map((f) => ({
                id: f.id,
                name: f.name,
                data_type: f.data_type,
                is_lookup_key: f.is_lookup_key,
              }))
            )
          );
        }
      } else {
        setName('');
        setDescription('');
        setCategory('');
        setContext('event_property');
        setDataType('string');
        setPii(false);
        setDataFormats([]);
        setValueSchemaJson('');
        setExampleValuesJson('');
        setNameMappingsJson('');
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
        setCatalogFields(
          fields.map((f) => ({
            id: f.id,
            name: f.name,
            data_type: f.data_type,
            is_lookup_key: f.is_lookup_key,
          }))
        )
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

    setEditorError(null);
    setSaving(true);
    clearMutationError();

    const parsedValueSchema = parseOptionalJson<CreatePropertyInput['value_schema_json']>(
      valueSchemaJson,
      'Value schema'
    );
    if (parsedValueSchema.error) {
      setEditorError(parsedValueSchema.error);
      setSaving(false);
      return;
    }

    const parsedExampleValues = parseOptionalJson<PropertyExampleValue[]>(
      exampleValuesJson,
      'Example values'
    );
    if (parsedExampleValues.error) {
      setEditorError(parsedExampleValues.error);
      setSaving(false);
      return;
    }

    const parsedNameMappings = parseOptionalJson<PropertyNameMapping[]>(
      nameMappingsJson,
      'Name mappings'
    );
    if (parsedNameMappings.error) {
      setEditorError(parsedNameMappings.error);
      setSaving(false);
      return;
    }

    if (isEdit && initialProperty && updateProperty) {
      const payload: PropertyUpdatePayload = {
        name: trimmedName,
        description: description.trim() || undefined,
        category: category.trim() || null,
        context,
        pii,
        data_type: dataType,
        data_formats: dataFormats.length > 0 ? dataFormats : null,
        value_schema_json: parsedValueSchema.value ?? null,
        example_values_json: parsedExampleValues.value ?? null,
        name_mappings_json: parsedNameMappings.value ?? null,
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

    const payload: CreatePropertyInput = {
      name: trimmedName,
      description: description.trim() || null,
      category: category.trim() || null,
      context,
      pii,
      data_type: dataType,
      data_formats: dataFormats.length > 0 ? dataFormats : null,
      value_schema_json: parsedValueSchema.value ?? null,
      example_values_json: parsedExampleValues.value ?? null,
      name_mappings_json: parsedNameMappings.value ?? null,
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

        {editorError && (
          <div
            className="p-4 rounded-lg bg-red-50 border border-red-200 flex gap-3"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">{editorError}</p>
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
          <label className="text-sm font-medium text-gray-700">Category</label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Optional grouping label"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Property value type</label>
          <div className="flex gap-4 items-center flex-wrap">
            <select
              value={dataType}
              onChange={(e) => setDataType(e.target.value as PropertyDataType)}
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
          <label className="text-sm font-medium text-gray-700">PII</label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={pii}
              onChange={(e) => setPii(e.target.checked)}
              className="rounded border-gray-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
            />
            This property contains personally identifiable information
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Data formats (optional)</label>
          <select
            multiple
            value={dataFormats}
            onChange={(e) =>
              setDataFormats(
                Array.from(e.target.selectedOptions, (option) => option.value as PropertyDataFormat)
              )
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PROPERTY_DATA_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Hold Ctrl/Cmd to select multiple starter formats.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Value schema JSON</label>
          <textarea
            value={valueSchemaJson}
            onChange={(e) => setValueSchemaJson(e.target.value)}
            placeholder={dataType === 'array'
              ? '{\n  "type": "array",\n  "items": { "type": "string" }\n}'
              : '{\n  "type": "object",\n  "properties": {\n    "id": { "type": "string", "required": true }\n  }\n}'}
            rows={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <p className="text-xs text-gray-500">
            Optional. Use for object and array property shapes.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Example values JSON</label>
          <textarea
            value={exampleValuesJson}
            onChange={(e) => setExampleValuesJson(e.target.value)}
            placeholder='[{"value":"abc-123","label":"Primary example"}]'
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Name mappings JSON</label>
          <textarea
            value={nameMappingsJson}
            onChange={(e) => setNameMappingsJson(e.target.value)}
            placeholder='[{"system":"gtm","name":"user_id","role":"payload_key"}]'
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                        <option key={f.id} value={f.id}>{f.name} ({f.data_type})</option>
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
