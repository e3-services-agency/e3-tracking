'use strict';
// Reviewed operator candidate only. No SQL, application imports, tokens, or auth overrides.
// In the already-running app container:
// node SCRIPT --dry-run --plan /data/backups/t27-correction-TIMESTAMP/plan.json
// Review the private plan, then node SCRIPT --apply --plan SAME_PRIVATE_PATH
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const BASE = 'http://127.0.0.1:3001';
const ACTOR = 'e3-maintenance@localhost';
const PROJECT_KEY = 'airshoppen';
const BARE_PHONE = '421949336382';
const PHONE = '+' + BARE_PHONE;
const DESCRIPTION = 'System-managed flag set to true when Bloomreach invalidates an email contact, excluding the profile from future email campaigns. It does not block transactional emails.';
const clone = value => structuredClone(value);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function one(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, 'Ambiguous or missing ' + label);
  return matches[0];
}
function correctedExamples(raw) {
  assert(Array.isArray(raw), 'Phone examples must be an array');
  const valueOf = item => item && typeof item === 'object' && !Array.isArray(item) ? item.value : item;
  const old = raw.filter(item => ['string', 'number'].includes(typeof valueOf(item)) && String(valueOf(item)) === BARE_PHONE);
  const corrected = raw.filter(item => valueOf(item) === PHONE);
  assert(old.length === 1 && corrected.length === 0 || old.length === 0 && corrected.length === 1, 'Phone example does not uniquely match the approved correction');
  return raw.map(item => ['string', 'number'].includes(typeof valueOf(item)) && String(valueOf(item)) === BARE_PHONE
    ? item && typeof item === 'object' ? { ...item, value: PHONE } : PHONE
    : clone(item));
}
function stepsFor(snapshot) {
  const result = [];
  const phoneGeneral = one(snapshot.phone.definitions, d => d.name === 'general', 'phone/general');
  const emailGeneral = one(snapshot.email.definitions, d => d.name === 'general', 'email_invalid/general');
  assert.equal(snapshot.phone.property.scope, 'customer');
  assert.equal(snapshot.email.property.scope, 'customer');
  assert.equal(snapshot.phone.property.name, 'phone');
  assert.equal(snapshot.email.property.name, 'email_invalid');
  assert(equal(snapshot.phone.property.example_values_json, phoneGeneral.example_values_json), 'Phone and general examples differ; review required');
  assert.equal(snapshot.email.property.description, emailGeneral.description, 'Email property and general descriptions differ; review required');
  const examples = correctedExamples(phoneGeneral.example_values_json);
  if (!equal(examples, phoneGeneral.example_values_json)) result.push({ target: 'phone', kind: 'definition', id: phoneGeneral.id, patch: { example_values_json: examples } });
  if (snapshot.email.property.category_override !== 'system_customer') result.push({ target: 'email', kind: 'property', id: snapshot.email.property.id, patch: { category_override: 'system_customer' } });
  if (snapshot.email.property.description !== DESCRIPTION) result.push({ target: 'email', kind: 'definition', id: emailGeneral.id, patch: { description: DESCRIPTION } });
  return result;
}
async function api(route, method = 'GET', body) {
  const response = await fetch(BASE + route, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'X-Forwarded-Email': ACTOR, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert(response.ok, 'Existing API refused ' + method + ' request: HTTP ' + response.status);
  return response.json();
}
async function authenticate() {
  assert.equal(process.env.AUTH_MODE, 'proxy', 'Must run inside the existing proxy-mode app');
  const trusted = (process.env.TRUSTED_PROXY_CIDR || '').split(',').map(v => v.trim());
  assert(trusted.includes('127.0.0.1/32') || trusted.includes('127.0.0.1'), 'Explicit loopback trust required; do not alter configuration');
  const refused = await fetch(BASE + '/api/projects', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(refused.status, 401, 'No-identity request must be refused');
  const projects = await api('/api/projects');
  assert(Array.isArray(projects));
  const project = one(projects, p => p.key === PROJECT_KEY && !p.deleted_at, 'approved Airshoppen project');
  assert(/^[a-f0-9-]{36}$/i.test(project.id), 'Unexpected project id');
  return { id: project.id, key: project.key };
}
async function history(projectId, type, id) {
  const rows = []; let cursor;
  do {
    const query = new URLSearchParams({ entity_type: type, entity_id: id, limit: '999', ...(cursor ? { before: cursor } : {}) });
    const page = await api('/api/projects/' + projectId + '/history?' + query);
    assert(Array.isArray(page.items)); rows.push(...page.items); cursor = page.next_cursor;
    assert(rows.length < 100000, 'Unexpected history size');
  } while (cursor);
  return rows;
}
async function readSnapshot(project) {
  const prefix = '/api/projects/' + project.id;
  const list = await api(prefix + '/properties?scope=customer');
  const snapshot = {};
  for (const [key, name] of [['phone', 'phone'], ['email', 'email_invalid']]) {
    const row = one(list, p => p.name === name && p.scope === 'customer' && !p.deleted_at, name);
    const property = await api(prefix + '/properties/' + row.id);
    const definitions = await api(prefix + '/properties/' + row.id + '/definitions');
    const general = one(definitions, d => d.name === 'general', name + '/general');
    assert(definitions.every(d => d.project_id === project.id && d.property_id === row.id));
    snapshot[key] = { property, definitions, history: {
      property: await history(project.id, 'property', row.id),
      definition: await history(project.id, 'property_definition', general.id),
    } };
  }
  return snapshot;
}
function expectedAfter(before, step) {
  const expected = clone(before); const target = expected[step.target];
  const general = one(target.definitions, d => d.name === 'general', 'general');
  if (step.kind === 'definition') { Object.assign(general, clone(step.patch)); Object.assign(target.property, clone(step.patch)); }
  else Object.assign(target.property, clone(step.patch));
  return expected;
}
function content(snapshot) {
  const result = clone(snapshot);
  for (const target of Object.values(result)) {
    delete target.history; delete target.property.updated_at;
    for (const definition of target.definitions) delete definition.updated_at;
  }
  return result;
}
function verifyHistory(before, after, expected, step) {
  let count = 0;
  for (const key of ['phone', 'email']) for (const kind of ['property', 'definition']) {
    const original = before[key].history[kind]; const current = after[key].history[kind];
    const originals = new Map(original.map(row => [row.id, row]));
    assert(original.every(row => equal(row, current.find(item => item.id === row.id))), 'Existing history changed');
    const added = current.filter(row => !originals.has(row.id));
    const affected = key === step.target && (step.kind === 'definition' || kind === 'property');
    assert.equal(added.length, affected ? 1 : 0, 'Unexpected new history rows');
    if (!affected) continue;
    const row = added[0]; assert.equal(row.actor, ACTOR); assert.equal(row.source, 'ui'); assert.equal(row.action, 'update');
    const oldEntity = kind === 'property' ? before[key].property : one(before[key].definitions, d => d.name === 'general', 'general');
    const newEntity = kind === 'property' ? expected[key].property : one(expected[key].definitions, d => d.name === 'general', 'general');
    assert.equal(row.entity_id, oldEntity.id); assert.equal(row.entity_type, kind === 'property' ? 'property' : 'property_definition');
    const changes = typeof row.diff_json === 'string' ? JSON.parse(row.diff_json) : row.diff_json;
    const wanted = Object.keys(step.patch).map(field => ({ field, before: oldEntity[field] ?? null, after: newEntity[field] ?? null }));
    assert(equal([...changes].sort((a,b) => a.field.localeCompare(b.field)), wanted.sort((a,b) => a.field.localeCompare(b.field))), 'History diff differs from the approved fields');
    count++;
  }
  return count;
}
function verifyCompletedPlan(plan, after) {
  let prior = clone(plan.before); const wanted = { phone: { property: [], definition: [] }, email: { property: [], definition: [] } };
  for (const step of plan.steps) {
    const next = expectedAfter(prior, step);
    for (const kind of ['property', 'definition']) {
      if (step.kind !== 'definition' && kind !== 'property') continue;
      const oldEntity = kind === 'property' ? prior[step.target].property : one(prior[step.target].definitions, d => d.name === 'general', 'general');
      const newEntity = kind === 'property' ? next[step.target].property : one(next[step.target].definitions, d => d.name === 'general', 'general');
      wanted[step.target][kind].push(Object.keys(step.patch).map(field => ({ field, before: oldEntity[field] ?? null, after: newEntity[field] ?? null })));
    }
    prior = next;
  }
  assert(equal(content(after), content(prior)), 'Already-correct data differs from the approved plan');
  for (const key of ['phone', 'email']) for (const kind of ['property', 'definition']) {
    const original = plan.before[key].history[kind]; const current = after[key].history[kind];
    const ids = new Set(original.map(row => row.id));
    assert(original.every(row => equal(row, current.find(item => item.id === row.id))), 'Original history no longer matches');
    const added = current.filter(row => !ids.has(row.id));
    assert.equal(added.length, wanted[key][kind].length, 'Completed-plan history differs');
    const actual = added.map(row => {
      assert.equal(row.actor, ACTOR); assert.equal(row.source, 'ui'); assert.equal(row.action, 'update');
      assert.equal(row.entity_type, kind === 'property' ? 'property' : 'property_definition');
      const entity = kind === 'property' ? after[key].property : one(after[key].definitions, d => d.name === 'general', 'general');
      assert.equal(row.entity_id, entity.id);
      return hash(typeof row.diff_json === 'string' ? JSON.parse(row.diff_json) : row.diff_json);
    }).sort();
    assert(equal(actual, wanted[key][kind].map(hash).sort()), 'Completed-plan history field evidence differs');
  }
}
function privatePlanFile(filename, mustExist) {
  assert(path.isAbsolute(filename), 'Private plan path must be absolute');
  const directory = path.dirname(filename);
  if (!mustExist) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assert(!fs.lstatSync(directory).isSymbolicLink(), 'Symlink evidence directory refused');
  assert.equal(fs.realpathSync(directory), directory, 'Evidence path must be canonical');
  assert.equal(fs.statSync(directory).mode & 0o077, 0, 'Evidence directory must be private');
  if (mustExist) { assert(!fs.lstatSync(filename).isSymbolicLink()); assert.equal(fs.statSync(filename).mode & 0o077, 0); }
  return filename;
}
async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 3 && ['--dry-run', '--apply'].includes(args[0]) && args[1] === '--plan', 'Usage: --dry-run|--apply --plan ABSOLUTE_PRIVATE_FILE');
  const apply = args[0] === '--apply'; const filename = privatePlanFile(args[2], apply);
  const project = await authenticate();
  let before = await readSnapshot(project);
  const steps = stepsFor(before);
  if (!apply) {
    const plan = { version: 1, actor: ACTOR, project, before, steps, captured_at: new Date().toISOString() };
    fs.writeFileSync(filename, JSON.stringify(plan, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ mode: 'dry-run', project: PROJECT_KEY, api_writes: 0, planned_fields: steps.map(s => ({ target: s.target === 'phone' ? 'phone/general' : 'email_invalid' + (s.kind === 'definition' ? '/general' : ''), fields: Object.keys(s.patch) })), baseline_sha256: hash(before) }));
    return;
  }
  const plan = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.equal(plan.version, 1); assert.equal(plan.actor, ACTOR); assert(equal(plan.project, project));
  // A successful repeat is a no-op, provided every non-target field and original history persists.
  if (steps.length === 0) {
    verifyCompletedPlan(plan, before);
    console.log(JSON.stringify({ mode: 'apply', result: 'already-correct', api_writes: 0 })); return;
  }
  assert(equal(before, plan.before) && equal(steps, plan.steps), 'Pre-write state changed since private plan capture; stop and review');
  let histories = 0; let writes = 0;
  try {
    for (const step of steps) {
      assert(equal(await readSnapshot(project), before), 'Concurrent change before write; stop');
      const prefix = '/api/projects/' + project.id + '/properties/' + before[step.target].property.id;
      const route = step.kind === 'definition' ? prefix + '/definitions/' + step.id : prefix;
      await api(route, 'PATCH', step.patch); writes++;
      const expected = expectedAfter(before, step); const after = await readSnapshot(project);
      fs.writeFileSync(filename + '.after-' + writes + '.json', JSON.stringify(after, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      assert(equal(content(after), content(expected)), 'Unexpected field changes after write; retain evidence and stop');
      histories += verifyHistory(before, after, expected, step); before = after;
    }
    assert.equal(stepsFor(before).length, 0, 'Corrections incomplete');
    console.log(JSON.stringify({ mode: 'apply', result: 'verified', project: PROJECT_KEY, api_writes: writes, new_history_rows: histories, unrelated_fields: 'unchanged', post_sha256: hash(before) }));
  } catch (error) {
    console.error('Stopped after ' + writes + ' confirmed API writes; private plan retains original values. No automatic inverse edits.'); throw error;
  }
}
module.exports = { correctedExamples, stepsFor, expectedAfter, content, verifyHistory, verifyCompletedPlan };
if (require.main === module) main().catch(error => { console.error('T27 STOP: ' + error.message); process.exitCode = 1; });
