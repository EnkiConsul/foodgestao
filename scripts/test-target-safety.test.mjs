import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateTestEnvironment, validateCatalogEnvironment, assertNoProductionReferences, productionRef } from './test-target-safety.mjs';
const ref='abcdefghijklmnopqrst';
const valid={TEST_SUPABASE_URL:`https://${ref}.supabase.co`,TEST_SUPABASE_ANON_KEY:'synthetic',
  TEST_EXPECTED_PROJECT_REF:ref,TEST_COMPANY_1_ID:'company-one',TEST_COMPANY_2_ID:'company-two'};
for(const user of ['A','B','C','D']) {
  valid[`TEST_USER_${user}_EMAIL`]=`${user}@example.invalid`;
  valid[`TEST_USER_${user}_PASSWORD`]='synthetic';
}
test('aceita configuração completa de destino independente',()=>assert.doesNotThrow(()=>validateTestEnvironment(valid)));
const catalog={TEST_EXPECTED_PROJECT_REF:ref,PGHOST:`db.${ref}.supabase.co`,PGUSER:'postgres',PGDATABASE:'postgres',PGPORT:'5432'};
test('catálogo aceita host direto do projeto independente',()=>assert.doesNotThrow(()=>validateCatalogEnvironment(catalog)));
test('catálogo recusa host de produção herdado',()=>assert.throws(()=>validateCatalogEnvironment({...catalog,PGHOST:`db.${productionRef}.supabase.co`})));
test('catálogo recusa desvio de host via libpq',()=>assert.throws(()=>validateCatalogEnvironment({...catalog,PGHOSTADDR:'192.0.2.10'})));
test('catálogo recusa DSN em PGDATABASE',()=>assert.throws(()=>validateCatalogEnvironment({...catalog,PGDATABASE:'postgres://production.invalid/postgres'})));
test('catálogo aceita pooler somente com usuário do projeto',()=>{
  const pool={...catalog,PGHOST:'aws-0-sa-east-1.pooler.supabase.com',PGUSER:`postgres.${ref}`};
  assert.doesNotThrow(()=>validateCatalogEnvironment(pool));
  assert.throws(()=>validateCatalogEnvironment({...pool,PGUSER:`postgres.${productionRef}`}));
});
test('recusa produção mesmo explicitamente configurada',()=>assert.throws(()=>validateTestEnvironment({...valid,
  TEST_SUPABASE_URL:`https://${productionRef}.supabase.co`,TEST_EXPECTED_PROJECT_REF:productionRef}),/recusado/));
for(const url of ['https://other.supabase.co','https://abcdefghijklmnopqrst.supabase.co.evil.invalid',
  'https://abcdefghijklmnopqrst.supabase.co?host=other','https://user:secret@abcdefghijklmnopqrst.supabase.co']) {
  test(`recusa URL divergente ou ambígua: ${url.replace('user:secret@','')}`,()=>{
    assert.throws(()=>validateTestEnvironment({...valid,TEST_SUPABASE_URL:url}),/recusado/);
  });
}
for(const user of ['A','B','C','D']) test(`recusa ausência da senha ${user}`,()=>{
  assert.throws(()=>validateTestEnvironment({...valid,[`TEST_USER_${user}_PASSWORD`]:''}),/incompleto/);
});
test('recusa empresas iguais',()=>assert.throws(()=>validateTestEnvironment({...valid,TEST_COMPANY_2_ID:valid.TEST_COMPANY_1_ID}),/distintas/));
test('bloqueia referência a produção em helper importado sem executar arquivo',()=>{
  const dir=mkdtempSync(join(tmpdir(),'aveto-test-scan-'));
  writeFileSync(join(dir,'helper.ts'),`throw new Error('não executar'); const host='${productionRef}';`);
  assert.throws(()=>assertNoProductionReferences(dir),/1 arquivos/);
});
