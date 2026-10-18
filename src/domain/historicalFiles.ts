/** Historical CSV evidence only. Never creates runtime events or infers event time. */
import { FORMAT_CHECKS, matchesDataType, jsType, isE164Phone, isIanaTimezone } from './comparison/valueChecks';

export const HISTORICAL_FILE_POLICY = {
  version: 'csv-lexical-v1', maxBytes: 32 * 1024 * 1024, maxRows: 100000,
  maxColumns: 200, maxCells: 2000000, maxFieldCharacters: 1048576, maxExamplesPerCheck: 20, maxExamplesTotal: 200,
  rowReference: 'CSV record number; header is record 1, multiline records count once',
  blank: 'Empty textual cells are missing; optional missing cells are not assessed',
  number: 'Strict finite JSON number syntax, safe integers and at most 15 significant decimal digits; no trimming, apostrophe removal or sign normalization',
  boolean: 'Exact lowercase true or false',
  structured: 'JSON text decoded only for explicitly mapped array/object definitions',
  semantics: 'Current definitions are expectations under review, not verified source business semantics',
} as const;

export interface HistoricalMapping { column: string; property_id: string; definition_id: string | null }
export interface HistoricalFileSelection {
  source_id: string; event_id: string; mappings: HistoricalMapping[];
  source_only_columns: string[]; trailing_empty_columns: string[];
}
export interface HistoricalManifest {
  version: 1; parse_policy: 'csv-lexical-v1'; files: HistoricalFileSelection[];
  joins: { kind: 'one_to_many'; left_source_id: string; right_source_id: string; left_column: string; right_column: string }[];
}
export interface HistoricalCsv { headers: string[]; rows: string[][] }
export interface HistoricalExpectation {
  column: string; property_id: string; definition_id: string | null; data_type: string;
  required: boolean; formats: string[]; allowed_values: unknown[];
}
export interface HistoricalInput {
  source_id: string; csv: HistoricalCsv; selection: HistoricalFileSelection;
  expectations: HistoricalExpectation[];
}
export interface HistoricalCheck {
  source_id: string | null; column: string | null; check: string; outcome: 'passed' | 'failed' | 'skipped';
  count: number; rows: number[]; reason: string;
}
export interface HistoricalResult {
  kind: 'historical_file_validation'; policy: typeof HISTORICAL_FILE_POLICY;
  totals: { passed: number; failed: number; skipped: number; checked: number };
  files: { source_id: string; rows: number; columns: number; padded_records: number }[];
  checks: HistoricalCheck[]; limitations: string[];
}

export function parseHistoricalCsv(text: string): HistoricalCsv {
  if (text.includes('\u0000')) throw new Error('CSV contains a NUL byte.');
  text = text.replace(/^\uFEFF/, '');
  const records: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false, cells = 0;
  const finishField = () => { row.push(field); field = ''; closed = false; cells++; if (row.length > HISTORICAL_FILE_POLICY.maxColumns || cells > HISTORICAL_FILE_POLICY.maxCells) throw new Error('CSV column/cell limit exceeded.'); };
  const finishRow = () => { finishField(); records.push(row); row = []; if (records.length > HISTORICAL_FILE_POLICY.maxRows + 1) throw new Error('CSV record limit exceeded.'); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',') finishField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (closed) throw new Error('CSV contains characters after a closed quote.');
    else if (c === '"') { if (field !== '') throw new Error('CSV contains a quote inside an unquoted field.'); quoted = true; }
    else field += c;
    if (field.length > HISTORICAL_FILE_POLICY.maxFieldCharacters) throw new Error('CSV field limit exceeded.');
  }
  if (quoted) throw new Error('CSV contains an unclosed quote.');
  if (field !== '' || row.length || closed || text.endsWith(',')) finishRow();
  const [headers, ...rows] = records;
  if (!headers?.length || headers.length > HISTORICAL_FILE_POLICY.maxColumns || headers.some(h => !h || h.length > 128 || /[;\u0000-\u001f\u007f]/.test(h)) || new Set(headers).size !== headers.length)
    throw new Error('CSV headers must be nonempty, unique and bounded.');
  if (rows.length > HISTORICAL_FILE_POLICY.maxRows || rows.length * headers.length > HISTORICAL_FILE_POLICY.maxCells)
    throw new Error('CSV record/cell limit exceeded.');
  return { headers, rows };
}

export function decodeHistoricalCell(raw: string, dataType: string): { ok: boolean; value?: unknown } {
  if (dataType === 'string') return { ok: true, value: raw };
  if (dataType === 'timestamp') return { ok: matchesDataType('timestamp', raw), value: raw };
  if (dataType === 'number') {
    if (raw !== raw.trim() || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(raw)) return { ok: false };
    const value = Number(raw), digits = raw.split(/[eE]/)[0].replace(/[-.]/g, '').replace(/^0+/, '').replace(/0+$/, '');
    return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)) && digits.length <= 15 ? { ok: true, value } : { ok: false };
  }
  if (dataType === 'boolean') return raw === 'true' || raw === 'false' ? { ok: true, value: raw === 'true' } : { ok: false };
  if (dataType === 'array' || dataType === 'object') {
    try { const value: unknown = JSON.parse(raw); return { ok: matchesDataType(dataType, value), value }; }
    catch { return { ok: false }; }
  }
  return { ok: false };
}

function addCheck(checks: Map<string, HistoricalCheck>, source: string | null, column: string | null, check: string, outcome: HistoricalCheck['outcome'], reason: string, count = 1, row?: number) {
  if (!count) return;
  const key = JSON.stringify([source, column, check, outcome, reason]);
  const current = checks.get(key) ?? { source_id: source, column, check, outcome, count: 0, rows: [], reason };
  current.count += count;
  if (outcome === 'failed' && row !== undefined && current.rows.length < HISTORICAL_FILE_POLICY.maxExamplesPerCheck && [...checks.values()].reduce((n, c) => n + c.rows.length, 0) < HISTORICAL_FILE_POLICY.maxExamplesTotal) current.rows.push(row);
  checks.set(key, current);
}

export function runHistoricalValidation(inputs: HistoricalInput[], nativeRuleCount: number, joins: HistoricalManifest['joins'] = []): HistoricalResult {
  const checks = new Map<string, HistoricalCheck>();
  const files: HistoricalResult['files'] = [];
  for (const input of inputs) {
    const { csv, selection, source_id: source } = input;
    const index = new Map(csv.headers.map((h, i) => [h, i]));
    const declared = [...selection.mappings.map(m => m.column), ...selection.source_only_columns];
    if (declared.length !== csv.headers.length || new Set(declared).size !== declared.length || declared.some(h => !index.has(h))) throw new Error('Every source header must have exactly one declared mapping or source-only disposition.');
    const padding = selection.trailing_empty_columns;
    if (padding.length && (padding.some(h => !index.has(h)) || csv.headers.slice(-padding.length).join('\u0000') !== padding.join('\u0000'))) throw new Error('Trailing-empty policy must declare an exact header suffix.');
    let padded = 0;
    csv.rows.forEach((row, rowIndex) => {
      const record = rowIndex + 2;
      const short = row.length < csv.headers.length;
      const permitted = short && csv.headers.slice(row.length).every(h => padding.includes(h)) && input.expectations.filter(e => index.get(e.column)! >= row.length).every(e => !e.required);
      if (row.length > csv.headers.length || short && !permitted) {
        addCheck(checks, source, null, 'csv_record_width', 'failed', 'Record width differs from headers outside the explicit optional trailing-empty policy.', 1, record);
        return;
      }
      if (short) { padded++; addCheck(checks, source, null, 'csv_record_width', 'passed', 'Absent optional trailing fields assessed as missing under the declared CSV policy.', 1, record); }
      else addCheck(checks, source, null, 'csv_record_width', 'passed', 'Record width matches headers.');
      for (const expectation of input.expectations) {
        const raw = row[index.get(expectation.column)!] ?? '';
        if (raw === '') {
          addCheck(checks, source, expectation.column, 'required_value', expectation.required ? 'failed' : 'skipped', expectation.required ? 'Missing CSV value conflicts with the current required definition; source business semantics remain unverified.' : 'Optional missing CSV value is not assessed.', 1, record);
          continue;
        }
        const decoded = decodeHistoricalCell(raw, expectation.data_type);
        if (!decoded.ok) {
          addCheck(checks, source, expectation.column, 'csv_lexical_type', 'failed', 'CSV representation cannot be decoded under the declared policy for current type ' + expectation.data_type + '; original runtime JSON type is unknown.', 1, record);
          continue;
        }
        addCheck(checks, source, expectation.column, 'csv_lexical_type', 'passed', 'CSV representation decodes under the declared policy; original runtime JSON type is unknown.');
        if (expectation.data_type === 'array' || expectation.data_type === 'object') addCheck(checks, source, expectation.column, 'nested_item_schema', 'skipped', 'JSON container shape only; nested fields, item schemas and state-list business coherence are not assessed.');
        if (expectation.allowed_values.length) {
          // Native AllowedValue.value entries are strings, including numeric/boolean enums.
          const permittedValue = expectation.allowed_values.some(value => String(value) === String(decoded.value));
          addCheck(checks, source, expectation.column, 'current_definition_enum', permittedValue ? 'passed' : 'failed', permittedValue ? 'Decoded value matches a current allowed value.' : 'Current-definition conflict; expected business semantics require review, not automatic source correction.', 1, permittedValue ? undefined : record);
        }
        for (const format of expectation.formats) {
          const check = FORMAT_CHECKS[format];
          if (!check || typeof decoded.value !== 'string') addCheck(checks, source, expectation.column, 'format:' + format, 'skipped', 'This format is not assessed for this CSV representation.');
          else { const ok = check(decoded.value); addCheck(checks, source, expectation.column, 'format:' + format, ok ? 'passed' : 'failed', ok ? 'Decoded value matches the current format.' : 'Current-definition format conflict; expected business semantics remain unverified.', 1, ok ? undefined : record); }
        }
      }
    });
    for (const column of selection.source_only_columns) addCheck(checks, source, column, 'source_only_column', 'skipped', 'Explicit source-only/unmapped column; no schema expectations were applied.', csv.rows.length);
    files.push({ source_id: source, rows: csv.rows.length, columns: csv.headers.length, padded_records: padded });
  }
  for (const join of joins) {
    const left = inputs.find(i => i.source_id === join.left_source_id), right = inputs.find(i => i.source_id === join.right_source_id);
    if (!left || !right || left === right || join.kind !== 'one_to_many') throw new Error('Join must select two declared sources with one-to-many semantics.');
    const li = left.csv.headers.indexOf(join.left_column), ri = right.csv.headers.indexOf(join.right_column);
    if (li < 0 || ri < 0) throw new Error('Join columns must exist in the declared sources.');
    if ([...checks.values()].some(c => c.check === 'csv_record_width' && c.outcome === 'failed' && (c.source_id === left.source_id || c.source_id === right.source_id))) {
      addCheck(checks, left.source_id, join.left_column, 'one_to_many_join', 'skipped', 'A selected source has structurally invalid records; join interpretation is not inferred.', left.csv.rows.length + right.csv.rows.length); continue;
    }
    const keys = new Map<string, number>(); let ambiguous = false;
    left.csv.rows.forEach((row, index) => { const key = row[li] ?? ''; if (!key || keys.has(key)) ambiguous = true; else keys.set(key, index + 2); });
    if (ambiguous) { addCheck(checks, left.source_id, join.left_column, 'one_to_many_join', 'skipped', 'Left keys are missing or nonunique; no latest row or source ordering is inferred.', left.csv.rows.length + right.csv.rows.length); continue; }
    const matched = new Set<string>();
    right.csv.rows.forEach((row, index) => { const key = row[ri] ?? ''; const found = key !== '' && keys.has(key); if (found) matched.add(key); addCheck(checks, right.source_id, join.right_column, 'one_to_many_join', found ? 'passed' : 'failed', found ? 'Item key matches one unique purchase row.' : 'Item key has no matching unique purchase row; no identifier values are copied into diagnostics.', 1, found ? undefined : index + 2); });
    for (const [key, record] of keys) addCheck(checks, left.source_id, join.left_column, 'one_to_many_join', matched.has(key) ? 'passed' : 'failed', matched.has(key) ? 'Purchase key has matching item rows.' : 'Purchase key has no matching item rows.', 1, matched.has(key) ? undefined : record);
  }
  addCheck(checks, null, null, 'native_rules', 'skipped', nativeRuleCount ? 'Native rules require original event context and reviewed historical-file semantics; no rule arithmetic is inferred.' : 'No native rules exist in this definition revision; arithmetic/rule validation is unavailable.', Math.max(1, nativeRuleCount));
  const limitations = [
    'CSV lexical decoding does not prove the original runtime JSON types.',
    'Current definitions and allowed values may be drafts; conflicts need semantic review.',
    'No original event timestamps are present or inferred. Temporal, freshness, ordering and live-coverage checks are not assessed.',
    'No observations, runtime findings, certification, event statuses or approvals are changed.',
    'Arithmetic, discount signs, currency conversion and row ordering are not inferred.',
    'Diagnostic examples contain only bounded CSV record/column references, never source cell values.',
  ];
  for (const family of ['temporal', 'freshness', 'ordering', 'live_coverage', 'cross_file_arithmetic']) addCheck(checks, null, null, family, 'skipped', 'Original timestamps/context or reviewed business semantics are unavailable.');
  const result = [...checks.values()];
  const totals = result.reduce((n, c) => { n[c.outcome] += c.count; if (c.outcome !== 'skipped') n.checked += c.count; return n; }, { passed: 0, failed: 0, skipped: 0, checked: 0 });
  return { kind: 'historical_file_validation', policy: HISTORICAL_FILE_POLICY, totals, files, checks: result, limitations };
}

/** Runtime implementation fingerprint input survives bundling; version alone is not the engine hash. */
export function historicalEngineImplementation(): string {
  return [JSON.stringify(HISTORICAL_FILE_POLICY), parseHistoricalCsv, decodeHistoricalCell, addCheck, runHistoricalValidation,
    matchesDataType, jsType, isE164Phone, isIanaTimezone, ...Object.entries(FORMAT_CHECKS).flatMap(([name, fn]) => [name, fn])].map(String).join('\n');
}
