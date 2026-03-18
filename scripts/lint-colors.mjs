import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');

// Only lint UI code paths (exclude backend + HTML generators).
const INCLUDE_DIRS = [
  path.join(SRC, 'components'),
  path.join(SRC, 'pages'),
  path.join(SRC, 'features'),
];

// Allow hex in the token definition file only.
const ALLOW_HEX_IN = new Set([path.join(SRC, 'index.css')]);

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const ARBITRARY_HEX_TW_RE = /\[#[0-9a-fA-F]{3,8}\]/g;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await walk(p)));
    } else if (e.isFile()) {
      if (/\.(tsx?|css)$/.test(e.name)) files.push(p);
    }
  }
  return files;
}

function findMatches(content, re) {
  const matches = [];
  for (const m of content.matchAll(re)) {
    matches.push({ index: m.index ?? 0, text: m[0] });
  }
  return matches;
}

function indexToLineCol(content, index) {
  const lines = content.slice(0, index).split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
}

const files = (await Promise.all(INCLUDE_DIRS.map((d) => walk(d)))).flat();
const violations = [];

for (const file of files) {
  const abs = path.resolve(file);
  if (ALLOW_HEX_IN.has(abs)) continue;
  const content = await readFile(abs, 'utf8');

  const hex = findMatches(content, HEX_RE);
  const arbitrary = findMatches(content, ARBITRARY_HEX_TW_RE);

  for (const m of [...hex, ...arbitrary]) {
    const { line, col } = indexToLineCol(content, m.index);
    violations.push({ file: abs, line, col, text: m.text });
  }
}

if (violations.length > 0) {
  console.error('\nColor lint failed: hex colors are not allowed in components.\n');
  for (const v of violations.slice(0, 200)) {
    console.error(`${v.file}:${v.line}:${v.col}  ${v.text}`);
  }
  if (violations.length > 200) {
    console.error(`\n… and ${violations.length - 200} more.\n`);
  }
  process.exit(1);
}

console.log('Color lint passed (no hex colors in src/** excluding src/index.css).');

