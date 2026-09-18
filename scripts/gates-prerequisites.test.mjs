import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const project = fileURLToPath(new URL('../', import.meta.url));
const env = { PATH: '', SystemRoot: process.env.SystemRoot || '', TEMP: tmpdir() };
function run(script, args, extra = {}, cwd = project) {
  return spawnSync(process.execPath, [join(project,'scripts',script), ...args], {cwd, env:{...env,...extra},encoding:'utf8',timeout:15000});
}
for (const [script, args] of [
  ['security-lint.mjs',['--ci']], ['security-lint.mjs',['--require','--json']],
  ['policy-sweep.mjs',['--require']], ['migrations-check.mjs',['--require']],
  ['release-gate.mjs',['--require','--only=build']], ['release-gate.mjs',['--require','--skip=security']],
]) test(`${script} ${args.join(' ')} recusa execução incompleta`,()=>{
  const result=run(script,args);
  assert.equal(result.error,undefined);
  assert.equal(result.status,1,result.stdout+result.stderr);
});
test('restore remoto é recusado antes de subprocesso, dump ou arquivo de relatório',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'aveto-restore-deny-'));
  const result=run('backup-restore-drill.mjs',['--require'],{
    SUPABASE_DB_URL:'postgres://reader:synthetic-secret@staging.invalid/postgres',
    RESTORE_DB_URL:'postgres://writer:synthetic-secret@production.invalid/postgres',
  },cwd);
  assert.equal(result.status,1);
  assert.match(result.stderr,/Restore recusado/);
  assert.ok(!result.stderr.includes('synthetic-secret'));
  assert.deepEqual(readdirSync(cwd),[]);
});
