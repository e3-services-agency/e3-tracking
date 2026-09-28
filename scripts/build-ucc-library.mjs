#!/usr/bin/env node
/**
 * T-4-08 (D-59): regenerates `.claude/team/samples/use-case-library-ucc.json` and `docs/LIBRARY.md`
 * from `.claude/team/samples/br-pnp/*.json` (the real Bloomreach Use Case Center exports) through
 * `src/domain/import/pnpUseCase.ts#convertPnpUseCases`, one template per file.
 *
 * A hand-authored template from T-4-07 (already in the target file, `source.kind` absent or
 * `'docs'`) is dropped when a pnp export matches it either by *normalised* name (case-insensitive,
 * punctuation collapsed to spaces) or by documentation-link page slug (D-59, reviewer FAIL
 * 2026-09-28 17:12, ERROR 1: name matching alone missed nine pairs where the hand-authored title
 * and the pnp title differ in wording -- "&" vs "and", a pnp typo ("Caroussel"), or an unrelated
 * paraphrase -- but both describe the same Bloomreach documentation page). The hand-authored format
 * has no `documentation_link` field of its own, so the nine known page slugs below were identified
 * by hand (reviewer cross-check against `documentation.bloomreach.com/engagement/docs/<slug>` for
 * each of the ten templates that survived the first, name-only pass); only `UCC-email-18`
 * (reactivation campaign for disengaged subscribers) has no matching pnp export. A kept template is
 * marked `source: {kind: 'docs'}`; every other field is left as written. Run with
 * `npx tsx scripts/build-ucc-library.mjs` (no build step needed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertPnpUseCases } from '../src/domain/import/pnpUseCase.ts';
import { parseUseCaseLibrary } from '../src/domain/import/useCaseLibrary.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PNP_DIR = path.join(ROOT, '.claude/team/samples/br-pnp');
const OUT_LIBRARY = path.join(ROOT, '.claude/team/samples/use-case-library-ucc.json');
const OUT_DOCS = path.join(ROOT, 'docs/LIBRARY.md');

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9&]+/g, ' ').replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
}

function docSlugOf(url) {
  if (!url) return null;
  const parts = url.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

/** D-59 fix round ERROR 1: known page slugs for the ten hand-authored templates that survived name matching. */
const HAND_AUTHORED_DOC_SLUGS = {
  'UCC-ANALYTICS-08': 'key-customer-segments-and-insights-dashboard',
  'UCC-ANALYTICS-10': 'subscriber-and-unsubscriber-monitoring-dashboard',
  'UCC-ANALYTICS-12': 'rfm-segmentation',
  'UCC-EMAIL-19': 'reactivation-campaign-for-lapsing-and-lapsed',
  'UCC-MOBILE-08': 'sms-subscription-with-email-collection',
  'UCC-OMNI-05': 'product-expiration-reminder',
  'UCC-WEB-15': 'global-and-product-specific-badges',
  'UCC-WEB-24': 'recommendations-carousel-banner',
  'UCC-WEB-28': 'zero-party-data-banner',
};

function main() {
  const pnpFiles = fs.readdirSync(PNP_DIR).filter((f) => f.endsWith('.json')).sort();
  const pnpTemplates = [];
  const warnings = [];
  for (const file of pnpFiles) {
    const doc = JSON.parse(fs.readFileSync(path.join(PNP_DIR, file), 'utf-8'));
    const { templates, warnings: w } = convertPnpUseCases(doc);
    for (const template of templates) pnpTemplates.push(template);
    for (const msg of w) warnings.push(`${file}: ${msg}`);
  }

  const pnpNames = new Set(pnpTemplates.map((t) => normalizeName(t.name)));
  const pnpSlugs = new Set(pnpTemplates.map((t) => docSlugOf(t.documentation_url)).filter(Boolean));

  const existing = JSON.parse(fs.readFileSync(OUT_LIBRARY, 'utf-8'));
  const existingModel = parseUseCaseLibrary(existing);
  // Only ever consider *hand-authored* templates as candidates to keep -- re-running this script
  // against its own previous output must never re-derive a pnp-sourced template as "hand-authored".
  const handAuthoredCandidates = existingModel.templates.filter((t) => t.source?.kind !== 'pnp_usecase');
  const keptHandAuthored = handAuthoredCandidates
    .filter((t) => {
      if (pnpNames.has(normalizeName(t.name))) return false;
      // Case-insensitive: `t.code` in the file is mixed-case (e.g. `UCC-analytics-10`), the map
      // keys are upper-cased for readability.
      const knownSlug = HAND_AUTHORED_DOC_SLUGS[t.code.toUpperCase()];
      if (knownSlug && pnpSlugs.has(knownSlug)) return false;
      return true;
    })
    .map((t) => ({
      code: t.code,
      name: t.name,
      type: t.type,
      description: t.description,
      narrative_template: t.narrative_template,
      // D-59 fix round (WARNING 3): rewrite the old two-word token to the single Use Case Center
      // token so the templates page never shows two chips for one channel.
      tags: { ...t.tags, channels: t.tags.channels.map((c) => (c === 'web_layers' ? 'weblayers' : c)) },
      flags: t.flags,
      default_requirements: t.default_requirements,
      prerequisites: [],
      expected_assets: [],
      source: { kind: 'docs' },
      documentation_url: null,
      internal_notes: null,
      internal_url: null,
    }));

  const droppedCount = handAuthoredCandidates.length - keptHandAuthored.length;

  const allTemplates = [...pnpTemplates, ...keptHandAuthored].sort((a, b) => a.code.localeCompare(b.code));
  const codes = new Set();
  for (const t of allTemplates) {
    if (codes.has(t.code)) throw new Error(`Duplicate template code after generation: ${t.code}`);
    codes.add(t.code);
  }

  const output = { format: 'e3-use-case-library', version: 1, templates: allTemplates };
  fs.writeFileSync(OUT_LIBRARY, JSON.stringify(output, null, 2) + '\n');

  // Sanity check: the file this script just wrote must itself parse with zero warnings.
  const reparsed = parseUseCaseLibrary(output);
  if (reparsed.warnings.length > 0) {
    throw new Error(`Generated library file has parser warnings:\n${reparsed.warnings.join('\n')}`);
  }

  writeDocs(allTemplates);

  console.log(
    `Generated ${allTemplates.length} templates (${pnpTemplates.length} from br-pnp, ${keptHandAuthored.length} hand-authored kept, ${droppedCount} hand-authored dropped as duplicates).`
  );
  console.log(`Converter warnings: ${warnings.length}`);
  for (const w of warnings) console.log(`  ${w}`);
}

const MOBILE = new Set(['sms', 'whatsapp', 'rcs', 'mobile_push']);
// D-59 fix round 2 (INFO 2): `web_layers` dropped -- by the time `sectionFor` runs, every
// template's `tags.channels` has already been through the rewrite above (or came straight from the
// converter, which only ever emits `weblayers`), so the old token can never actually appear here.
const WEB = new Set(['weblayers', 'browser_push']);

function sectionFor(template) {
  if (template.source?.kind === 'docs' && /^UCC-([a-z]+)-/.exec(template.code)) {
    const key = /^UCC-([a-z]+)-/.exec(template.code)[1];
    return (
      { email: 'Email', web: 'Web personalization', omni: 'Omnichannel', mobile: 'Mobile messaging', paid: 'Paid media', analytics: 'Analytics' }[
        key
      ] ?? 'Omnichannel'
    );
  }
  const channels = template.tags.channels ?? [];
  const set = new Set(channels);
  if (set.size === 0) return 'Omnichannel';
  if (set.size === 1 && set.has('no_channel')) return 'Analytics';
  if (set.size === 1 && set.has('email')) return 'Email';
  if (set.size === 1 && set.has('ad_audiences')) return 'Paid media';
  if ([...set].every((c) => MOBILE.has(c))) return 'Mobile messaging';
  if ([...set].every((c) => WEB.has(c))) return 'Web personalization';
  return 'Omnichannel';
}

function writeDocs(templates) {
  const bySection = new Map();
  for (const t of templates) {
    const section = sectionFor(t);
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(t);
  }
  const sectionOrder = ['Email', 'Web personalization', 'Omnichannel', 'Mobile messaging', 'Paid media', 'Analytics'];
  const sections = [...bySection.keys()].sort((a, b) => {
    const ia = sectionOrder.indexOf(a);
    const ib = sectionOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  let md = `# Use case library\n\n`;
  md += `Generated by \`scripts/build-ucc-library.mjs\` from \`.claude/team/samples/br-pnp/\` (Bloomreach Use Case Center exports, D-59) plus the hand-authored templates (T-4-07) whose page has no matching export -- those keep their \`UCC-<section>-<nn>\` codes and \`source.kind: "docs"\`. ${templates.length} templates total. Re-run the script whenever \`samples/br-pnp/\` changes; do not hand-edit \`use-case-library-ucc.json\`.\n\n`;

  for (const section of sections) {
    const items = bySection.get(section).sort((a, b) => a.code.localeCompare(b.code));
    md += `## ${section} (${items.length})\n\n`;
    for (const t of items) {
      const source = t.source?.kind === 'pnp_usecase' ? 'pnp_usecase' : 'docs';
      md += `### ${t.code} -- ${t.name} (${source})\n\n`;
      if (t.description) md += `${t.description}\n\n`;
      if (t.documentation_url) md += `Documentation: ${t.documentation_url}\n\n`;
      if (t.prerequisites.length > 0) {
        md += `Prerequisites:\n`;
        for (const p of t.prerequisites) md += `- ${p}\n`;
        md += `\n`;
      }
      if (t.expected_assets.length > 0) {
        md += `Expected assets: ${t.expected_assets.map((a) => `${a.type} -- ${a.headline}`).join('; ')}\n\n`;
      }
    }
  }

  fs.writeFileSync(OUT_DOCS, md);
}

main();
