import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { closeDb, getDb } from '../backend/db';
import { createClient } from '../backend/dal/client.dal';
import { createProject } from '../backend/dal/project.dal';
import { createEvent } from '../backend/dal/event.dal';
import { withIdempotency, durableStep, currentWriteRequest } from './idempotency';

it('recovers after process death between operation commits without repeating the first change', async () => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(temporaryRoot, 'e3-receipt-crash-')));
  const database = path.join(directory, 'test.sqlite');
  process.env.E3_DB_PATH = database; closeDb();
  const project = createProject({ key: 'crash', name: 'Crash', client_id: createClient({ key: 'crash', name: 'Crash' }).id });
  closeDb();
  const input = { project_key: 'crash', idempotency_key: 'crash-batch' };
  const receiptModule = pathToFileURL(path.resolve('src/mcp/idempotency.ts')).href;
  const eventModule = pathToFileURL(path.resolve('src/backend/dal/event.dal.ts')).href;
  const code = `
    const {withIdempotency,durableStep}=await import(${JSON.stringify(receiptModule)});
    const {createEvent}=await import(${JSON.stringify(eventModule)});
    await withIdempotency('batch_apply',${JSON.stringify(input)},async()=>{
      durableStep('operation:0',()=>createEvent(${JSON.stringify(project.id)},{name:'one'}));
      process.stdout.write('COMMITTED\\n');
      await new Promise(()=>{});
    });
  `;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { env: { ...process.env, E3_DB_PATH: database }, stdio: ['ignore','pipe','pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exit = new Promise<void>(resolve => child.once('exit', () => resolve()));
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Child did not commit: ' + stderr)), 15000);
      child.stdout.on('data', chunk => { if (chunk.toString().includes('COMMITTED')) { clearTimeout(timer); resolve(); } });
      child.once('error', reject);
    });
    child.kill(); await exit;
    const before = getDb().prepare('SELECT id,batch_id FROM mcp_write_requests').get() as { id: string; batch_id: string };
    expect((getDb().prepare('SELECT COUNT(*) n FROM change_log').get() as any).n).toBe(1);
    // Advance the expired lease after proving that the original process has exited.
    getDb().prepare('UPDATE mcp_write_requests SET lease_until=0 WHERE id=?').run(before.id);
    const result = await withIdempotency('batch_apply', input, async () => {
      durableStep('operation:0', () => createEvent(project.id, { name: 'one' }));
      durableStep('operation:1', () => createEvent(project.id, { name: 'two' }));
      return { batch_id: currentWriteRequest()!.batch_id, applied: 2 };
    }) as any;
    expect(result).toMatchObject({ batch_id: before.batch_id, applied: 2, receipt_id: before.id });
    expect((getDb().prepare('SELECT COUNT(*) n FROM change_log').get() as any).n).toBe(2);
    expect((getDb().prepare('SELECT COUNT(*) n FROM mcp_write_steps').get() as any).n).toBe(2);
    const replay = await withIdempotency('batch_apply', input, async () => { throw new Error('Replay must not execute'); });
    expect(replay).toEqual(result);
  } finally {
    if (child.exitCode === null) child.kill();
    await exit; closeDb(); delete process.env.E3_DB_PATH;
    expect(path.dirname(directory)).toBe(temporaryRoot);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
