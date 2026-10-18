#!/usr/bin/env bash
# Read-only whole-host isolation receipt; emits hashes/counts, never business or credential values.
set -euo pipefail
cd /opt/e3-tracking
printf 'CONFIG_SHA '
sudo grep -v '^IMAGE=' .env | sha256sum | cut -d' ' -f1
printf 'CONFIG_STABLE_SHA '
sudo grep -vE '^(IMAGE|DECISION_INBOX_ENABLED|PROJECT_PROMOTION_ENABLED)=' .env | sha256sum | cut -d' ' -f1
for service in caddy oauth2-proxy; do
  printf '%s ' "$service"
  sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge ps -q "$service"
done
sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge exec -T app node --input-type=commonjs - <<'NODE'
const Database=require('better-sqlite3');
const {createHash}=require('node:crypto');
const db=new Database('/data/e3-tracking.sqlite',{readonly:true,fileMustExist:true});
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const sha=v=>createHash('sha256').update(canonical(v)).digest('hex');
const target='c992ddce-ef2f-49c1-8275-84806f08f744';
const settings=new Set(['description','bloomreach_api_customer_id_key','bloomreach_project_token','bloomreach_api_base_url','bloomreach_project_url','default_expiration_json','standard_event_additions_json','consent_key_additions_json','bloomreach_mapping_meta_json','data_manager_meta_json','data_manager_customers_json','data_manager_events_json','money_tolerance_percent','money_tolerance_floor','industry','naming_convention','default_source_id']);
const children={event_sources:['events','event_id'],event_properties:['events','event_id'],catalog_fields:['catalogs','catalog_id'],requirements:['use_cases','use_case_id'],property_bundle_items:['property_bundles','bundle_id'],comment_reactions:['comments','comment_id']};
try {
  db.exec('BEGIN'); // One read-only WAL snapshot across every table and ownership lookup.
  if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length) throw Error('Database integrity/FK failed');
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const receipt={schema:db.prepare('SELECT MAX(id) id FROM schema_migrations').get().id,integrity:'ok',foreign_keys:0,tables:{}};
  for(const table of tables) {
    if(!/^[a-z_]+$/.test(table)) throw Error('Unexpected table identifier');
    const rows=db.prepare('SELECT * FROM '+table).all();
    const groups={};
    const cols=db.prepare('PRAGMA table_info('+table+')').all().map(r=>r.name);
    const relation=children[table];
    let owner;
    if(relation) owner=db.prepare('SELECT project_id FROM '+relation[0]+' WHERE id=?');
    for(const row of rows) {
      const group=table==='projects'?row.id:cols.includes('project_id')?row.project_id:owner?owner.get(row[relation[1]])?.project_id:'global';
      (groups[group??'unowned']??=[]).push(sha(row));
    }
    receipt.tables[table]={count:rows.length,sha256:sha(rows.map(sha).sort()),groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{count:v.length,sha256:sha(v.sort())}]))};
  }
  const project=db.prepare('SELECT * FROM projects WHERE id=?').get(target);
  if(!project||project.key!=='one-day-only-production') throw Error('Destination identity mismatch');
  receipt.destination_protected_sha256=sha(Object.fromEntries(Object.entries(project).filter(([k])=>!settings.has(k))));
  receipt.access_policy={};
  for(const table of ['mcp_oauth_clients','mcp_oauth_grants','mcp_oauth_projects','project_members','share_members']) {
    const rows=db.prepare('SELECT * FROM '+table).all();
    receipt.access_policy[table]={count:rows.length,sha256:sha(rows.map(sha).sort())};
  }
  receipt.access_policy.project_sharing_sha256=sha(db.prepare('SELECT id,client_id,key,name,share_token,share_access,share_created_at,share_require_name,share_audience FROM projects ORDER BY id').all());
  console.log(JSON.stringify(receipt));
} finally {if(db.inTransaction) db.exec('ROLLBACK');db.close();}
NODE
