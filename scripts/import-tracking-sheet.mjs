#!/usr/bin/env node
/**
 * T-4-34: legacy tracking-sheet importer. Reads the E3 Google-Sheet template workbook and fills an
 * EXISTING project through the REST API, idempotent by name (create missing, fill only empty fields,
 * never delete, never overwrite: a differing value is reported as a conflict).
 *
 *   node scripts/import-tracking-sheet.mjs --xlsx <file> --api http://127.0.0.1:3020 --project <key> [--apply] [--report <path>] [--profile <path>] [--fill-defaults]
 *
 * --profile <json> carries the per-client specifics (see `ImportProfile` in trackingSheet.ts and
 * scripts/profiles/). A schema-default value on an existing row (status planned, class custom, ...) is listed
 * as a conflict flagged `default`; --fill-defaults overwrites exactly those.
 * Without --apply it is a dry run (GET requests only): prints the preview and writes it as JSON to
 * --report. Parsing and planning are pure and live in `src/domain/import/trackingSheet.ts`.
 * Auth: local mode needs nothing (every request is `local-user`, src/backend/middleware/auth.ts).
 * See docs/guide/import-legacy-sheet.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readWorkbook } from './lib/tracking-sheet-io.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { apply: false, fillDefaults: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--fill-defaults') args.fillDefaults = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
  }
  return args;
}

function makeClient(base) {
  const root = base.replace(/\/+$/, '');
  async function call(method, url, body) {
    const res = await fetch(root + url, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = new Error(`${method} ${url} -> ${res.status} ${json?.error ?? json?.code ?? text.slice(0, 160)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b), patch: (u, b) => call('PATCH', u, b) };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

async function fetchExistingState(client, projectKey) {
  const projects = await client.get('/api/projects');
  const list = Array.isArray(projects) ? projects : (projects.projects ?? []);
  const project = list.find((p) => p.key === projectKey);
  if (!project) throw new Error(`Project "${projectKey}" not found. Keys: ${list.map((p) => p.key).join(', ') || '(none)'}`);
  const base = `/api/projects/${project.id}`;
  const [sources, properties, eventsList, catalogsList, identityRules] = await Promise.all([
    client.get(`${base}/sources`),
    client.get(`${base}/properties`),
    client.get(`${base}/events`),
    client.get(`${base}/catalogs`),
    client.get(`${base}/identity-rules`),
  ]);
  const withDefs = await mapLimit(properties, 6, async (p) => ({ ...p, definitions: await client.get(`${base}/properties/${p.id}/definitions`) }));
  const events = await mapLimit(eventsList, 4, async (e) => {
    const detail = await client.get(`${base}/events/${e.id}`);
    return { ...e, source_ids: detail.source_ids ?? [], links: (detail.properties ?? []).map((l) => ({ property_id: l.property_id, required: l.required, role: l.role, priority: l.priority, status: l.status, definition_id: l.definition_id ?? null })) };
  });
  const catalogs = await mapLimit(catalogsList, 4, async (c) => {
    const detail = await client.get(`${base}/catalogs/${c.id}`);
    return { ...c, fields: detail.fields ?? [] };
  });
  return {
    base,
    state: {
      project: { id: project.id, key: project.key, industry: project.industry ?? null },
      sources,
      properties: withDefs,
      events,
      catalogs,
      identityRules,
    },
  };
}

/** Executes the plan's create/update ops in order through the REST API. */
async function applyPlan(client, base, plan, state) {
  const ids = {
    property: new Map(state.properties.map((p) => [`${p.scope}:${p.name}`, p.id])),
    def: new Map(state.properties.flatMap((p) => (p.definitions ?? []).map((d) => [`${p.scope}:${p.name}/${d.name}`, d.id]))),
    event: new Map(state.events.map((e) => [e.name, e.id])),
    catalog: new Map(state.catalogs.map((c) => [c.name, c.id])),
    field: new Map(state.catalogs.flatMap((c) => c.fields.map((f) => [`${c.name}/${f.name}`, f.id]))),
  };
  const results = [];
  for (const op of plan.ops) {
    if (op.action === 'unchanged' || op.action === 'skipped') continue;
    try {
      switch (op.entity) {
        case 'project':
          await client.patch(base, op.patch);
          break;
        case 'property': {
          if (op.action === 'create') {
            const created = await client.post(`${base}/properties`, op.body);
            ids.property.set(op.key, created.id);
          } else await client.patch(`${base}/properties/${op.existingId}`, op.patch);
          break;
        }
        case 'property_definition': {
          const [propName, defName] = op.key.split('/');
          const propId = ids.property.get(`event:${propName}`);
          if (!propId) throw new Error(`unresolved property ${propName}`);
          if (op.action === 'create') {
            const { property: _p, ...rest } = op.body;
            const created = await client.post(`${base}/properties/${propId}/definitions`, rest);
            ids.def.set(`event:${propName}/${defName}`, created.id);
          } else await client.patch(`${base}/properties/${propId}/definitions/${op.existingId}`, op.patch);
          break;
        }
        case 'event': {
          if (op.action === 'create') {
            const created = await client.post(`${base}/events`, op.body);
            ids.event.set(op.key, created.id ?? created.event?.id);
          } else await client.patch(`${base}/events/${op.existingId}`, op.patch);
          break;
        }
        case 'event_property': {
          const eventId = ids.event.get(op.body.event);
          const propId = ids.property.get(`event:${op.body.property}`);
          if (!eventId || !propId) throw new Error(`unresolved reference (${op.body.event} / ${op.body.property})`);
          if (op.action === 'create') {
            const { event: _e, property: _p, definition, ...rest } = op.body;
            if (definition) rest.definition_id = ids.def.get(`event:${op.body.property}/${definition}`);
            await client.post(`${base}/events/${eventId}/properties`, { property_id: propId, ...rest });
          } else {
            const { definition, ...patch } = op.patch;
            if (definition) patch.definition_id = ids.def.get(`event:${op.body.property}/${definition}`);
            await client.patch(`${base}/events/${eventId}/properties/${propId}`, patch);
          }
          break;
        }
        case 'catalog': {
          if (op.action === 'create') {
            const created = await client.post(`${base}/catalogs`, op.body);
            ids.catalog.set(op.key, created.id);
          } else await client.patch(`${base}/catalogs/${op.existingId}`, op.patch);
          break;
        }
        case 'catalog_field': {
          const [catalogName] = op.key.split('/');
          const catalogId = ids.catalog.get(catalogName);
          if (!catalogId) throw new Error(`unresolved catalog ${catalogName}`);
          if (op.action === 'create') {
            const { catalog: _c, ...rest } = op.body;
            const created = await client.post(`${base}/catalogs/${catalogId}/fields`, rest);
            ids.field.set(op.key, created.id);
          } else await client.patch(`${base}/catalogs/${catalogId}/fields/${op.existingId}`, op.patch);
          break;
        }
        case 'property_catalog_link': {
          const propId = ids.property.get(`event:${op.body.property}`);
          const catalogId = ids.catalog.get(op.body.catalog);
          const fieldId = ids.field.get(`${op.body.catalog}/${op.body.field}`);
          if (!propId || !catalogId || !fieldId) throw new Error('unresolved property/catalog/field');
          await client.patch(`${base}/properties/${propId}`, { mapped_catalog_id: catalogId, mapped_catalog_field_id: fieldId });
          break;
        }
        case 'identity_rule': {
          const body = { ...(op.action === 'create' ? op.body : op.patch) };
          if (body.trigger_event) {
            const evId = ids.event.get(body.trigger_event);
            if (evId) body.trigger_event_id = evId;
            delete body.trigger_event;
          }
          if (op.action === 'create') await client.post(`${base}/identity-rules`, body);
          else await client.patch(`${base}/identity-rules/${op.existingId}`, body);
          break;
        }
        default:
          throw new Error(`unknown entity ${op.entity}`);
      }
      results.push({ entity: op.entity, key: op.key, action: op.action, ok: true });
    } catch (err) {
      results.push({ entity: op.entity, key: op.key, action: op.action, ok: false, error: String(err.message ?? err) });
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.xlsx || !args.api || !args.project) {
    console.error('Usage: node scripts/import-tracking-sheet.mjs --xlsx <file> --api <base url> --project <key> [--apply] [--report <path>] [--profile <path>] [--fill-defaults]');
    process.exit(2);
  }
  // The pure helpers are TypeScript: load them through tsx so plain `node` works.
  const { register } = await import('tsx/esm/api');
  register();
  const sheet = await import(pathToFileURL(path.join(__dirname, '../src/domain/import/trackingSheet.ts')).href);

  const raw = await readWorkbook(args.xlsx);
  const parsed = sheet.parseTrackingSheet(raw);
  const client = makeClient(args.api);
  const { base, state } = await fetchExistingState(client, args.project);
  const profile = args.profile ? JSON.parse(fs.readFileSync(args.profile, 'utf8')) : undefined;
  const plan = sheet.planTrackingSheetImport(parsed, state, { profile, fillDefaults: args.fillDefaults });

  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} against ${args.api} project ${args.project}\n`);
  console.log(sheet.formatPlan(plan));

  let results = null;
  if (args.apply) {
    results = await applyPlan(client, base, plan, state);
    const failed = results.filter((r) => !r.ok);
    console.log(`\napplied ${results.length - failed.length} of ${results.length} operations; ${failed.length} failed`);
    for (const f of failed.slice(0, 40)) console.log(`  FAILED ${f.entity} ${f.key}: ${f.error}`);
    if (failed.length) process.exitCode = 1;
  }
  if (args.report) {
    fs.writeFileSync(args.report, JSON.stringify({ mode: args.apply ? 'apply' : 'dry_run', project: args.project, summary: plan.summary, conflicts: plan.conflicts, skipped: plan.skipped, needs_client_input: plan.needsClientInput, warnings: plan.warnings, ops: plan.ops, results }, null, 2));
    console.log(`\nreport written to ${args.report}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(String(err.message ?? err));
    process.exit(1);
  });
}
