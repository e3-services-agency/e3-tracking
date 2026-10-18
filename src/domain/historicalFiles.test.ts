import { describe, expect, it } from 'vitest';
import { parseHistoricalCsv, decodeHistoricalCell, runHistoricalValidation, type HistoricalInput } from './historicalFiles';
const fixture = (text: string, source = 'left', type = 'number', padding: string[] = []): HistoricalInput => ({
  source_id: source, csv: parseHistoricalCsv(text), selection: { source_id: source, event_id: 'event', mappings: [{ column: 'value', property_id: 'p', definition_id: null }], source_only_columns: ['purchase_id', ...(padding.length ? padding : [])], trailing_empty_columns: padding },
  expectations: [{ column: 'value', property_id: 'p', definition_id: null, data_type: type, required: false, formats: [], allowed_values: [] }],
});
describe('bounded historical CSV lexical checks', () => {
  it('preserves quoted commas, quotes, multiline fields and raw signs/apostrophes', () => {
    const csv = parseHistoricalCsv('\uFEFFpurchase_id,value,note\r\na,\'-2.50,"first, second"\r\nb,3,"line\nwith ""quotes"""\r\n');
    expect(csv.rows).toEqual([['a', "'-2.50", 'first, second'], ['b', '3', 'line\nwith "quotes"']]);
  });
  it.each([
    ['a,b\r\n"x\r\ny",z\r\n\r\nq,\r\n', [['x\r\ny', 'z'], [''], ['q', '']]],
    ['a,b\n"""",""', [['"', '']]],
    ['a,b\n"""",x', [['"', 'x']]],
    ['a,b\nx,', [['x', '']]],
    ['\uFEFFa\n""', [['']]],
    ['a\n\n', [['']]],
  ])('preserves source-span boundaries and empty records: %s', (text, rows) => {
    expect(parseHistoricalCsv(text as string).rows).toEqual(rows);
  });
  it.each(['a\n"x" ', 'a\n"x""', 'a\r\n"x"\ty'])('still rejects malformed closed/escaped quote boundaries: %s', text => expect(() => parseHistoricalCsv(text)).toThrow());
  it('counts decoded escaped quotes and UTF-16 code units at the exact field limit', () => {
    const limit = 1048576;
    expect(parseHistoricalCsv('a\n"' + '""'.repeat(limit) + '"').rows[0][0]).toBe('"'.repeat(limit));
    expect(() => parseHistoricalCsv('a\n"' + '""'.repeat(limit + 1) + '"')).toThrow('field limit');
    expect(parseHistoricalCsv('a\n' + '😀'.repeat(limit / 2)).rows[0][0].length).toBe(limit);
    expect(() => parseHistoricalCsv('a\n' + '😀'.repeat(limit / 2) + 'x')).toThrow('field limit');
  });
  it.each(['a,a\n1,2', 'a;b\n1;2', 'a,b\n"unclosed', 'a,b\n"x"suffix,y', 'a,b\nx"y,z', 'a,\n1,2'])('rejects invalid syntax/headers %s', text => expect(() => parseHistoricalCsv(text)).toThrow());
  it('bounds field allocation before parsing an oversized value', () => expect(() => parseHistoricalCsv('a\n' + 'x'.repeat(1048577))).toThrow('field limit'));
  it('uses declared CSV decoding, with no silent coercion or unsafe precision', () => {
    for (const value of ["'-1", '+1', ' 1', '1\n', '01', '1e999', '9007199254740993', '0.12345678901234567']) expect(decodeHistoricalCell(value, 'number').ok, value).toBe(false);
    expect(decodeHistoricalCell('-12.50', 'number')).toEqual({ ok: true, value: -12.5 });
    expect(decodeHistoricalCell('true', 'boolean')).toEqual({ ok: true, value: true });
    expect(decodeHistoricalCell('TRUE', 'boolean').ok).toBe(false);
    expect(decodeHistoricalCell('[1,"x"]', 'array').ok).toBe(true);
    expect(decodeHistoricalCell('{}', 'array').ok).toBe(false);
    expect(decodeHistoricalCell('not a time', 'timestamp').ok).toBe(false);
  });
  it('assesses only explicit optional trailing padding without shifting interior cells', () => {
    const input = fixture('purchase_id,value,category_1,category_2\na,1\nb,2,x\n', 'left', 'number', ['category_1', 'category_2']);
    const result = runHistoricalValidation([input], 0); expect(result.files[0].padded_records).toBe(2); expect(result.totals.failed).toBe(0);
    input.selection.trailing_empty_columns = []; expect(runHistoricalValidation([input], 0).totals.failed).toBe(2);
    const missing = fixture('purchase_id,value\na\n'); expect(runHistoricalValidation([missing], 0).totals.failed).toBe(1);
  });
  it('keeps source-only fields unassessed and reports lexical conflicts without copying values', () => {
    const input = fixture('purchase_id,value\nprivate@example.com,\'-2\n');
    const result = runHistoricalValidation([input], 0), text = JSON.stringify(result);
    expect(result.checks.find(c => c.check === 'csv_lexical_type')?.rows).toEqual([2]);
    expect(result.checks.find(c => c.check === 'source_only_column')?.outcome).toBe('skipped');
    expect(text).not.toContain('private@example.com'); expect(text).not.toContain("'-2");
    expect(result.checks.find(c => c.check === 'native_rules')?.reason).toContain('No native rules');
  });
  it('allows many right items and skips ambiguous left purchases without inventing chronology', () => {
    const left = fixture('purchase_id,value\na,1\nb,2\n'), right = fixture('purchase_id,value\na,1\na,2\nb,3\n', 'right');
    const join = [{ kind: 'one_to_many' as const, left_source_id: 'left', right_source_id: 'right', left_column: 'purchase_id', right_column: 'purchase_id' }];
    expect(runHistoricalValidation([left, right], 0, join).checks.filter(c => c.check === 'one_to_many_join' && c.outcome === 'failed')).toHaveLength(0);
    left.csv.rows.push(['a', '9']); expect(runHistoricalValidation([left, right], 0, join).checks.find(c => c.check === 'one_to_many_join')?.outcome).toBe('skipped');
  });
  it('bounds all diagnostic examples globally and keeps all failures counted', () => {
    const input = fixture('purchase_id,value\n' + Array.from({ length: 500 }, (_, i) => i + ',secret').join('\n'));
    const result = runHistoricalValidation([input], 0); expect(result.checks.find(c => c.check === 'csv_lexical_type')?.count).toBe(500);
    expect(result.checks.reduce((n, c) => n + c.rows.length, 0)).toBeLessThanOrEqual(200); expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('uses native string-valued enum semantics after explicit numeric decoding', () => {
    const input = fixture('purchase_id,value\na,1\n'); input.expectations[0].allowed_values = ['1'];
    expect(runHistoricalValidation([input], 0).checks.find(c => c.check === 'current_definition_enum')?.outcome).toBe('passed');
  });
  it('does not claim successful joins when source record structure is invalid', () => {
    const left = fixture('purchase_id,value\na,1,unexpected\n'), right = fixture('purchase_id,value\na,1\n', 'right');
    const result = runHistoricalValidation([left, right], 0, [{ kind: 'one_to_many', left_source_id: 'left', right_source_id: 'right', left_column: 'purchase_id', right_column: 'purchase_id' }]);
    expect(result.checks.find(c => c.check === 'one_to_many_join')?.outcome).toBe('skipped');
  });
  it('reserves diagnostic row references for later failures after more than200 earlier skipped/passed candidates', () => {
    const columns = Array.from({ length: 12 }, (_, i) => 'optional_' + i);
    const earlier: HistoricalInput = {
      source_id: 'earlier', csv: parseHistoricalCsv(['purchase_id', ...columns, 'category_1'].join(',') + '\n' + Array.from({ length: 30 }, (_, i) => ['purchase-' + i, ...columns.map(() => '')].join(',')).join('\n')),
      selection: { source_id: 'earlier', event_id: 'event', mappings: columns.map(column => ({ column, property_id: column, definition_id: null })), source_only_columns: ['purchase_id', 'category_1'], trailing_empty_columns: ['category_1'] },
      expectations: columns.map(column => ({ column, property_id: column, definition_id: null, data_type: 'string', required: false, formats: [], allowed_values: [] })),
    };
    const later = fixture('purchase_id,value\n' + Array.from({ length: 344 }, (_, i) => i + ',TRUE').join('\n'), 'later', 'boolean');
    const result = runHistoricalValidation([earlier, later], 0);
    const failures = result.checks.find(c => c.source_id === 'later' && c.check === 'csv_lexical_type' && c.outcome === 'failed');
    expect(failures?.count).toBe(344); expect(failures?.rows).toEqual(Array.from({ length: 20 }, (_, i) => i + 2));
    expect(result.checks.filter(c => c.outcome !== 'failed').every(c => c.rows.length === 0)).toBe(true);
    expect(result.checks.reduce((n, c) => n + c.rows.length, 0)).toBeLessThanOrEqual(200);
    expect(JSON.stringify(result)).not.toContain('TRUE'); expect(JSON.stringify(result)).not.toContain('purchase-');
  });
});
