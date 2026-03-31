/**
 * Create/Edit Property slide-out sheet (Avo-style). Phase 1 schema + catalog mapping.
 * Save calls API via createProperty or updateProperty; API errors shown as red alert.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sheet } from '@/src/components/ui/Sheet';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { IconSelect, type IconSelectOption } from '@/src/components/ui/IconSelect';
import {
  type CreatePropertyInput,
  type PropertyContext,
  type PropertyDataFormat,
  type PropertyDataType,
  type PropertyExampleValue,
  type PropertyNameMapping,
  type PropertyRow,
  type PropertyMappingType,
  type PropertyValueSchema,
  type SourceRow,
  PROPERTY_DATA_FORMATS,
} from '@/src/types/schema';
import {
  PropertyExampleValuesEditor,
  type PropertyExampleValuesEditorHandle,
  PropertyNameMappingsEditor,
  PropertyValueSchemaEditor,
  serializeExampleValuesForSave,
  serializeNameMappingsForSave,
  validateExampleValuesForSave,
} from '@/src/features/properties/components/PropertyJsonFieldEditors';
import type { ApiError } from '@/src/features/properties/hooks/useProperties';
import type { PropertyUpdatePayload } from '@/src/features/properties/hooks/useProperties';
import { useCatalogs } from '@/src/features/catalogs/hooks/useCatalogs';
import {
  createWorkspaceSource,
  listWorkspaceSources,
} from '@/src/features/events/lib/eventTriggerSourcesApi';
import { fetchPropertySourceIds } from '@/src/features/properties/lib/propertySourcesApi';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { useStore } from '@/src/store';
import {
  AlertCircle,
  Braces,
  Clock3,
  Hash,
  Link2,
  List,
  Plus,
  Settings,
  ToggleLeft,
  Trash2,
  Type,
  User,
  X,
  Zap,
} from 'lucide-react';

/** Model: one row per (workspace, context, name). Not for per-event property variants—see event_properties / separate rows. */
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

const DATA_TYPE_SELECT_OPTIONS: IconSelectOption<PropertyDataType>[] = UI_DATA_TYPES.map(
  (t) => ({
    value: t.value,
    label: t.label,
    icon:
      t.value === 'array' ? (
        <List className="h-4 w-4" />
      ) : t.value === 'object' ? (
        <Braces className="h-4 w-4" />
      ) : t.value === 'boolean' ? (
        <ToggleLeft className="h-4 w-4" />
      ) : t.value === 'number' ? (
        <Hash className="h-4 w-4" />
      ) : t.value === 'timestamp' ? (
        <Clock3 className="h-4 w-4" />
      ) : (
        <Type className="h-4 w-4" />
      ),
  })
);

const CONTEXT_SELECT_OPTIONS: IconSelectOption<PropertyContext>[] = CONTEXTS.map((c) => ({
  value: c.value,
  label: c.label,
  icon:
    c.value === 'user_property' ? (
      <User className="h-4 w-4" />
    ) : c.value === 'system_property' ? (
      <Settings className="h-4 w-4" />
    ) : (
      <Zap className="h-4 w-4" />
    ),
}));

/** Display labels for PropertyDataFormat chips (allowed values are fixed in schema + API validation). */
const DATA_FORMAT_LABELS: Record<PropertyDataFormat, string> = {
  uuid: 'UUID',
  iso8601_datetime: 'ISO 8601 datetime',
  iso8601_date: 'ISO 8601 date',
  unix_seconds: 'Unix seconds',
  unix_milliseconds: 'Unix milliseconds',
  email: 'Email',
  uri: 'URI',
  currency_code: 'Currency code',
  country_code: 'Country code',
  language_code: 'Language code',
};

export interface PropertyEditorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** When set, sheet is in edit mode and uses updateProperty. */
  initialProperty?: PropertyRow | null;
  /** Workspace catalog list for linking object fields to existing properties. */
  workspaceProperties?: PropertyRow[];
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
  workspaceProperties = [],
  createProperty,
  updateProperty,
  deleteProperty,
  mutationError,
  clearMutationError,
}: PropertyEditorSheetProps) {
  const { activeWorkspaceId, hasValidWorkspaceContext } = useWorkspaceShell();
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
  const [valueSchemaDraft, setValueSchemaDraft] = useState<PropertyValueSchema | null>(null);
  const [objectChildRefsDraft, setObjectChildRefsDraft] = useState<Record<string, string>>({});
  const [exampleValuesDraft, setExampleValuesDraft] = useState<PropertyExampleValue[]>([]);
  const [nameMappingsDraft, setNameMappingsDraft] = useState<PropertyNameMapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [mappingEnabled, setMappingEnabled] = useState(false);
  const [mappedCatalogId, setMappedCatalogId] = useState('');
  const [mappedFieldId, setMappedFieldId] = useState('');
  const [mappingType, setMappingType] = useState<PropertyMappingType>('mapped_value');

  const [workspaceSources, setWorkspaceSources] = useState<SourceRow[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [propertySourceIdsError, setPropertySourceIdsError] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [newSourceName, setNewSourceName] = useState('');
  const [creatingSource, setCreatingSource] = useState(false);
  const [createSourceError, setCreateSourceError] = useState<string | null>(null);

  /** True after user changes linked sources; blocks stale async hydration from overwriting the selection. */
  const linkedSourcesUserTouchedRef = useRef(false);
  const linkedSourcesHydrationSeqRef = useRef(0);
  const exampleValuesEditorRef = useRef<PropertyExampleValuesEditorHandle>(null);

  const markLinkedSourcesUserTouched = useCallback(() => {
    linkedSourcesUserTouchedRef.current = true;
  }, []);

  const isEdit = Boolean(initialProperty?.id);

  useEffect(() => {
    if (isOpen) {
      setSaving(false);
      setDeleting(false);
      setEditorError(null);
      setCreateSourceError(null);
      setNewSourceName('');
      linkedSourcesUserTouchedRef.current = false;
      clearMutationError();
      if (initialProperty) {
        setName(initialProperty.name);
        setDescription(initialProperty.description ?? '');
        setCategory(initialProperty.category ?? '');
        setContext(initialProperty.context);
        setDataType(initialProperty.data_type);
        setPii(initialProperty.pii);
        setDataFormats(initialProperty.data_formats ?? []);
        setValueSchemaDraft(initialProperty.value_schema_json ?? null);
        setObjectChildRefsDraft(
          initialProperty.object_child_property_refs_json
            ? { ...initialProperty.object_child_property_refs_json }
            : {}
        );
        // Contract: only primitive properties manually own example values in this editor UI.
        if (
          initialProperty.data_type === 'string' ||
          initialProperty.data_type === 'number' ||
          initialProperty.data_type === 'boolean' ||
          initialProperty.data_type === 'timestamp'
        ) {
          setExampleValuesDraft((initialProperty.example_values_json ?? []).slice(0, 1));
        } else {
          setExampleValuesDraft([]);
        }
        setNameMappingsDraft(initialProperty.name_mappings_json ?? []);
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
        setValueSchemaDraft(null);
        setObjectChildRefsDraft({});
        setExampleValuesDraft([]);
        setNameMappingsDraft([]);
        setMappingEnabled(false);
        setMappedCatalogId('');
        setMappedFieldId('');
        setMappingType('mapped_value');
        setCatalogFields([]);
      }
    }
  }, [isOpen, clearMutationError, initialProperty, fetchCatalogFields]);

  useEffect(() => {
    if (!valueSchemaDraft || valueSchemaDraft.type !== 'object' || !valueSchemaDraft.properties) {
      return;
    }
    const keys = new Set(Object.keys(valueSchemaDraft.properties));
    setObjectChildRefsDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (!keys.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [valueSchemaDraft]);

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

  useEffect(() => {
    if (!isOpen || !activeWorkspaceId) {
      return;
    }
    let cancelled = false;
    setSourcesLoading(true);
    setSourcesError(null);
    listWorkspaceSources(activeWorkspaceId).then((result) => {
      if (cancelled) return;
      setSourcesLoading(false);
      if (result.success === false) {
        setSourcesError(result.error);
        setWorkspaceSources([]);
        return;
      }
      setWorkspaceSources(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeWorkspaceId]);

  useEffect(() => {
    if (!isOpen || !activeWorkspaceId) {
      return;
    }
    if (!initialProperty?.id) {
      setSelectedSourceIds([]);
      setPropertySourceIdsError(null);
      return;
    }
    let cancelled = false;
    const hydrationSeq = ++linkedSourcesHydrationSeqRef.current;
    setPropertySourceIdsError(null);
    fetchPropertySourceIds(activeWorkspaceId, initialProperty.id).then((result) => {
      if (cancelled) return;
      if (hydrationSeq !== linkedSourcesHydrationSeqRef.current) return;
      if (linkedSourcesUserTouchedRef.current) return;
      if (result.success === false) {
        setPropertySourceIdsError(result.error);
        setSelectedSourceIds([]);
        return;
      }
      setSelectedSourceIds(result.source_ids);
      setPropertySourceIdsError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeWorkspaceId, initialProperty?.id]);

  const handleCreateInlineSource = async () => {
    if (!hasValidWorkspaceContext) {
      setCreateSourceError('Select a valid workspace in the header before creating a source.');
      return;
    }
    const trimmed = newSourceName.trim();
    if (!trimmed || !activeWorkspaceId) return;
    setCreatingSource(true);
    setCreateSourceError(null);
    const result = await createWorkspaceSource({
      workspaceId: activeWorkspaceId,
      name: trimmed,
    });
    setCreatingSource(false);
    if (result.success === false) {
      setCreateSourceError(result.error);
      return;
    }
    const created = result.data;
    useStore.getState().upsertSourceFromApi(created);
    markLinkedSourcesUserTouched();
    setWorkspaceSources((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    setSelectedSourceIds((prev) =>
      prev.includes(created.id) ? prev : [...prev, created.id]
    );
    setNewSourceName('');
  };

  const handleDelete = async () => {
    if (!isEdit || !initialProperty || !deleteProperty) return;
    if (!hasValidWorkspaceContext) return;

    const ok = window.confirm(`Delete property "${initialProperty.name}"?`);
    if (!ok) return;

    setDeleting(true);
    setEditorError(null);
    clearMutationError();
    const result = await deleteProperty(initialProperty.id);
    setDeleting(false);

    if (result.success === true) {
      onClose();
      return;
    }
    // Explicitly surface delete conflicts (e.g. property still referenced).
    const err = result.error;
    if (err.status === 409) {
      let detailMsg = '';
      try {
        const parsed = err.details ? (JSON.parse(err.details) as any) : null;
        if (parsed && typeof parsed === 'object') {
          const ev = typeof parsed.used_in_events === 'number' ? parsed.used_in_events : null;
          const nested =
            typeof parsed.used_in_nested_object_properties === 'number'
              ? parsed.used_in_nested_object_properties
              : null;
          if (ev !== null || nested !== null) {
            detailMsg = ` It is used in ${ev ?? 0} event(s) and ${nested ?? 0} nested object propert${
              (nested ?? 0) === 1 ? 'y' : 'ies'
            }.`;
          }
        }
      } catch {
        // ignore JSON parse errors; message fallback below
      }
      setEditorError(`Cannot delete property.${detailMsg || ` ${err.message}`}`);
      return;
    }
    setEditorError(err.message || 'Failed to delete property.');
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (!hasValidWorkspaceContext) return;

    setEditorError(null);
    setSaving(true);
    clearMutationError();

    const value_schema_json =
      dataType === 'object' || dataType === 'array' ? valueSchemaDraft : null;

    const object_child_property_refs_json = ((): Record<string, string> | null => {
      if (dataType !== 'object') return null;
      const props = valueSchemaDraft?.type === 'object' ? valueSchemaDraft.properties : undefined;
      if (!props) return null;
      const out: Record<string, string> = {};
      const selfId = initialProperty?.id;
      for (const key of Object.keys(props)) {
        const id = objectChildRefsDraft[key]?.trim();
        if (id && id !== selfId) out[key] = id;
      }
      return Object.keys(out).length > 0 ? out : null;
    })();

    const isPrimitiveType =
      dataType === 'string' ||
      dataType === 'number' ||
      dataType === 'boolean' ||
      dataType === 'timestamp';

    const example_values_json = await (async () => {
      // Contract: object/array examples are derived from linked child primitive properties.
      if (!isPrimitiveType) return null;

      const flushExamples = exampleValuesEditorRef.current?.flushPendingForSave();
      if (flushExamples && flushExamples.ok === false) {
        setEditorError(flushExamples.error);
        setSaving(false);
        return undefined;
      }
      const exampleValuesForSave = flushExamples?.ok ? flushExamples.entries : exampleValuesDraft;

      const exampleCheck = validateExampleValuesForSave(exampleValuesForSave);
      if (exampleCheck.ok === false) {
        setEditorError(exampleCheck.error);
        setSaving(false);
        return undefined;
      }
      return serializeExampleValuesForSave(exampleValuesForSave);
    })();
    if (example_values_json === undefined) return;
    const name_mappings_json = serializeNameMappingsForSave(nameMappingsDraft);

    if (isEdit && initialProperty && updateProperty) {
      const payload: PropertyUpdatePayload = {
        name: trimmedName,
        description: description.trim() || undefined,
        category: category.trim() || null,
        context,
        pii,
        data_type: dataType,
        data_formats: dataFormats.length > 0 ? dataFormats : null,
        value_schema_json,
        object_child_property_refs_json,
        example_values_json,
        name_mappings_json,
        source_ids: selectedSourceIds,
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
      value_schema_json,
      object_child_property_refs_json,
      example_values_json,
      name_mappings_json,
      mapped_catalog_id: null,
      mapped_catalog_field_id: null,
      mapping_type: null,
      ...(selectedSourceIds.length > 0 ? { source_ids: selectedSourceIds } : {}),
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Required</h3>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" htmlFor="property-editor-name">
            Name
          </label>
          <Input
            id="property-editor-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. user_id, checkout_completed"
            className="font-mono"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" id="property-value-type-label">
            Property value type
          </label>
          <IconSelect<PropertyDataType>
            value={dataType}
            onChange={(next) => {
              if (!next) return;
              setDataType(next);
              if (next !== 'object' && next !== 'array') {
                setValueSchemaDraft(null);
              }
            }}
            options={DATA_TYPE_SELECT_OPTIONS}
            disabled={isMutating}
            aria-labelledby="property-value-type-label"
            buttonClassName="font-mono"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700" id="property-context-label">
            Context
          </label>
          <IconSelect<PropertyContext>
            value={context}
            onChange={(next) => {
              if (next) setContext(next);
            }}
            options={CONTEXT_SELECT_OPTIONS}
            disabled={isMutating}
            aria-labelledby="property-context-label"
          />
          <p className="text-xs text-gray-500 leading-relaxed">
            Workspace-wide definition. The same name may exist once per context (event vs user vs system). This is not
            “variants”: there is no per-event override on this row—use separate property rows or event-level metadata
            (e.g. event_properties) instead of overloading Context.
          </p>
        </div>

        <hr className="border-gray-200" />

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Optional</h3>
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
          <label className="text-sm font-medium text-gray-700" id="data-formats-label">
            Data formats (optional)
          </label>
          <p className="text-xs text-gray-500">
            Allowed values are fixed in the product schema and API. Reusable workspace presets would need new settings
            storage and validation—deferred until the backend accepts custom format tokens.
          </p>
          {dataFormats.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-labelledby="data-formats-label">
              {dataFormats.map((format) => (
                <span
                  key={format}
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-gray-50 px-2 py-1 text-xs text-gray-800"
                >
                  <span>{DATA_FORMAT_LABELS[format]}</span>
                  <button
                    type="button"
                    onClick={() => setDataFormats((prev) => prev.filter((f) => f !== format))}
                    className="rounded p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${DATA_FORMAT_LABELS[format]}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <select
            key={dataFormats.join('|')}
            value=""
            onChange={(e) => {
              const v = e.target.value as PropertyDataFormat;
              if (v && PROPERTY_DATA_FORMATS.includes(v) && !dataFormats.includes(v)) {
                setDataFormats((prev) => [...prev, v]);
              }
            }}
            aria-label="Add a data format"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Add format…</option>
            {PROPERTY_DATA_FORMATS.filter((f) => !dataFormats.includes(f)).map((format) => (
              <option key={format} value={format}>
                {DATA_FORMAT_LABELS[format]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Value schema</label>
          <p className="text-xs text-gray-500">
            Optional. Describes shape for <span className="font-mono">object</span> and{' '}
            <span className="font-mono">array</span> property types (matches API v1 contract).
          </p>
          <PropertyValueSchemaEditor
            dataType={dataType}
            value={valueSchemaDraft}
            onChange={setValueSchemaDraft}
            disabled={isMutating}
            objectChildRefs={objectChildRefsDraft}
            onObjectChildRefsChange={setObjectChildRefsDraft}
            linkPropertyOptions={workspaceProperties.map((p) => ({
              id: p.id,
              name: p.name,
              data_type: p.data_type,
              name_mappings_json: p.name_mappings_json ?? null,
            }))}
            excludePropertyId={initialProperty?.id ?? null}
          />
        </div>

        {(dataType === 'string' ||
          dataType === 'number' ||
          dataType === 'boolean' ||
          dataType === 'timestamp') && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Example value</label>
            <p className="text-xs text-gray-500">One canonical example value for this property.</p>
            <PropertyExampleValuesEditor
              ref={exampleValuesEditorRef}
              propertyDataType={dataType}
              entries={exampleValuesDraft}
              onChange={setExampleValuesDraft}
              disabled={isMutating}
            />
          </div>
        )}

        {(dataType === 'object' || dataType === 'array') && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Example value</label>
            <p className="text-xs text-gray-500">
              Example values are defined on linked primitive properties and propagated into complex structures automatically.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Name mappings</label>
          <p className="text-xs text-gray-500">
            How this property appears in external systems (<span className="font-mono">system</span>,{' '}
            <span className="font-mono">name</span>, <span className="font-mono">role</span>, optional{' '}
            <span className="font-mono">notes</span>).
          </p>
          <PropertyNameMappingsEditor
            entries={nameMappingsDraft}
            onChange={setNameMappingsDraft}
            disabled={isMutating}
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
          <label className="text-sm font-medium text-gray-700" id="property-sources-label">
            Sources
          </label>
          <p className="text-xs text-gray-500">
            Link workspace sources to this property definition. You can still attach the property to events separately.
          </p>
          {sourcesLoading && (
            <p className="text-xs text-gray-500" role="status">
              Loading sources…
            </p>
          )}
          {sourcesError && !sourcesLoading && (
            <p className="text-xs text-red-600" role="alert">
              {sourcesError}
            </p>
          )}
          {propertySourceIdsError && !sourcesLoading && (
            <p className="text-xs text-red-600" role="alert">
              {propertySourceIdsError}
            </p>
          )}
          {selectedSourceIds.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-labelledby="property-sources-label">
              {selectedSourceIds.map((id) => {
                const src = workspaceSources.find((s) => s.id === id);
                const label = src?.name ?? id;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-md border border-input bg-gray-50 px-2 py-1 text-xs text-gray-800 max-w-full"
                  >
                    <span className="truncate">{label}</span>
                    <button
                      type="button"
                      onClick={() => {
                        markLinkedSourcesUserTouched();
                        setSelectedSourceIds((prev) => prev.filter((x) => x !== id));
                      }}
                      className="rounded p-0.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                      aria-label={`Remove source ${label}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <select
            key={[...selectedSourceIds].sort().join(',')}
            value=""
            disabled={sourcesLoading || !activeWorkspaceId || !hasValidWorkspaceContext}
            onChange={(e) => {
              const id = e.target.value;
              if (id) {
                markLinkedSourcesUserTouched();
                setSelectedSourceIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
              }
            }}
            aria-label="Add a source"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <option value="">Add source…</option>
            {workspaceSources
              .filter((s) => !selectedSourceIds.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3 space-y-2">
            <p className="text-xs font-medium text-gray-600">New source</p>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCreateInlineSource();
                  }
                }}
                placeholder="Source name"
                disabled={creatingSource || !activeWorkspaceId || !hasValidWorkspaceContext}
                className="flex-1 min-w-[140px]"
                aria-label="New source name"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 shrink-0"
                onClick={() => void handleCreateInlineSource()}
                disabled={
                  creatingSource ||
                  !newSourceName.trim() ||
                  !activeWorkspaceId ||
                  !hasValidWorkspaceContext
                }
              >
                <Plus className="w-4 h-4" />
                {creatingSource ? 'Adding…' : 'Add'}
              </Button>
            </div>
            {createSourceError && (
              <p className="text-xs text-red-600" role="alert">
                {createSourceError}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 right-0 w-[480px] p-6 bg-white border-t flex justify-between gap-2 z-10">
        {isEdit && initialProperty ? (
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isMutating || !hasValidWorkspaceContext}
            title={
              !hasValidWorkspaceContext
                ? 'Select a valid workspace in the header before deleting this property.'
                : undefined
            }
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
          <Button
            onClick={handleSave}
            disabled={isMutating || !name.trim() || !hasValidWorkspaceContext}
            title={
              !hasValidWorkspaceContext
                ? 'Select a valid workspace in the header before saving this property.'
                : undefined
            }
          >
            {saving ? 'Saving…' : 'Save Property'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
