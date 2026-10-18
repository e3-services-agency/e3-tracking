// Authorized operator over IAP, using the same trusted loopback API path as 05-cutover.
// No direct database writes, arbitrary hosts, credentials, observations or approval operations.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const http = require('node:http');
const project = 'c992ddce-ef2f-49c1-8275-84806f08f744';
const sourceProject = '7b32a76a-4f13-4e1c-98eb-c930c1a4d89c';
const sourceSha = 'c66e28f0d1aa0e19af1ada84e8404a4343f74185e51b6bb3b28e5de7214739fc';
const prefix = '/api/projects/' + project;
const origin = 'https://tracking.e3-services.com';
const mode = process.argv[2];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stage = '/tmp/e3-odo-operator';
try { fs.mkdirSync(stage, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
const stageStat = fs.lstatSync(stage);
assert(stageStat.isDirectory() && !stageStat.isSymbolicLink() && stageStat.uid === process.getuid());
fs.chmodSync(stage, 0o700);
const receiptPath = name => { assert(/^[a-z-]+$/.test(name)); return stage + '/' + name + '.json'; };
const receiptStat = fd => { const stat = fs.fstatSync(fd); assert(stat.isFile() && stat.uid === process.getuid() && stat.nlink === 1); return stat; };
const save = (name, value) => {
  const fd = fs.openSync(receiptPath(name), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
  try { receiptStat(fd); fs.fchmodSync(fd, 0o600); fs.ftruncateSync(fd, 0); fs.writeFileSync(fd, JSON.stringify(value)); } finally { fs.closeSync(fd); }
};
const load = name => {
  const fd = fs.openSync(receiptPath(name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { const stat = receiptStat(fd); assert((stat.mode & 0o777) === 0o600 && stat.size <= 10485760); return JSON.parse(fs.readFileSync(fd, 'utf8')); } finally { fs.closeSync(fd); }
};
async function api(path, body, multipart = false) {
  assert(path.startsWith(prefix + '/'));
  const headers = { host: 'tracking.e3-services.com', origin, 'x-forwarded-email': 'jan.pan@e3-services.com', connection: 'close' };
  let payload;
  if (body !== undefined && !multipart) { headers['content-type'] = 'application/json'; payload = Buffer.from(JSON.stringify(body)); }
  if (multipart) {
    const encoded = new Request('http://127.0.0.1:3001' + path, { method: 'POST', body });
    headers['content-type'] = encoded.headers.get('content-type'); payload = Buffer.from(await encoded.arrayBuffer());
  }
  if (payload) headers['content-length'] = String(payload.length);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: 3001, path, method: body === undefined ? 'GET' : 'POST', headers, agent: false }, response => {
      const chunks = []; let total = 0;
      response.on('data', chunk => { total += chunk.length; if (total > 104857600) response.destroy(new Error('Native API response exceeds bound')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error('Native API failed HTTP ' + response.statusCode + ' for ' + path.split('/').slice(-2).join('/')));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Native API returned invalid JSON')); }
      });
    });
    request.setTimeout(300000, () => request.destroy(new Error('Native API timeout'))); request.on('error', reject); request.end(payload);
  });
}
async function main() {
  const chunks = []; let length = 0;
  for await (const chunk of process.stdin) { length += chunk.length; if (length > 33554432) throw new Error('Operator input exceeds bound'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (mode === 'promotion-preview' || mode === 'promotion-apply') {
    assert.equal(sha(bytes), sourceSha, 'Exact approved source bytes required');
    const input = { source_project_id: sourceProject, destination_project_id: project, source_sha256: sourceSha, source_backup: bytes.toString('utf8') };
    if (mode === 'promotion-preview') {
      const preview = await api(prefix + '/promotion/preview', { input });
      assert.equal(preview.destination_project_id, project); assert.equal(preview.source_sha256, sourceSha);
      save('promotion-preview', preview);
      console.log(JSON.stringify({ source_sha256: sourceSha, destination_project_id: project, plan_hash: preview.plan_hash, destination_baseline_hash: preview.destination_baseline_hash, counts: preview.counts, replay: preview.replay }));
    } else {
      const preview = load('promotion-preview');
      assert.equal(preview.source_sha256, sourceSha); assert.equal(preview.destination_project_id, project);
      const result = await api(prefix + '/promotion/apply', { input, plan_hash: preview.plan_hash, destination_baseline_hash: preview.destination_baseline_hash, human_confirmed: true });
      assert.equal(result.plan_hash, preview.plan_hash); save('promotion-result', result);
      console.log(JSON.stringify({ id: result.id, plan_hash: result.plan_hash, result_hash: result.result_hash, counts: result.counts, replay: result.replay, actor: result.actor }));
    }
  } else if (mode === 'upload-purchase' || mode === 'upload-item') {
    const item = mode === 'upload-item';
    const expected = item ? ['purchase_items_1792067024.csv', 16181517, 'd6d6e3f7b5e05f7345f75316ebbd8e2903bff6d5881f1e4967559d3b9a527f56', '1RK9XSBpxQ__JEKPJwQoA9ocRtYlPYSZT'] : ['events_1792067023.csv', 5136236, '5f34ab89ed707fd0c77569228e4e0b28726504a1e3b1191beea3adfadf6aab34', '14UgmQpa01PRLNNorcCygFFnf5uflDcD7'];
    assert.equal(bytes.length, expected[1]); assert.equal(sha(bytes), expected[2]);
    const form = new FormData(); form.append('file', new Blob([bytes], { type: 'text/csv' }), expected[0]);
    form.append('source_ref', 'https://drive.google.com/file/d/' + expected[3] + '/view');
    const result = await api(prefix + '/historical-files/sources', form, true);
    assert.equal(result.sha256, expected[2]); assert.equal(result.byte_size, expected[1]);
    save(item ? 'item-source' : 'purchase-source', result); console.log(JSON.stringify(result));
  } else if (mode === 'validation-preview' || mode === 'validation-apply') {
    assert.equal(sha(bytes), '00fa424d4d02df8438e58ca76e3dcce6a588b5a3ddf749dca25eb3fcde4834e2', 'Exact reviewed manifest bytes required');
    const manifest = JSON.parse(bytes.toString('utf8'));
    const purchase = load('purchase-source'), item = load('item-source');
    const rebind = new Map([['251e2c04-8b19-4518-bee7-286bdecfa134', purchase.id], ['08b06e19-5bbe-47d3-9f90-bf755177edd3', item.id]]);
    for (const file of manifest.files) { assert(rebind.has(file.source_id)); file.source_id = rebind.get(file.source_id); }
    for (const join of manifest.joins) { assert(rebind.has(join.left_source_id) && rebind.has(join.right_source_id)); join.left_source_id = rebind.get(join.left_source_id); join.right_source_id = rebind.get(join.right_source_id); }
    if (mode === 'validation-preview') {
      const result = await api(prefix + '/historical-files/preview', { manifest }); save('validation-preview', result);
      console.log(JSON.stringify({ payload_hash: result.payload_hash, definition_hash: result.definition_hash, engine_hash: result.engine_hash, files: result.files, totals: result.totals, limitations: result.limitations }));
    } else {
      const preview = load('validation-preview'); assert.deepEqual(preview.manifest, manifest);
      const result = await api(prefix + '/historical-files/apply', { manifest, payload_hash: preview.payload_hash, confirmed: true });
      assert.equal(result.identity_hash, preview.payload_hash); save('validation-result', result);
      console.log(JSON.stringify(result));
    }
  } else if (mode === 'backup' || mode === 'decisions' || mode === 'implementation') {
    assert.equal(bytes.length, 0);
    const suffix = mode === 'backup' ? '/export/backup.json' : mode === 'decisions' ? '/decision-inbox' : '/captured-evidence/implementation';
    process.stdout.write(JSON.stringify(await api(prefix + suffix)));
  } else throw new Error('Unsupported closed operator mode');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
