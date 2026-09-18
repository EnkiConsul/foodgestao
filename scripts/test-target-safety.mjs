import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const productionRef = 'grtxmbffgmgnkawlvqhm';
// Catalog tests use libpq separately from the HTTP client. Validate that route too.
export function validateCatalogEnvironment(env) {
  const ref=env.TEST_EXPECTED_PROJECT_REF;
  if(!/^[a-z]{20}$/.test(ref ?? '') || ref===productionRef) throw new Error('Projeto de catálogo recusado.');
  for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS']) {
    if(env[key])throw new Error(`Roteamento alternativo de catálogo recusado: ${key}`);
  }
  const direct=env.PGHOST===`db.${ref}.supabase.co` && env.PGUSER==='postgres';
  const pooler=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(env.PGHOST ?? '') && env.PGUSER===`postgres.${ref}`;
  if((!direct && !pooler) || env.PGDATABASE!=='postgres' || !['5432','6543'].includes(env.PGPORT ?? '5432')) {
    throw new Error('Conexão de catálogo não corresponde ao projeto de testes.');
  }
}
export function validateTestEnvironment(env) {
  const required = ['TEST_SUPABASE_URL', 'TEST_SUPABASE_ANON_KEY', 'TEST_EXPECTED_PROJECT_REF',
    'TEST_COMPANY_1_ID', 'TEST_COMPANY_2_ID',
    ...['A','B','C','D'].flatMap(user => [`TEST_USER_${user}_EMAIL`, `TEST_USER_${user}_PASSWORD`])];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Ambiente de testes incompleto: ${missing.join(', ')}`);
  let url;
  try { url = new URL(env.TEST_SUPABASE_URL); } catch { throw new Error('URL de testes inválida.'); }
  const ref = env.TEST_EXPECTED_PROJECT_REF;
  if (!/^[a-z]{20}$/.test(ref) || ref === productionRef ||
      url.origin !== `https://${ref}.supabase.co` || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
    throw new Error('Destino de testes recusado: exige projeto independente identificado explicitamente.');
  }
  if (env.TEST_COMPANY_1_ID === env.TEST_COMPANY_2_ID) throw new Error('Os testes exigem duas empresas distintas.');
}

export function assertNoProductionReferences(root) {
  const matches = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, {withFileTypes:true})) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name) && readFileSync(file,'utf8').includes(productionRef)) matches.push(file);
    }
  }
  walk(root);
  if (matches.length) throw new Error(`Integração bloqueada: ${matches.length} arquivos de teste ainda referenciam produção. Parametrize as suítes antes de executá-las.`);
}
