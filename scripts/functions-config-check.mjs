#!/usr/bin/env node
/**
 * Verifica divergência entre supabase/config.toml e as Edge Functions existentes.
 *
 * Reprova quando:
 *  - config.toml declara [functions.X] e a pasta supabase/functions/X não existe;
 *  - o baseline do Deno (scripts/deno-check.baseline.json) cita função inexistente.
 *
 * Nunca imprime segredos. Saída: reports/functions-config.json
 *
 *   node scripts/functions-config-check.mjs
 *   node scripts/functions-config-check.mjs --require   # exit 1 em divergência
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REQUIRE = process.argv.includes('--require');
const ROOT = process.cwd();
const OUT = resolve(ROOT, 'reports/functions-config.json');

const existentes = readdirSync(resolve(ROOT, 'supabase/functions'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_shared')
  .map((d) => d.name)
  .sort();

const config = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8');
const declaradas = [...config.matchAll(/^\s*\[functions\.([a-z0-9-_]+)\]/gim)].map((m) => m[1]);

let baseline = [];
try {
  baseline = JSON.parse(readFileSync(resolve(ROOT, 'scripts/deno-check.baseline.json'), 'utf8'));
} catch {
  baseline = [];
}

const declaradasInexistentes = declaradas.filter((f) => !existentes.includes(f));
const baselineInexistente = baseline.filter((f) => !existentes.includes(f));

const relatorio = {
  generated_at: new Date().toISOString(),
  total_funcoes: existentes.length,
  total_declaradas: declaradas.length,
  declaradas_inexistentes: declaradasInexistentes,
  baseline_inexistente: baselineInexistente,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(relatorio, null, 2));

console.log(
  `functions-config-check: ${existentes.length} funções | declaradas ${declaradas.length} | órfãs no config: ${declaradasInexistentes.length} | órfãs no baseline Deno: ${baselineInexistente.length}`,
);
for (const f of declaradasInexistentes) console.log(`  ✖ config.toml declara [functions.${f}] mas a função não existe`);
for (const f of baselineInexistente) console.log(`  ✖ baseline Deno cita ${f} mas a função não existe`);
console.log(`relatório: ${OUT}`);

if (REQUIRE && (declaradasInexistentes.length > 0 || baselineInexistente.length > 0)) process.exit(1);
