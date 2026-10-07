/**
 * Property kind and derivation rule editor (D-63, T-4-17). A `state_list` property is computed
 * from the items of the dataLayer collection: either a list of ids / `{id, quantity}` pairs, or a
 * total summed over the items. The kinds and forms come from `src/domain/enums.ts`; the stored
 * shape is `src/domain/codegen/derivation.ts`'s `PropertyDerivation`.
 */
import React from 'react';
import { EnumSelect } from '@/src/components/ui/EnumSelect';
import { FieldLabel } from '@/src/components/ui/FieldHint';
import { Input } from '@/src/components/ui/Input';
import { PROPERTY_KINDS, DERIVATION_FORMS } from '@/src/domain/enums';
import { isSumDerivation, parseDerivation, type PropertyDerivation } from '@/src/domain/codegen/derivation';

export interface DerivationDraft {
  mode: 'list' | 'sum';
  idField: string;
  form: string;
  quantityField: string;
  sum: string;
}

export const EMPTY_DERIVATION_DRAFT: DerivationDraft = {
  mode: 'list',
  idField: '',
  form: 'ids',
  quantityField: 'quantity',
  sum: 'price*quantity',
};

export function draftFromDerivation(value: unknown): DerivationDraft {
  const d = parseDerivation(value);
  if (!d) return EMPTY_DERIVATION_DRAFT;
  if (isSumDerivation(d)) return { ...EMPTY_DERIVATION_DRAFT, mode: 'sum', sum: d.sum };
  return { ...EMPTY_DERIVATION_DRAFT, mode: 'list', idField: d.id_field, form: d.form, quantityField: d.quantity_field ?? 'quantity' };
}

/** The `derivation_json` to save for `kind` (`null` unless it is a state list). */
export function derivationFromDraft(kind: string, draft: DerivationDraft): PropertyDerivation | null {
  if (kind !== 'state_list') return null;
  if (draft.mode === 'sum') return { source: 'items', sum: draft.sum.trim() };
  return {
    source: 'items',
    id_field: draft.idField.trim(),
    form: draft.form as 'ids' | 'id_quantity',
    ...(draft.form === 'id_quantity' && draft.quantityField.trim() ? { quantity_field: draft.quantityField.trim() } : {}),
  };
}

export function DerivationEditor({
  kind,
  onKindChange,
  draft,
  onDraftChange,
}: {
  kind: string;
  onKindChange: (kind: string) => void;
  draft: DerivationDraft;
  onDraftChange: (draft: DerivationDraft) => void;
}) {
  const patch = (p: Partial<DerivationDraft>) => onDraftChange({ ...draft, ...p });
  const selectClass = 'w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hintScope="Properties">Kind</FieldLabel>
        <EnumSelect kind="property_kind" values={PROPERTY_KINDS} value={kind} onChange={(e) => onKindChange(e.target.value)} className={selectClass} />
        <p className="text-xs text-gray-500">
          event: event-level attribute. item: attribute of the one item interacted with. state_list: computed from all items.
          context: project-wide context, tracked as an SDK default property.
        </p>
      </div>
      {kind === 'state_list' && (
        <div className="space-y-3 rounded-md border bg-gray-50 p-3">
          <div className="space-y-2">
            <FieldLabel className="text-sm font-medium text-gray-700" hintScope="Properties">Computed as</FieldLabel>
            <select value={draft.mode} onChange={(e) => patch({ mode: e.target.value as DerivationDraft['mode'] })} className={selectClass}>
              <option value="list">a list built from each item</option>
              <option value="sum">a total summed over the items</option>
            </select>
          </div>
          {draft.mode === 'list' ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <FieldLabel className="text-sm font-medium text-gray-700" hintScope="Properties">Id field</FieldLabel>
                <Input value={draft.idField} onChange={(e) => patch({ idField: e.target.value })} placeholder="product_id" />
              </div>
              <div className="space-y-2">
                <FieldLabel className="text-sm font-medium text-gray-700" hintScope="Properties">Form</FieldLabel>
                <select value={draft.form} onChange={(e) => patch({ form: e.target.value })} className={selectClass}>
                  {DERIVATION_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              {draft.form === 'id_quantity' && (
                <div className="space-y-2">
                  <FieldLabel className="text-sm font-medium text-gray-700" hintScope="Properties">Quantity field</FieldLabel>
                  <Input value={draft.quantityField} onChange={(e) => patch({ quantityField: e.target.value })} placeholder="quantity" />
                  <p className="text-xs text-gray-500">The item field the quantity is read from. The list entries always use the key quantity.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <FieldLabel className="text-sm font-medium text-gray-700" hintScope="Properties">Sum of item fields</FieldLabel>
              <Input value={draft.sum} onChange={(e) => patch({ sum: e.target.value })} placeholder="price*quantity" />
              <p className="text-xs text-gray-500">Item field names joined by *, e.g. price*quantity. A value supplied in the dataLayer wins over the computed one.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
