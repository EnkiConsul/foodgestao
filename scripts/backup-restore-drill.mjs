#!/usr/bin/env node
/**
 * Backup/restore drill — comprova que o dump do banco restaura em um Postgres limpo.
 *
 * Uso:
 *   node scripts/backup-restore-drill.mjs                     # usa SUPABASE_DB_URL → RESTORE_DB_URL
 *   node scripts/backup-restore-drill.mjs --require           # falha se faltar credencial (CI/gate)
 *   node scripts/backup-restore-drill.mjs --schema-only       # dump sem dados (mais rápido)
 *
 * Variáveis:
 *   SUPABASE_DB_URL  banco de origem (staging — NUNCA produção com dados sensíveis)
 *   RESTORE_DB_URL   banco de destino descartável (ex.: postgres do serviço do CI)
 *
 * Saída: reports/backup-restore.json com tamanho do dump, tempo e contagens comparadas.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const REQUIRE = args.has("--require");
const SCHEMA_ONLY = args.has("--schema-only");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const SRC = process.env.SUPABASE_DB_URL || process.env.STAGING_SUPABASE_DB_URL;
const DST = process.env.RESTORE_DB_URL;

function bail(msg) {
  if (REQUIRE) {
    console.error(`${RED}✗ ${msg}${RESET}`);
    process.exit(1);
  }
  console.warn(`${YELLOW}⚠ ${msg} — drill ignorado.${RESET}`);
  process.exit(0);
}

if (!SRC) bail("SUPABASE_DB_URL/STAGING_SUPABASE_DB_URL ausente");
if (!DST) bail("RESTORE_DB_URL ausente (banco descartável de restore)");

function run(cmd, argv, opts = {}) {
  const res = spawnSync(cmd, argv, { encoding: "utf8", ...opts });
  if (res.error) {
    console.error(`${RED}✗ falha ao executar ${cmd}: ${res.error.message}${RESET}`);
    process.exit(1);
  }
  return res;
}

function psql(url, sql) {
  const res = run("psql", [url, "-v", "ON_ERROR_STOP=1", "-Atc", sql]);
  if (res.status !== 0) {
    console.error(`${RED}✗ psql falhou:${RESET}\n${res.stderr}`);
    process.exit(1);
  }
  return res.stdout.trim();
}

mkdirSync("reports", { recursive: true });
const dumpPath = "reports/backup-drill.dump";

console.log(`${CYAN}▶ pg_dump (${SCHEMA_ONLY ? "schema-only" : "schema+dados"})${RESET}`);
const t0 = Date.now();
const dumpArgs = [
  SRC,
  "-Fc",
  "--no-owner",
  "--no-privileges",
  "--schema=public",
  "-f",
  dumpPath,
];
if (SCHEMA_ONLY) dumpArgs.push("--schema-only");
const dump = run("pg_dump", dumpArgs, { stdio: ["ignore", "inherit", "pipe"] });
if (dump.status !== 0) {
  console.error(`${RED}✗ pg_dump falhou:${RESET}\n${dump.stderr}`);
  process.exit(1);
}
const dumpMs = Date.now() - t0;
const dumpBytes = statSync(dumpPath).size;
if (dumpBytes < 1024) {
  console.error(`${RED}✗ dump suspeito (${dumpBytes} bytes)${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓ dump ok${RESET} — ${(dumpBytes / 1024 / 1024).toFixed(2)} MB em ${dumpMs}ms`);

console.log(`${CYAN}▶ preparando destino${RESET}`);
psql(DST, "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");

console.log(`${CYAN}▶ pg_restore${RESET}`);
const t1 = Date.now();
const restore = run("pg_restore", [
  "--dbname",
  DST,
  "--no-owner",
  "--no-privileges",
  "--exit-on-error",
  dumpPath,
]);
const restoreMs = Date.now() - t1;
if (restore.status !== 0) {
  console.error(`${RED}✗ pg_restore falhou:${RESET}\n${restore.stderr}`);
  process.exit(1);
}
console.log(`${GREEN}✓ restore ok${RESET} (${restoreMs}ms)`);

const COUNT_SQL = `select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`;
const FN_SQL = `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`;

const srcTables = Number(psql(SRC, COUNT_SQL));
const dstTables = Number(psql(DST, COUNT_SQL));
const srcFns = Number(psql(SRC, FN_SQL));
const dstFns = Number(psql(DST, FN_SQL));

const report = {
  ranAt: new Date().toISOString(),
  schemaOnly: SCHEMA_ONLY,
  dumpBytes,
  dumpMs,
  restoreMs,
  tables: { source: srcTables, restored: dstTables },
  functions: { source: srcFns, restored: dstFns },
};

const problems = [];
if (dstTables < srcTables) problems.push(`tabelas restauradas ${dstTables} < origem ${srcTables}`);
if (dstFns < srcFns) problems.push(`funções restauradas ${dstFns} < origem ${srcFns}`);
report.ok = problems.length === 0;
report.problems = problems;

writeFileSync("reports/backup-restore.json", JSON.stringify(report, null, 2));
console.table([
  { objeto: "tabelas", origem: srcTables, restaurado: dstTables },
  { objeto: "funções", origem: srcFns, restaurado: dstFns },
]);

if (!report.ok) {
  console.error(`${RED}✗ drill reprovado:${RESET}\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log(`${GREEN}✓ backup/restore drill aprovado${RESET}`);
