/**
 * Bloomreach Data Manager type mapping, both directions (D-28, D-37, T-2-02). Bloomreach Data
 * Manager types are `string, number, boolean, date, datetime, list, long text, url`; the app has
 * six data types (`src/domain/enums.ts`'s `PROPERTY_DATA_TYPES`) plus formats
 * (`PROPERTY_DATA_FORMATS`). Used by both Data Manager import planners
 * (`dataManagerCustomers.ts`/`dataManagerEvents.ts`), both exporters and comparison 4
 * (`definitionVsDataManager.ts`, T-2-04) — one mapping, never duplicated.
 *
 * Pure, no DB/Express import (domain-model skill).
 */
import { PROPERTY_DATA_TYPES, PROPERTY_DATA_FORMATS, type PropertyDataType, type PropertyDataFormat } from '../enums';

export interface ToAppTypeResult {
  data_type: PropertyDataType;
  data_formats: PropertyDataFormat[];
  /** Set when `dmType` is not one of the eight known Bloomreach types (imported as `string`). */
  warning: string | null;
}

export interface ToDataManagerTypeResult {
  type: string;
  /** Set when the app type has no exact Bloomreach counterpart (`object`, or an otherwise unmapped `data_type`). */
  warning: string | null;
}

/** The eight Bloomreach Data Manager types this module knows about (D-37). */
export const KNOWN_DATA_MANAGER_TYPES = ['string', 'long text', 'url', 'number', 'boolean', 'date', 'datetime', 'list'] as const;
export type KnownDataManagerType = (typeof KNOWN_DATA_MANAGER_TYPES)[number];

/**
 * Bloomreach Data Manager `type` -> app `data_type` + `data_formats` (D-37 table). An unrecognized
 * `dmType` is imported as plain `string` with a warning; the caller (the import planner) is
 * responsible for keeping the original string in `bloomreach_meta_json.raw.type` so export can
 * write it back verbatim instead of losing it to the lossy default.
 */
export function toAppType(dmType: string): ToAppTypeResult {
  switch (dmType) {
    case 'string':
      return { data_type: 'string', data_formats: [], warning: null };
    case 'long text':
      return { data_type: 'string', data_formats: ['long_text'], warning: null };
    case 'url':
      return { data_type: 'string', data_formats: ['uri'], warning: null };
    case 'number':
      return { data_type: 'number', data_formats: [], warning: null };
    case 'boolean':
      return { data_type: 'boolean', data_formats: [], warning: null };
    case 'date':
      return { data_type: 'timestamp', data_formats: ['iso8601_date'], warning: null };
    case 'datetime':
      return { data_type: 'timestamp', data_formats: [], warning: null };
    case 'list':
      return { data_type: 'array', data_formats: [], warning: null };
    default:
      return {
        data_type: 'string',
        data_formats: [],
        warning: `Unknown Data Manager type "${dmType}"; imported as string.`,
      };
  }
}

/**
 * App `data_type` + `data_formats` -> Bloomreach Data Manager `type` (D-37 reverse rule). Bloomreach
 * has no `object` type: exported as `string` with a warning. An app `data_type` outside
 * `PROPERTY_DATA_TYPES` (should not happen; defensive) also falls back to `string` with a warning.
 */
/**
 * App data formats that plausibly still apply after a property's app `data_type` genuinely changes
 * (T-2-02 fix round, D-37 reverse rule). Most `PROPERTY_DATA_FORMATS` (`email`, `money`,
 * `country_code`, ...) are pure app enrichment with no Bloomreach Data Manager counterpart — they
 * are never produced by `toAppType` and must not be wiped by a Data Manager import just because the
 * Bloomreach type changed; this table says which of them still make sense for the *new* app type so
 * they can be kept, while formats tied to the *old* type are dropped.
 */
const FORMATS_COMPATIBLE_WITH_TYPE: Record<PropertyDataType, readonly PropertyDataFormat[]> = {
  string: ['uuid', 'email', 'uri', 'currency_code', 'country_code', 'language_code', 'long_text'],
  number: ['money'],
  boolean: [],
  timestamp: ['iso8601_datetime', 'iso8601_date', 'unix_seconds', 'unix_milliseconds'],
  object: [],
  array: [],
};

/** See `FORMATS_COMPATIBLE_WITH_TYPE`. Unknown `dataType` (should not happen) returns `[]`. */
export function formatsCompatibleWithType(dataType: PropertyDataType): readonly PropertyDataFormat[] {
  return FORMATS_COMPATIBLE_WITH_TYPE[dataType] ?? [];
}

export function toDataManagerType(dataType: string, dataFormats: readonly string[] | null | undefined): ToDataManagerTypeResult {
  const formats = dataFormats ?? [];
  switch (dataType) {
    case 'string':
      if (formats.includes('long_text')) return { type: 'long text', warning: null };
      if (formats.includes('uri')) return { type: 'url', warning: null };
      return { type: 'string', warning: null };
    case 'number':
      // "any formats incl. money" (D-37): money and every other number format still round-trip as `number`.
      return { type: 'number', warning: null };
    case 'boolean':
      return { type: 'boolean', warning: null };
    case 'timestamp':
      if (formats.includes('iso8601_date')) return { type: 'date', warning: null };
      return { type: 'datetime', warning: null };
    case 'array':
      return { type: 'list', warning: null };
    case 'object':
      return { type: 'string', warning: 'Bloomreach has no "object" type; exported as string.' };
    default:
      if ((PROPERTY_DATA_TYPES as readonly string[]).includes(dataType)) {
        return { type: 'string', warning: null };
      }
      return { type: 'string', warning: `Unmapped app data type "${dataType}"; exported as string.` };
  }
}
