import type { PropertyDataType } from '@/src/types/schema';
import { PROPERTY_DATA_TYPES } from '@/src/types/schema';

/** Human-readable labels for property value types (UI only; values stay schema enums). */
export const PROPERTY_DATA_TYPE_UI_LABELS: Record<PropertyDataType, string> = {
  string: 'String',
  number: 'Number',
  boolean: 'Boolean',
  timestamp: 'Timestamp',
  object: 'Object',
  array: 'Array',
};

export function propertyDataTypeUiLabel(dataType: PropertyDataType): string {
  return PROPERTY_DATA_TYPE_UI_LABELS[dataType];
}

/** Stable order matching `PROPERTY_DATA_TYPES` for selects. */
export const PROPERTY_DATA_TYPE_UI_OPTIONS: { value: PropertyDataType; label: string }[] =
  PROPERTY_DATA_TYPES.map((value) => ({
    value,
    label: PROPERTY_DATA_TYPE_UI_LABELS[value],
  }));
