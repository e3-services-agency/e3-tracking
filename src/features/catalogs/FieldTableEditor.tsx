/**
 * Catalog field table editor (T-4-33): one row per field, every detail in the row. Controlled:
 * the parent owns the draft rows and saves them with the catalog. Layout is container-driven (the
 * same table at the side-panel width and at the maximized Sheet width); the only horizontal
 * scroll is inside the table wrapper, and the header row sticks inside that scrolling body.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { PROPERTY_DATA_TYPES, CATALOG_SEARCHABLE_LIMIT } from '@/src/domain/enums';
import { CATALOG_MAIN_COLUMNS } from '@/src/domain/bloomreach';
import { hintFor } from '@/src/components/ui/FieldHint';
import { moveItem } from '@/src/domain/moveItem';
import { moveFieldByKey, setLookupKey, validateCatalogFields, type CatalogFieldDraftLike } from '@/src/domain/catalogs';

export interface CatalogFieldDraft extends CatalogFieldDraftLike {
  /** Server id; absent for a row not saved yet. */
  id?: string;
  is_required: boolean;
  client_field_name: string;
  bloomreach_column: string;
}

let counter = 0;
export function newDraftKey(): string {
  counter += 1;
  return `new-${counter}`;
}

export function blankDraft(name = ''): CatalogFieldDraft {
  return { key: newDraftKey(), name, data_type: 'string', is_lookup_key: false, is_searchable: false, is_required: false, client_field_name: '', bloomreach_column: '' };
}

const cell = 'px-1.5 py-1 align-middle';
const input = 'w-full h-7 rounded border border-gray-300 bg-white px-1.5 text-xs';

export function FieldTableEditor({
  fields,
  onChange,
  referencedNames,
}: {
  fields: CatalogFieldDraft[];
  onChange: (next: CatalogFieldDraft[]) => void;
  /** Field names a property link points at; deleting one asks for confirmation. */
  referencedNames: ReadonlySet<string>;
}) {
  const validation = validateCatalogFields(fields);
  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  useEffect(() => {
    if (focusKey && nameRefs.current[focusKey]) {
      nameRefs.current[focusKey]!.focus();
      setFocusKey(null);
    }
  }, [focusKey, fields]);

  const patch = (key: string, p: Partial<CatalogFieldDraft>) => onChange(fields.map((f) => (f.key === key ? { ...f, ...p } : f)));
  const add = () => {
    const row = blankDraft();
    onChange([...fields, row]);
    setFocusKey(row.key);
  };
  const duplicate = (key: string) => {
    const i = fields.findIndex((f) => f.key === key);
    if (i < 0) return;
    const src = fields[i];
    const copy: CatalogFieldDraft = { ...src, id: undefined, key: newDraftKey(), name: `${src.name}_copy`, is_lookup_key: false };
    const next = [...fields];
    next.splice(i + 1, 0, copy);
    onChange(next);
    setFocusKey(copy.key);
  };
  const remove = (f: CatalogFieldDraft) => {
    if (referencedNames.has(f.name) && !window.confirm(`"${f.name}" is referenced by a property link. Delete it anyway?`)) return;
    onChange(fields.filter((x) => x.key !== f.key));
  };

  const searchWarn = validation.searchableCount >= CATALOG_SEARCHABLE_LIMIT;
  const searchOver = validation.searchableCount > CATALOG_SEARCHABLE_LIMIT;
  const th = 'px-1.5 py-1.5 font-medium text-gray-500 text-left sticky top-0 bg-gray-50 z-10 border-b whitespace-nowrap';

  return (
    <div className="space-y-2 @container" data-testid="catalog-field-table">
      <div className="overflow-auto max-h-[60vh] border rounded-md">
        <table className="text-xs w-full min-w-[640px] @3xl:min-w-0">
          <thead>
            <tr>
              <th className={th} aria-label="Reorder" />
              <th className={th} title={hintFor('Name', 'Catalogs')}>Name</th>
              <th className={th} title={hintFor('Data type', 'Catalogs')}>Data type</th>
              <th className={th} title={hintFor('Lookup key', 'Catalogs')}>Lookup key</th>
              <th className={`${th} ${searchOver ? 'text-red-700' : searchWarn ? 'text-amber-700' : ''}`} title={hintFor('Searchable', 'Catalogs')} data-testid="searchable-header">
                Searchable {validation.searchableCount}/{CATALOG_SEARCHABLE_LIMIT}
              </th>
              <th className={th} title={hintFor('Required', 'Catalogs')}>Required</th>
              <th className={th} title={hintFor('Client field name', 'Catalogs')}>Client field name</th>
              <th className={th} title={hintFor('Bloomreach column', 'Catalogs')}>Bloomreach column</th>
              <th className={th} aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((f, i) => {
              const errs = validation.rowErrors[f.key];
              return (
                <React.Fragment key={f.key}>
                  <tr
                    draggable={armedKey === f.key}
                    onDragStart={(e) => { setDragKey(f.key); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { if (dragKey) { e.preventDefault(); setOverKey(f.key); } }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragKey && dragKey !== f.key) {
                        onChange(moveItem(fields, fields.findIndex((x) => x.key === dragKey), i));
                      }
                      setDragKey(null); setOverKey(null); setArmedKey(null);
                    }}
                    onDragEnd={() => { setDragKey(null); setOverKey(null); setArmedKey(null); }}
                    className={`${overKey === f.key && dragKey !== f.key ? 'bg-blue-50' : ''} ${errs ? 'bg-red-50/40' : ''}`}
                    data-testid="catalog-field-row"
                  >
                    <td className={`${cell} whitespace-nowrap`}>
                      <span
                        className="inline-flex cursor-grab text-gray-400 hover:text-gray-600"
                        onMouseDown={() => setArmedKey(f.key)}
                        onMouseUp={() => setArmedKey(null)}
                        title="Drag to reorder"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                    </td>
                    <td className={cell}>
                      <input
                        ref={(el) => { nameRefs.current[f.key] = el; }}
                        value={f.name}
                        onChange={(e) => patch(f.key, { name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (i === fields.length - 1) add(); } }}
                        aria-label={`Name of field ${i + 1}`}
                        aria-invalid={errs ? true : undefined}
                        className={`${input} min-w-[7rem] ${errs ? 'border-red-400' : ''}`}
                      />
                    </td>
                    <td className={cell}>
                      <select value={f.data_type ?? 'string'} onChange={(e) => patch(f.key, { data_type: e.target.value })} aria-label={`Data type of ${f.name || 'field'}`} className={`${input} w-24`}>
                        {[...new Set([...PROPERTY_DATA_TYPES, f.data_type ?? 'string'])].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className={`${cell} text-center`}>
                      <input
                        type="radio"
                        name="catalog-lookup-key"
                        checked={f.is_lookup_key}
                        disabled={(f.data_type ?? 'string') !== 'string' && !f.is_lookup_key}
                        title={(f.data_type ?? 'string') !== 'string' ? 'The lookup key must be a string.' : undefined}
                        onChange={() => onChange(setLookupKey(fields, f.key))}
                        aria-label={`${f.name || 'Field'} is the lookup key`}
                      />
                    </td>
                    <td className={`${cell} text-center`}>
                      <input type="checkbox" checked={f.is_searchable} onChange={(e) => patch(f.key, { is_searchable: e.target.checked })} aria-label={`${f.name || 'Field'} is searchable`} />
                    </td>
                    <td className={`${cell} text-center`}>
                      <input type="checkbox" checked={f.is_required} onChange={(e) => patch(f.key, { is_required: e.target.checked })} aria-label={`${f.name || 'Field'} is required`} />
                    </td>
                    <td className={cell}>
                      <input value={f.client_field_name} onChange={(e) => patch(f.key, { client_field_name: e.target.value })} aria-label={`Client field name of ${f.name || 'field'}`} className={`${input} min-w-[6rem]`} />
                    </td>
                    <td className={cell}>
                      <select value={f.bloomreach_column} onChange={(e) => patch(f.key, { bloomreach_column: e.target.value })} aria-label={`Bloomreach column of ${f.name || 'field'}`} className={`${input} w-28`}>
                        <option value="">—</option>
                        {CATALOG_MAIN_COLUMNS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className={`${cell} whitespace-nowrap text-right`}>
                      <button type="button" className="p-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30" disabled={i === 0} onClick={() => onChange(moveFieldByKey(fields, f.key, -1))} title="Move up" aria-label={`Move ${f.name || 'field'} up`}><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button type="button" className="p-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30" disabled={i === fields.length - 1} onClick={() => onChange(moveFieldByKey(fields, f.key, 1))} title="Move down" aria-label={`Move ${f.name || 'field'} down`}><ArrowDown className="w-3.5 h-3.5" /></button>
                      <button type="button" className="p-0.5 text-gray-500 hover:text-gray-800" onClick={() => duplicate(f.key)} title="Duplicate" aria-label={`Duplicate ${f.name || 'field'}`}><Copy className="w-3.5 h-3.5" /></button>
                      <button type="button" className="p-0.5 text-red-500 hover:text-red-700" onClick={() => remove(f)} title="Delete field" aria-label={`Delete ${f.name || 'field'}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                  {errs && (
                    <tr data-testid="catalog-field-error">
                      <td />
                      <td colSpan={8} className="px-1.5 pb-1 text-[11px] text-red-600">{[...new Set(errs)].join(' ')}</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {fields.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-4 text-center text-gray-500">No fields yet. Add one below.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900">
        <Plus className="w-3.5 h-3.5" /> Add field
      </button>
    </div>
  );
}
