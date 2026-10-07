/**
 * Coverage audit (T-4-29): every `<FieldLabel>`, `<HintTh>` and `<SortableTh>` under `src/pages` and
 * `src/features` must resolve to a hint through `hintFor`, and no raw `<label`/`<th` may bypass
 * those components. Labels whose text is wholly dynamic (`{h}`) are checked at runtime by `hintFor`
 * in the component and skipped here unless they carry a literal `hint`.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FIELD_HINTS, hintFor } from './fieldHints';

/** `file:text` entries allowed to have no hint, each with a reason. */
const EXEMPT: Record<string, string> = {};
/** Files allowed to use a raw `<label`/`<th`, with a reason. */
const RAW_OK: Record<string, string> = {};

const norm = (p: string) => p.split(path.sep).join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

/** Visible literal text of a JSX fragment: drops balanced `{...}` expressions, tags, form controls
 * and screen-reader-only spans. */
function staticText(inner: string): string {
  const t = inner
    .replace(/<(select|textarea)[\s\S]*?<\/>/g, ' ')
    .replace(/<span className="sr-only">[^<]*<\/span>/g, ' ');
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '{' || c === '<') {
      let depth = 0;
      for (; i < t.length; i++) {
        if (t[i] === '{') depth++;
        else if (t[i] === '}') depth--;
        else if (t[i] === '>' && depth === 0 && c === '<' && t[i - 1] !== '=') break;
        if (c === '{' && depth === 0) break;
      }
      out += ' ';
    } else out += c;
  }
  return out.replace(/\s+/g, ' ').trim();
}

const OPEN = /<(FieldLabel|HintTh|SortableTh)(\s(?:[^<>]|=>|\{[^{}]*\})*?)>/g;

describe('page-scoped hints (F2)', () => {
  const SCOPED: [string, string][] = [
    ['Properties', 'Kind'], ['UseCases', 'Status'], ['Identity', 'Type'], ['Identity', 'Name'], ['Sources', 'Name'],
    ['Catalogs', 'Priority'], ['Identity', 'Priority'], ['UseCases', 'Priority'], ['Catalogs', 'Description'],
    ['Identity', 'Description'], ['UseCases', 'Description'], ['UseCases', 'Level'], ['Sources', 'Method'],
    ['Properties', 'Actions'], ['Sources', 'Actions'], ['UseCases', 'Actions'], ['Events', 'Actions'],
  ];
  it('resolves a page-specific entry, not the generic one', () => {
    for (const [scope, key] of SCOPED) {
      expect(FIELD_HINTS[`${scope}.${key}`], `${scope}.${key}`).toBeTruthy();
      expect(hintFor(key, scope)).toBe(FIELD_HINTS[`${scope}.${key}`]);
    }
    expect(hintFor('Share access', 'Settings')).toBeTruthy();
    expect(hintFor('Definition')).toBeTruthy();
  });
  it('keeps every hint under 160 characters', () => {
    for (const [k, v] of Object.entries(FIELD_HINTS)) expect(v.length, k).toBeLessThan(160);
  });
});

describe('field hint coverage', () => {
  const files = [...walk('src/pages'), ...walk('src/features')];
  it('scans a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no raw <label or <th bypassing the hint components', () => {
    const bad: string[] = [];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      if (/<label[\s>]|<th[\s>]/.test(s.replace(/<th[^<>]*\/>/g, '')) && !RAW_OK[norm(f)]) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  it('every label and column header has a hint', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(OPEN)) {
        const name = m[1];
        const attrs = m[2];
        const scope = /hintScope="([^"]*)"/.exec(attrs)?.[1];
        const hintAttr = /hint="([^"]*)"/.exec(attrs)?.[1];
        const close = name === 'FieldLabel' ? '</FieldLabel>' : name === 'HintTh' ? '</HintTh>' : '</SortableTh>';
        const end = s.indexOf(close, m.index! + m[0].length);
        const inner = end < 0 ? '' : s.slice(m.index! + m[0].length, end);
        const text = staticText(inner);
        const key = hintAttr ?? text;
        if (!key) continue;
        checked += 1;
        if (!hintFor(key, scope) && !EXEMPT[`${norm(f)}:${key}`]) {
          missing.push(`${norm(f)} [${scope}] "${key}"`);
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect([...new Set(missing)].sort()).toEqual([]);
  });
});
