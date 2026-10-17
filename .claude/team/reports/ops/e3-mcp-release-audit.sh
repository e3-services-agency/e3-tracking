#!/usr/bin/env bash
set -euo pipefail
cd /opt/e3-tracking
printf 'IMAGE '; sudo grep '^IMAGE=' .env | cut -d= -f2-
printf 'CONFIG_SHA '; sudo grep -v '^IMAGE=' .env | sha256sum | cut -d' ' -f1
for service in caddy oauth2-proxy; do
  printf '%s ' "$service"
  sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge ps -q "$service"
done
sudo docker compose --env-file .env -f docker-compose.yml -f docker-compose.gcp.yml --profile edge exec -T app node --input-type=commonjs - <<'NODE'
const Database = require('better-sqlite3');
const {createHash} = require('node:crypto');
const db = new Database('/data/e3-tracking.sqlite',{readonly:true,fileMustExist:true});
try {
  if(db.pragma('integrity_check',{simple:true})!=='ok') throw Error('integrity failed');
  if(db.pragma('foreign_key_check').length) throw Error('foreign keys failed');
  const schema=db.prepare('SELECT MAX(id) id FROM schema_migrations').get().id;
  if(schema!=='0045_share_audience.sql') throw Error('Expected schema0045');
  console.log('SCHEMA',schema);
  for(const t of ['clients','projects','events','properties','property_definitions','comments','findings','qa_runs','qa_reports','change_log']) {
    const rows=db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all();
    console.log('BUSINESS',t,rows.length,createHash('sha256').update(JSON.stringify(rows)).digest('hex'));
  }
  console.log('INTEGRITY ok FOREIGN_KEYS ok');
} finally {db.close();}
NODE