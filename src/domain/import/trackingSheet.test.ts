import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { readWorkbook } from '../../../scripts/lib/tracking-sheet-io.mjs';
import {
  diffFillEmpty,
  mapDataFormats,
  mapDataType,
  mapEventStatus,
  extractAllowedValues,
  mapImplementationMethod,
  parseTrackingSheet,
  planTrackingSheetImport,
  stripEmoji,
  type ExistingState,
  type ExistingDefinition,
  type ImportProfile,
  type PlanOp,
} from './trackingSheet';

/** A tiny synthetic workbook in the E3 template layout (header rows are not on row 1). No client data. */
async function buildWorkbook(): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const add = (name: string, rows: unknown[][]) => {
    const ws = wb.addWorksheet(name);
    rows.forEach((r) => ws.addRow(r));
  };
  add('💎Events', [
    ['note row'],
    ['EVENTS (4)'],
    [],
    ['EVENT NAME', 'DESCRIPTION', 'OWNER', 'PAGE', 'TRIGGER', 'IDENTITY', 'PURPOSE', 'EVENT TYPE', 'SOURCE of LIVE DATA', 'SOURCE of HISTORICAL DATA', 'SOURCE of DAILY DATA', 'PRIORITY', 'TRACKING STATUS', 'SOURCE TYPE', 'RELIABILITY', 'TIMING'],
    ['view_item', 'Viewing a product', 'Client', 'Product page', 'Customer opens it', 'cookie', 'Recommendations', 'custom', null, null, null, 'High', 'planned', 'Frontend', 'TBD', 'Real-Time'],
    ['purchase', 'A purchase', 'Client', null, null, 'email', null, 'custom', null, null, null, 'Critical', 'code review', 'Backend', 'TBD', 'Real-Time'],
    ['login', 'A login', 'Client', null, 'login', 'email', null, 'custom', null, null, null, 'TBD', 'planned', 'Frontend / Backend', null, null],
    ['session_start', 'Session', 'Client', null, null, 'cookie', null, 'system', null, null, null, 'TBD', 'planned', 'Bloomreach', null, null],
    ['booking', 'Reservation', 'Client', null, null, 'email', 'Travel retail', 'custom', null, null, null, 'Critical', 'planned', 'TBD', null, null],
  ]);
  add('💎Properties', [
    [null, 'Docs'],
    ['PROPERTIES (3)'],
    [],
    ['PROPERTY NAME', 'PROPERTY CATEGORY (10)', 'DESCRIPTION', 'PURPOSE', 'PII', 'DATA TYPE', 'DATA FORMAT', 'EXAMPLE VALUES', 'SOURCES', 'PRESENCE', 'PROPERTY TYPE', 'NOTES'],
    ['product_id', '🛍️ Product Related', 'Id of the product', null, false, 'String', 'trimmed', 'abc123', null, 'Always sent', 'custom', null],
    ['total_price', '📦Order Summary', 'Total', null, false, 'Number', 'float', 77.9, null, 'Always sent', 'custom', null],
    ['booking_id', '📦Order Summary', 'Booking id', null, false, 'String', 'trimmed', '7QRMYJ', null, 'Always sent', 'custom', null],
    ['currency', '📦Order Summary', 'Currency', null, false, 'String', 'ISO 4217 currency code, trimmed', 'EUR', null, 'Always sent', 'custom', null],
    ['broken_ref', '📦Order Summary', { error: '#REF!' }, null, false, 'String', null, null, null, 'Always sent', 'custom', null],
  ]);
  add('👤Customer Properties', [
    [null, 'Docs'],
    ['UNIQUE PROPERTIES (2)'],
    ['PROPERTY NAME', 'PROPERTY CATEGORY (4)', 'DESCRIPTION', 'PRIORITY', 'STATUS', 'PII', 'DATA TYPE', 'DATA FORMAT', 'EXAMPLE VALUES', 'SOURCES', 'NOTES'],
    ['email', '🆔 Identifiers & Status', 'Customer email', 'High', 'planned', true, 'String', 'lowercase, trimmed', 'a@b.cz', 'TBD', null],
    ['loyalty_tier', '🎯 Flags & Statuses', 'Tier', null, 'planned', false, 'String', null, 'gold', 'TBD', null],
  ]);
  add('🆔Identity', [
    ['Identity'],
    ['Identity'],
    ['FIELD IN BLOOMREACH', 'IDENTITY', 'TYPE', 'DESCRIPTION', 'VALUE', 'TRIGGER', 'EXAMPLE', 'OWNER', 'SOURCE', 'TRACKER', 'PRIORITY', 'STATUS'],
    ['customer_id', 'customer_id', 'Hard ID', 'CRM id'],
    ['cookie', 'cookie', 'Soft ID', 'Guest cookie', 'Bloomreach cookie', 'Bloomreach JS SDK loads', 'f87c', 'Bloomreach', 'JS SDK', 'JS SDK', 'High', 'planned'],
    ['login_id', 'login_id', 'Soft ID', 'Login', null, 'login', null, null, null, null, null, null],
  ]);
  add('💎Catalogs', [
    ['Catalogs'],
    [null, 'Multi-country note'],
    [null, 'products & variants', 'id'],
    ['CATALOG NAME', 'PROPERTY NAME (Bloomreach)', 'DESCRIPTION', 'PURPOSE', 'PRIORITY', 'STATUS', 'IS SEARCHABLE?', 'REQUIRED', 'ATTRIBUTE TYPE', 'DATA MAPPING', 'MAPPING TYPE', 'DATA TYPE', 'DATA FORMAT', 'EXAMPLE', 'NOTES'],
    ['Product Catalog', 'Unique Properties (2)', 'id = product_id'],
    ['products', 'product_id', 'Parent product id', null, 'Critical', 'planned', false, true, 'TBD', null, 'TBD', 'String', 'trimmed', 'p1'],
    ['products', 'title', 'Title', null, 'TBD', 'planned', true, false, 'TBD', null, 'TBD', 'String', 'trimmed', 'Shoe'],
    ['products', 'brand', { error: '#N/A' }, null, 'High', 'planned', false, false, 'TBD', null, 'TBD', { error: '#N/A' }, { error: '#N/A' }, { error: '#N/A' }],
    [null, null, null, null, null, null, false, false],
    ['Variants Catalog', 'Unique Properties (1)'],
    ['variants', 'size', 'Size', null, null, 'planned', false, false, null, null, null, 'String', null, 'M'],
  ]);
  add('⚡Events & Event Attributes', [
    ['Events & Event Attributes'],
    ['Events & Event Attributes'],
    ['EVENT_NAME', 'PROPERTY_NAME', 'PROPERTY_CATEGORY', 'DESCRIPTION', 'PRIORITY', 'STATUS', 'REQUIRED', 'PII', 'DATA TYPE', 'DATA FORMAT', 'EXAMPLE'],
    ['view_item', '✏️ Edit Source', 'ℹ️ Info', 'Total: 2'],
    ['view_item', 'action', '🆔Identifiers & Status', 'What happened (view, select_size)', null, 'planned', true, false, 'String', 'lowercase', 'view'],
    ['view_item', 'product_id', '🛍️ Product Related', 'Id of the product', null, 'planned', false, false, 'String', 'trimmed', 'abc'],
    ['purchase', 'total_price', '📦Order Summary', 'Total', null, 'planned', false, false, 'Number', 'float', 77.9],
    ['view_item', 'total_price', '📦Order Summary', 'Line total', null, 'planned', false, false, 'Number', 'float', 2],
    ['purchase', 'action', '🆔Identifiers & Status', 'Purchase step (pay, refund)', null, 'planned', false, false, 'String', 'lowercase', 'pay'],
    ['session_start', 'browser', '🌍Browsing Context', 'Browser', null, 'planned', false, false, false, 'String', 'Chrome'],
  ]);
  add('⚙️Dropdowns', [
    ['SOURCES', 'PRIORITY'],
    ['TBD', 'Critical'],
    ['Magento', 'High'],
  ]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-')), 'synthetic.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

const PROFILE: ImportProfile = {
  extra_events: [{ name: 'booking' }, { name: 'campaign' }, { name: 'managed_endpoint' }],
  attach_properties: { booking: ['booking_id', 'missing_prop'] },
  industry: 'travel',
  discriminators: { view_item: 'action', cart_update: 'action', consent: 'action' },
};

const emptyState = (over: Partial<ExistingState> = {}): ExistingState => ({
  project: { id: 'p1', key: 'demo', industry: null },
  sources: [
    { id: 's-front', name: 'Frontend', system: 'other', method: 'web_sdk_gtm_datalayer' },
    { id: 's-back', name: 'Backend', system: 'custom_backend', method: 'tracking_api' },
  ],
  properties: [],
  events: [],
  catalogs: [],
  identityRules: [],
  ...over,
});

const find = (ops: PlanOp[], entity: string, key: string) => ops.find((o) => o.entity === entity && o.key === key);

describe('value mappers', () => {
  it('strips emoji and maps statuses, types and formats', () => {
    expect(stripEmoji('🛍️ Product Related')).toBe('Product Related');
    expect(stripEmoji('Acme® Pro™ ©')).toBe('Acme® Pro™ ©');
    expect(mapEventStatus('code review')).toBe('in_review');
    expect(mapEventStatus('TBD')).toBeNull();
    expect(mapDataType('DateTime').data_type).toBe('timestamp');
    expect(mapDataType('List').data_type).toBe('array');
    expect(mapDataType('#N/A')).toMatchObject({ data_type: 'string', defaulted_reason: expect.stringContaining('#N/A') });
    const f = mapDataFormats('ISO 4217 currency code, trimmed, URL');
    expect(f.data_formats).toEqual(['currency_code', 'uri']);
    expect(f.leftover).toEqual(['trimmed']);
    expect(mapDataFormats('E.164 format').data_formats).toEqual(['e164_phone']);
    expect(mapImplementationMethod('checkout', 'custom', 'Backend')).toBe('client_web');
    expect(mapImplementationMethod('login', 'custom', 'Frontend / Backend')).toBe('server_api');
    expect(mapImplementationMethod('session_start', 'sdk', null)).toBe('sdk_auto');
  });
});

describe('extractAllowedValues', () => {
  it('reads a parenthesised list, else the bullets', () => {
    expect(extractAllowedValues('Status (accept, reject).\n• accept: x\n• remove: y')).toEqual(['accept', 'reject']);
    expect(extractAllowedValues('Type (e.g., a thing).\n• view: x\n• select_size: y')).toEqual(['view', 'select_size']);
    expect(extractAllowedValues('Free text')).toEqual([]);
  });
});

describe('parseTrackingSheet on a synthetic workbook', () => {
  it('finds header rows, skips summary/group/blank rows and error cells', async () => {
    const parsed = parseTrackingSheet(await readWorkbook(await buildWorkbook()));
    expect(parsed.events.map((e) => e.name)).toEqual(['view_item', 'purchase', 'login', 'session_start', 'booking']);
    expect(parsed.events[1]).toMatchObject({ priority: 'critical', trackingStatus: 'in_review', sourceKinds: ['backend'] });
    expect(parsed.events[2]).toMatchObject({ priority: null, sourceKinds: ['frontend', 'backend'] });
    const ref = parsed.properties.find((p) => p.name === 'broken_ref');
    expect(ref?.description).toBeNull();
    expect(parsed.properties.find((p) => p.name === 'currency')).toMatchObject({ data_formats: ['currency_code'], notes: 'Format: trimmed' });
    expect(parsed.customerProperties.map((p) => p.name)).toEqual(['email', 'loyalty_tier']);
    expect(parsed.identity.map((r) => [r.field, r.type])).toEqual([['customer_id', 'hard'], ['cookie', 'soft'], ['login_id', 'soft']]);
    expect(parsed.catalogFields.map((f) => `${f.catalog}/${f.name}`)).toEqual(['products/product_id', 'products/title', 'products/brand', 'variants/size']);
    expect(parsed.skipped.some((s) => s.reason === 'summary row')).toBe(true);
    expect(parsed.skipped.some((s) => s.reason === 'group header row')).toBe(true);
    expect(parsed.skipped.some((s) => s.reason.includes('products/brand') && s.reason.includes('#N/A'))).toBe(true);
    // The SDK-event row with the extra boolean column is read shifted: browser is attribute-only, string typed.
    expect(parsed.properties.find((p) => p.name === 'browser')).toMatchObject({ data_type: 'string', example_values: ['Chrome'] });
    expect(parsed.dropdowns.PRIORITY).toEqual(['Critical', 'High']);
  });

  it('tolerates missing sheets with warnings', () => {
    const parsed = parseTrackingSheet({ '💎Events': [['EVENT NAME', 'EVENT TYPE'], ['x', 'custom']] });
    expect(parsed.events).toHaveLength(1);
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(5);
  });
});

describe('planTrackingSheetImport', () => {
  it('plans creates against an empty project', async () => {
    const parsed = parseTrackingSheet(await readWorkbook(await buildWorkbook()));
    const plan = planTrackingSheetImport(parsed, emptyState(), { profile: PROFILE });
    expect(find(plan.ops, 'project', 'demo')).toMatchObject({ action: 'update', patch: { industry: 'travel' } });
    const purchase = find(plan.ops, 'event', 'purchase')!;
    expect(purchase.body).toMatchObject({ class: 'custom', implementation_method: 'server_api', status: 'in_review', priority: 'critical', source_ids: ['s-back'] });
    expect(find(plan.ops, 'event', 'view_item')!.body).toMatchObject({ implementation_method: 'client_web', source_ids: ['s-front'] });
    expect(find(plan.ops, 'event', 'login')!.body).toMatchObject({ implementation_method: 'server_api', source_ids: ['s-front', 's-back'] });
    expect(find(plan.ops, 'event', 'session_start')!.body).toMatchObject({ class: 'sdk', implementation_method: 'sdk_auto' });
    expect(find(plan.ops, 'event', 'booking')).toMatchObject({ needsClientInput: true });
    expect(find(plan.ops, 'event', 'campaign')).toMatchObject({ action: 'create', needsClientInput: true });
    expect(find(plan.ops, 'event_property', 'view_item/action')!.body).toMatchObject({ role: 'discriminator', required: true });
    expect(find(plan.ops, 'property', 'event:action')!.body).toMatchObject({ allowed_values_json: [{ value: 'view' }, { value: 'select_size' }] });
    expect(find(plan.ops, 'event_property', 'booking/booking_id')).toBeTruthy();
    expect(find(plan.ops, 'property', 'customer:email')!.body).not.toHaveProperty('category_override');
    expect(find(plan.ops, 'property', 'customer:loyalty_tier')!.body).toMatchObject({ category_override: 'customer', category: 'Flags & Statuses' });
    const cookie = find(plan.ops, 'identity_rule', 'cookie')!.body!;
    expect(cookie).toMatchObject({ identity_type: 'soft', source_id: 's-front', trigger_text: 'Bloomreach JS SDK loads' });
    expect(cookie).not.toHaveProperty('sdk_call'); // identify is for hard ids only
    expect(find(plan.ops, 'identity_rule', 'login_id')!.body).toMatchObject({ trigger_event: 'login' });
    expect(find(plan.ops, 'catalog', 'products')!.body).toMatchObject({ kind: 'product' });
    expect(find(plan.ops, 'catalog_field', 'products/item_id')!.body).toMatchObject({ is_lookup_key: true });
    expect(find(plan.ops, 'catalog_field', 'products/title')!.body).toMatchObject({ is_searchable: true });
    expect(find(plan.ops, 'catalog_field', 'variants/variant_id')).toBeTruthy();
    expect(find(plan.ops, 'catalog_field', 'products/brand')).toMatchObject({ needsClientInput: true });
    expect(find(plan.ops, 'property', 'event:variant_id')).toMatchObject({ action: 'create' });
    expect(find(plan.ops, 'property_catalog_link', 'product_id')!.body).toMatchObject({ catalog: 'products', field: 'item_id' });
    expect(plan.summary.event.create).toBe(7); // 5 from the sheet plus the 2 extra events only on their own tab
    expect(plan.needsClientInput.some((n) => n.key === 'products/brand')).toBe(true);
  });

  it('is idempotent: fill-empty, conflict, unchanged, never overwrite', async () => {
    const parsed = parseTrackingSheet(await readWorkbook(await buildWorkbook()));
    const first = planTrackingSheetImport(parsed, emptyState(), { profile: PROFILE });
    const existing = emptyState({
      project: { id: 'p1', key: 'demo', industry: 'travel' },
      properties: [
        { id: 'pr1', scope: 'event', name: 'total_price', description: null, data_type: 'number', category: 'Order Summary' },
        { id: 'pr2', scope: 'event', name: 'product_id', description: 'My own words', data_type: 'string' },
      ],
      events: [
        { id: 'e1', name: 'purchase', description: 'Hand written', priority: null, status: 'planned', class: 'custom', implementation_method: 'client_web', source_ids: [], links: [] },
        { id: 'e2', name: 'view_item', description: 'Viewing a product', purpose: 'Recommendations', page: 'Product page', trigger_text: 'Customer opens it', identity_note: 'Identity: cookie', owner_business: 'Client', priority: 'high', status: 'planned', class: 'custom', implementation_method: 'client_web', source_ids: ['s-front'], links: [] },
      ],
    });
    const plan = planTrackingSheetImport(parsed, existing, { profile: PROFILE });
    // fill empty: total_price description is empty, category equal ignoring emoji
    expect(find(plan.ops, 'property', 'event:total_price')).toMatchObject({ action: 'update', patch: { description: 'Total' } });
    // conflict: product_id description differs and is kept
    const pid = find(plan.ops, 'property', 'event:product_id')!;
    expect(pid.patch ?? {}).not.toHaveProperty('description');
    expect(pid.conflicts).toEqual([{ field: 'description', existing: 'My own words', desired: 'Id of the product' }]);
    // event update fills priority/implementation_method (a schema default counts as empty) and keeps the description
    const purchase = find(plan.ops, 'event', 'purchase')!;
    expect(purchase.action).toBe('update');
    // A schema default (status planned, implementation_method client_web) is a conflict flagged default, not overwritten.
    expect(purchase.patch).toMatchObject({ priority: 'critical', source_ids: ['s-back'] });
    expect(purchase.patch).not.toHaveProperty('status');
    expect(purchase.patch).not.toHaveProperty('implementation_method');
    expect(purchase.conflicts).toEqual(
      expect.arrayContaining([
        { field: 'status', existing: 'planned', desired: 'in_review', default: true },
        { field: 'implementation_method', existing: 'client_web', desired: 'server_api', default: true },
      ])
    );
    const filled = find(planTrackingSheetImport(parsed, existing, { profile: PROFILE, fillDefaults: true }).ops, 'event', 'purchase')!;
    expect(filled.patch).toMatchObject({ status: 'in_review', implementation_method: 'server_api' });
    expect(filled.conflicts.some((c) => c.field === 'description')).toBe(true); // a set value is still never overwritten
    expect(purchase.patch).not.toHaveProperty('description');
    expect(purchase.conflicts[0]).toMatchObject({ field: 'description', existing: 'Hand written' });
    // unchanged: view_item matches fully
    expect(find(plan.ops, 'event', 'view_item')!.action).toBe('unchanged');
    expect(find(plan.ops, 'project', 'demo')!.action).toBe('unchanged');
    expect(first.summary.event.create).toBeGreaterThan(plan.summary.event.create);
    // nothing in any patch ever replaces a non-empty existing value
    for (const op of plan.ops.filter((o) => o.action === 'update' && o.existingId)) {
      const row = [...existing.events, ...existing.properties].find((r) => r.id === op.existingId) as Record<string, unknown> | undefined;
      for (const k of Object.keys(op.patch ?? {})) {
        const have = row?.[k];
        const empty = have === null || have === undefined || have === '' || (Array.isArray(have) && have.length === 0);
        expect(empty, `${op.key}.${k}`).toBe(true);
      }
    }
  });

  it('turns per-event text into named definitions (D-58), idempotently', async () => {
    const parsed = parseTrackingSheet(await readWorkbook(await buildWorkbook()));
    const plan = planTrackingSheetImport(parsed, emptyState(), { profile: PROFILE });
    // different text on view_item -> a definition named after the event, and the link points at it
    const line = find(plan.ops, 'property_definition', 'total_price/view_item')!;
    expect(line).toMatchObject({ action: 'create', body: { property: 'total_price', name: 'view_item', description: 'Line total', example_values_json: ['2'] } });
    expect(find(plan.ops, 'event_property', 'view_item/total_price')!.body).toMatchObject({ definition: 'view_item' });
    // identical text on purchase -> general only
    expect(find(plan.ops, 'property_definition', 'total_price/purchase')).toBeUndefined();
    expect(find(plan.ops, 'event_property', 'purchase/total_price')!.body).not.toHaveProperty('definition');
    // allowed values parsed from the description's parenthesised list
    expect(find(plan.ops, 'property_definition', 'action/purchase')!.body).toMatchObject({ allowed_values_json: [{ value: 'pay' }, { value: 'refund' }] });
    expect(plan.definitionsByProperty.total_price).toEqual(['view_item']);
    expect(plan.definitionsByProperty.action).toEqual(['view_item', 'purchase']); // the property carries the union, each event its own list
    expect(plan.definitionsByProperty.product_id).toEqual(['view_item']); // same text, different example

    // second run: the definitions exist and the links point at them -> unchanged
    const general: ExistingDefinition = { id: 'g1', name: 'general', description: 'Total', formats_json: [], example_values_json: ['77.9'], allowed_values_json: [] };
    const named: ExistingDefinition = { id: 'd1', name: 'view_item', description: 'Line total', formats_json: [], example_values_json: ['2'], allowed_values_json: [] };
    const existing = emptyState({
      properties: [{ id: 'pr1', scope: 'event', name: 'total_price', definitions: [general, named] }],
      events: [{ id: 'e2', name: 'view_item', source_ids: [], links: [{ property_id: 'pr1', required: false, role: 'normal', priority: null, status: 'planned', definition_id: 'd1' }] }],
    });
    const again = planTrackingSheetImport(parsed, existing, { profile: PROFILE });
    expect(find(again.ops, 'property_definition', 'total_price/view_item')!.action).toBe('unchanged');
    expect(find(again.ops, 'event_property', 'view_item/total_price')!.action).toBe('unchanged');
    // a link still on general is moved to the named definition (fill), one on another definition is a conflict
    const onGeneral = emptyState({
      properties: [{ id: 'pr1', scope: 'event', name: 'total_price', definitions: [general, named] }],
      events: [{ id: 'e2', name: 'view_item', source_ids: [], links: [{ property_id: 'pr1', required: false, role: 'normal', priority: null, status: 'planned', definition_id: 'g1' }] }],
    });
    expect(find(planTrackingSheetImport(parsed, onGeneral, { profile: PROFILE }).ops, 'event_property', 'view_item/total_price')).toMatchObject({ action: 'update', patch: { definition: 'view_item' } });
    const other = emptyState({
      properties: [{ id: 'pr1', scope: 'event', name: 'total_price', definitions: [general, named, { id: 'd9', name: 'mine' }] }],
      events: [{ id: 'e2', name: 'view_item', source_ids: [], links: [{ property_id: 'pr1', required: false, role: 'normal', priority: null, status: 'planned', definition_id: 'd9' }] }],
    });
    expect(find(planTrackingSheetImport(parsed, other, { profile: PROFILE }).ops, 'event_property', 'view_item/total_price')!.conflicts).toEqual([{ field: 'definition_id', existing: 'd9', desired: 'd1' }]);
  });

  it('diffFillEmpty basics', () => {
    expect(diffFillEmpty({ a: null, b: 'x', c: 'y' }, { a: 'n', b: 'x', c: 'z', d: null })).toEqual({
      patch: { a: 'n' },
      conflicts: [{ field: 'c', existing: 'y', desired: 'z' }],
    });
  });
});
