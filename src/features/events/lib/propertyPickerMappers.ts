import type { Property } from '@/src/types';
import type { PropertyRow, PropertyDataType } from '@/src/types/schema';

/** Minimal PropertyRow for `EventAttachPropertyPicker` when the source is legacy store `Property`. */
export function legacyPropertyToPickerRow(p: Property): PropertyRow {
  const vt = p.property_value_type;
  const data_type: PropertyDataType =
    vt === 'boolean'
      ? 'boolean'
      : vt === 'integer' || vt === 'float'
        ? 'number'
        : 'string';
  return {
    id: p.id,
    workspace_id: '',
    context: 'event_property',
    name: p.name,
    description: p.description || null,
    category: null,
    pii: false,
    data_type,
    data_formats: null,
    value_schema_json: null,
    object_child_property_refs_json: null,
    example_values_json: null,
    name_mappings_json: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    mapped_catalog_id: null,
    mapped_catalog_field_id: null,
    mapping_type: null,
    bundle_ids: undefined,
  };
}
