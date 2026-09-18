import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateTestEnvironment,assertNoProductionReferences} from './test-target-safety.mjs';
import {requireCompleteIntegrationReport} from './integration-report-check.mjs';
try {
  if(process.argv.length>2)throw new Error('Integração obrigatória não aceita filtros ou opções parciais.');
  validateTestEnvironment(process.env);
  assertNoProductionReferences('src/test');
  const dir=mkdtempSync(join(tmpdir(),'aveto-integration-required-'));
  const output=join(dir,'results.json');
  const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','vitest.integration.config.ts','--reporter=verbose','--reporter=json',`--outputFile.json=${output}`],{stdio:'inherit',env:process.env});
  console.log(`Evidência da execução: ${output}`);
  if(result.error || result.status!==0)throw new Error('Vitest obrigatório falhou; aprovação bloqueada.');
  requireCompleteIntegrationReport(JSON.parse(readFileSync(output,'utf8')));
  console.log('Integração completa aprovada, sem casos omitidos.');
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
