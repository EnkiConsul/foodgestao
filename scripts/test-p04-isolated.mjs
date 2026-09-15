#!/usr/bin/env node
/**
 * Validação FUNCIONAL da P0.4 em banco isolado e descartável.
 *
 * O que faz:
 *  1. Sobe um cluster PostgreSQL local temporário exclusivo desta tarefa
 *     (diretório/porta próprios; não toca clusters existentes).
 *  2. Copia SOMENTE a ESTRUTURA real (pg_dump --schema-only dos schemas
 *     public, private e qa) PRESERVANDO grants, políticas, proprietários e
 *     triggers. Nenhum dado real/pessoal é copiado.
 *  3. Cria apenas os SHIMS de infraestrutura Supabase que não existem em um
 *     Postgres puro (auth.uid/auth.jwt/auth.role fiéis à implementação
 *     Supabase, auth.users, e stubs vazios de cron/vault/pgmq). Nenhuma função
 *     de segurança sob teste é substituída.
 *  4. Confere FIDELIDADE: os privilégios das rotinas sob teste, as políticas e
 *     os triggers de public.companies no clone têm de ser idênticos aos do
 *     banco de origem. Divergência = falha.
 *  5. Executa de verdade os scripts de teste SQL (fixtures sintéticas,
 *     SET ROLE authenticated com claims reais, funções mutantes internas).
 *  6. Grava relatório JSON + log textual sem segredos.
 *
 * Uso:
 *   node scripts/test-p04-isolated.mjs [--reuse-dump] [--keep]
 *
 * Segurança: nenhuma credencial é passada por argv nem impressa; a conexão de
 * origem usa as variáveis PG* do ambiente e é usada apenas para LEITURA
 * (pg_dump --schema-only e SELECTs de catálogo).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const ARGS = new Set(process.argv.slice(2));
const REUSE_DUMP = ARGS.has("--reuse-dump");
const KEEP = ARGS.has("--keep");

const DATA_DIR = "/tmp/p04pg";
const SOCK_DIR = "/tmp/p04pg_sock";
const PORT = 55437;
const DB = "p04iso";
const SCHEMA_FILE = "/tmp/p04_schema.sql";
const LOG_FILE = resolve("docs/security/p0-4-functional-validation.log");
const REPORT_FILE = resolve("docs/security/p0-4-functional-validation.report.json");

const TEST_FILES = [
  "supabase/tests/dp_internal_functions_p04.test.sql",
  "supabase/tests/dp_p04_scenarios_isolated.test.sql",
];

/** Rotinas internas fechadas na P0.4 (9) + as 2 app-facing preservadas. */
const CRITICAL_FUNCS = [
  "dp_bulk_increment_processed",
  "dp_escala_auto_gerar",
  "dp_escala_auto_gerar_todas",
  "dp_folga_autoatribuir_todas",
  "dp_folga_autoatribuir_competencia",
  "dp_folga_autoatribuir_manual",
  "dp_folga_autoatribuicao_previa",
  "dp_escala_item_validar_setor",
  "dp_folgas_validar_unificado",
  "dp_folga_autoatribuicao_plano",
  "dp_folga_autoatribuir_aplicar",
];

const targetEnv = {
  ...process.env,
  PGSSLMODE: "disable",
  PGHOST: "127.0.0.1",
  PGPORT: String(PORT),
  PGUSER: "postgres",
  PGDATABASE: DB,
  PGPASSWORD: "",
  PGOPTIONS: "",
};

const UNPRIV = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"];

const logLines = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logLines.push(line);
  console.log(line);
}
function flushLog() {
  writeFileSync(LOG_FILE, logLines.join("\n") + "\n");
}

function run(cmd, argv, opts = {}) {
  return spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
}
function must(cmd, argv, opts = {}) {
  const r = run(cmd, argv, opts);
  if (r.status !== 0) throw new Error(`${cmd} falhou (${r.status}): ${(r.stderr || "").slice(0, 3000)}`);
  return r.stdout ?? "";
}

const q = (sql, database = DB) =>
  must("psql", ["-v", "ON_ERROR_STOP=1", "-At", "-d", database, "-c", sql], { env: targetEnv });

/** SELECT no banco de ORIGEM (somente leitura, credenciais só via env). */
const qSource = (sql) =>
  must("psql", ["-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { env: process.env });

/* --------------------------- cluster temporário --------------------------- */

function isUp() {
  return run("psql", ["-At", "-d", "postgres", "-c", "select 1"], { env: targetEnv }).status === 0;
}

function stopCluster() {
  if (existsSync(DATA_DIR)) {
    run(UNPRIV[0], [...UNPRIV.slice(1), "pg_ctl", "-D", DATA_DIR, "-m", "immediate", "stop"]);
  }
  rmSync(DATA_DIR, { recursive: true, force: true });
  rmSync(SOCK_DIR, { recursive: true, force: true });
}

function startCluster() {
  // Guardas de destino descartável: caminho fixo em /tmp, porta dedicada e
  // cluster recriado do zero a cada execução.
  if (!DATA_DIR.startsWith("/tmp/p04pg")) throw new Error("guarda: DATA_DIR precisa ser /tmp/p04pg*");
  if (PORT === Number(process.env.PGPORT ?? 0) && (process.env.PGHOST ?? "") === "127.0.0.1") {
    throw new Error("guarda: porta/host colidem com a conexão de origem");
  }
  stopCluster();
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(SOCK_DIR, { recursive: true });
  must("chown", ["-R", "1000:1000", DATA_DIR, SOCK_DIR]);
  must(UNPRIV[0], [...UNPRIV.slice(1), "initdb", "-D", DATA_DIR, "-U", "postgres", "--auth=trust"]);
  must(UNPRIV[0], [
    ...UNPRIV.slice(1),
    "pg_ctl",
    "-D",
    DATA_DIR,
    "-o",
    [`-p ${PORT}`, `-k ${SOCK_DIR}`, "-c fsync=off", "-c listen_addresses=127.0.0.1"].join(" "),
    "-l",
    `${DATA_DIR}/server.log`,
    "start",
  ]);
  for (let i = 0; i < 30 && !isUp(); i++) run("sleep", ["1"]);
  if (!isUp()) throw new Error("cluster temporário não subiu");
  q(`create database ${DB}`, "postgres");

  // Guarda pós-conexão: só prossegue se estivermos realmente no cluster novo.
  const dir = q("show data_directory").trim();
  if (dir !== DATA_DIR) throw new Error(`guarda: data_directory inesperado (${dir})`);
  log(`cluster temporário no ar (data_directory=${dir}, porta ${PORT}, localhost)`);
}

/* ------------------------------ bootstrap -------------------------------- */

const BOOTSTRAP_SQL = `
-- papéis do Supabase referenciados por grants/owners do dump
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','sandbox_exec','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','dashboard_user','pgbouncer'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;
end $$;
alter role service_role bypassrls;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
create schema if not exists private;
create schema if not exists extensions;
create schema if not exists vault;
create schema if not exists cron;
create schema if not exists pgmq;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema public;
create extension if not exists unaccent with schema public;
grant usage on schema auth, extensions to anon, authenticated, service_role;

-- SHIM de infraestrutura: auth.users mínimo (colunas usadas pelo código real)
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_sent_at timestamptz,
  recovery_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  phone text,
  phone_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean default false
);

-- SHIM fiel à implementação Supabase (GoTrue): lê os claims do request.
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;
create or replace function auth.jwt() returns jsonb language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$fn$;
create or replace function auth.role() returns text language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$fn$;
create or replace function auth.email() returns text language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$fn$;
grant execute on function auth.uid(), auth.jwt(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- STUBS vazios de infraestrutura externa (não são objetos sob teste)
create table if not exists cron.job (
  jobid bigserial primary key, schedule text, command text, nodename text default 'localhost',
  nodeport int default 5432, database text, username text, active boolean default true, jobname text);
create table if not exists cron.job_run_details (
  jobid bigint, runid bigserial primary key, job_pid int, database text, username text,
  command text, status text, return_message text, start_time timestamptz, end_time timestamptz);
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(), name text, description text,
  secret text, created_at timestamptz default now(), updated_at timestamptz default now());
create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at, updated_at from vault.secrets;
create or replace function pgmq.send(queue_name text, msg jsonb, delay integer default 0)
  returns setof bigint language sql as $fn$ select 0::bigint where false $fn$;
create or replace function pgmq.read(queue_name text, vt integer, qty integer)
  returns setof record language sql as $fn$ select where false $fn$;
create or replace function pgmq.delete(queue_name text, msg_id bigint)
  returns boolean language sql as $fn$ select true $fn$;
`;

/* -------------------------------- restore -------------------------------- */

function dumpSchema() {
  if (REUSE_DUMP && existsSync(SCHEMA_FILE)) {
    log(`reutilizando estrutura já exportada (${SCHEMA_FILE})`);
    return;
  }
  log("exportando ESTRUTURA real (schema-only: public, private, qa) com grants/policies/owners…");
  must("pg_dump", [
    "--schema-only",
    "--schema=public",
    "--schema=private",
    "--schema=qa",
    "-f",
    SCHEMA_FILE,
  ], { env: process.env });
  log("estrutura exportada (nenhum dado copiado)");
}

function restoreSchema() {
  const r = run("psql", ["-d", DB, "-f", SCHEMA_FILE], { env: targetEnv });
  const errors = (r.stderr || "")
    .split("\n")
    .filter((l) => /^psql:.*ERROR:/.test(l))
    .map((l) => l.replace(/^psql:[^ ]+ /, "").trim());
  const fatal = errors.filter((e) => CRITICAL_FUNCS.some((f) => e.includes(f)) || /companies/.test(e));
  return { total: errors.length, errors, fatal };
}

/* ------------------------------ fidelidade ------------------------------- */

const ACL_SQL = `
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' ||
       coalesce((select string_agg(distinct coalesce(a.grantee::regrole::text,'PUBLIC'), ',' order by coalesce(a.grantee::regrole::text,'PUBLIC'))
                 from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), '-')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (${CRITICAL_FUNCS.map((f) => `'${f}'`).join(",")})
 order by 1`;

const POLICY_SQL = `
select policyname || '|' || cmd || '|' || coalesce(qual,'-') || '|' || coalesce(with_check,'-')
  from pg_policies where schemaname='public' and tablename='companies' order by 1`;

const TRIGGER_SQL = `
select t.tgname || '|' || p.proname || '|' || t.tgenabled::text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.companies'::regclass and not t.tgisinternal order by 1`;

function fidelity() {
  const checks = [];
  for (const [name, sql] of [
    ["acl_rotinas_criticas", ACL_SQL],
    ["policies_companies", POLICY_SQL],
    ["triggers_companies", TRIGGER_SQL],
  ]) {
    const src = qSource(sql).trim();
    const dst = q(sql).trim();
    const ok = src === dst && src.length > 0;
    checks.push({
      check: name,
      status: ok ? "passed" : "failed",
      linhas_origem: src.split("\n").filter(Boolean).length,
      linhas_clone: dst.split("\n").filter(Boolean).length,
      diferenca: ok
        ? null
        : {
            somente_origem: src.split("\n").filter((l) => l && !dst.includes(l)).slice(0, 20),
            somente_clone: dst.split("\n").filter((l) => l && !src.includes(l)).slice(0, 20),
          },
    });
    log(`fidelidade ${name}: ${ok ? "IDÊNTICA" : "DIVERGENTE"} (origem ${src.split("\n").filter(Boolean).length} linhas)`);
  }
  return checks;
}

/* --------------------------------- testes -------------------------------- */

function runTestFile(file) {
  if (!existsSync(file)) {
    return { file, status: "pending", exit_code: null, motivo: "arquivo ausente", cenarios: [] };
  }
  const r = run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-f", file], { env: targetEnv });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const cenarios = out
    .split("\n")
    .filter((l) => /NOTICE:\s+(OK|PENDENTE)/.test(l))
    .map((l) => l.replace(/^.*NOTICE:\s+/, "").trim());
  const falhas = out
    .split("\n")
    .filter((l) => /ERROR:|FALHA /.test(l))
    .map((l) => l.trim());
  const status = r.status === 0 && falhas.length === 0 ? "passed" : "failed";
  log(`teste ${file}: exit=${r.status} status=${status} cenarios=${cenarios.length}`);
  for (const c of cenarios) log(`  · ${c}`);
  for (const f of falhas) log(`  ! ${f}`);
  return {
    file,
    comando: `psql -v ON_ERROR_STOP=1 -d ${DB} -f ${file}`,
    status,
    exit_code: r.status,
    cenarios,
    falhas,
  };
}

/* --------------------------------- main ---------------------------------- */

const report = {
  fase: "P0.4 — validação funcional em banco isolado",
  gerado_em: new Date().toISOString(),
  ambiente: {
    tipo: "cluster PostgreSQL local temporário e descartável",
    data_directory: DATA_DIR,
    host: "127.0.0.1",
    porta: PORT,
    banco: DB,
    origem_dos_dados: "nenhuma — apenas ESTRUTURA (pg_dump --schema-only)",
  },
  incluido: [
    "schemas public, private e qa completos (tabelas, funções, policies, triggers, grants, owners)",
    "papéis anon/authenticated/service_role/sandbox_exec com os mesmos grants do dump",
    "auth.users (shim de estrutura) e fixtures sintéticas criadas pelos testes",
  ],
  excluido: [
    "TODOS os dados reais (nenhuma linha copiada; zero dado pessoal)",
    "extensões externas indisponíveis localmente: pg_cron, pg_net, pgmq, supabase_vault, pg_stat_statements — substituídas por tabelas/funções STUB vazias",
    "schemas de plataforma não usados pelos objetos sob teste: storage, realtime, supabase_functions, graphql",
    "GoTrue/PostgREST reais: auth.uid()/auth.jwt()/auth.role() reimplementados fielmente sobre request.jwt.claims",
  ],
  nao_substituido: [
    "nenhuma função de segurança sob teste (has_role, is_super_admin, guards de titularidade, RPCs de folga, rotinas internas) foi alterada ou stubada — todas vêm do dump real",
  ],
  etapas: [],
  fidelidade: [],
  testes: [],
  limitacoes: [],
};

let exitCode = 0;
try {
  log("iniciando validação funcional isolada da P0.4");
  dumpSchema();
  startCluster();
  q(BOOTSTRAP_SQL);
  log("bootstrap de papéis/schemas/shims aplicado");

  const restore = restoreSchema();
  report.etapas.push({
    etapa: "restore_estrutura",
    erros_totais: restore.total,
    erros_em_objetos_sob_teste: restore.fatal.length,
    amostra_erros: restore.errors.slice(0, 40),
    status: restore.fatal.length === 0 ? "passed" : "failed",
  });
  log(`restore concluído: ${restore.total} erro(s) de dependência externa, ${restore.fatal.length} em objetos sob teste`);
  if (restore.fatal.length) {
    for (const f of restore.fatal.slice(0, 20)) log(`  ! FATAL ${f}`);
    throw new Error("restore falhou em objetos sob teste — validação não pode ser considerada válida");
  }

  const tabelas = Number(q(
    "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
  ).trim());
  const funcs = Number(q(
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
  ).trim());
  report.etapas.push({ etapa: "inventario_clone", tabelas_public: tabelas, funcoes_public: funcs });
  log(`clone: ${tabelas} tabelas e ${funcs} funções em public`);
  if (tabelas < 150) throw new Error(`estrutura incompleta no clone (${tabelas} tabelas)`);

  report.fidelidade = fidelity();
  if (report.fidelidade.some((c) => c.status !== "passed")) {
    throw new Error("fidelidade divergente entre origem e clone — validação inválida");
  }

  for (const f of TEST_FILES) report.testes.push(runTestFile(f));
  if (report.testes.some((t) => t.status === "failed")) exitCode = 1;
  if (report.testes.some((t) => t.status === "pending")) {
    report.limitacoes.push("Um ou mais arquivos de teste não foram executados (ver testes[].motivo) — pendente, NÃO aprovado.");
    exitCode = exitCode || 2;
  }
  report.status_geral = exitCode === 0 ? "passed" : "failed";
} catch (err) {
  exitCode = 1;
  report.status_geral = "failed";
  report.erro = String(err.message || err).slice(0, 4000);
  log(`ERRO: ${report.erro}`);
} finally {
  if (!KEEP) {
    stopCluster();
    log("cluster temporário destruído");
  } else {
    log("cluster mantido (--keep)");
  }
  report.codigo_saida = exitCode;
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n");
  flushLog();
  appendFileSync(LOG_FILE, `\n=== status geral: ${report.status_geral} (exit ${exitCode}) ===\n`);
  console.log(`relatório: ${REPORT_FILE}\nlog: ${LOG_FILE}`);
}
process.exit(exitCode);
