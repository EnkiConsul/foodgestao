#!/usr/bin/env node
/**
 * Validação FUNCIONAL da P0.4 em banco isolado e descartável.
 *
 * Garantias de segurança do runner:
 *  · O cluster é criado em diretório EXCLUSIVO desta execução (mkdtemp) com um
 *    arquivo marcador; a limpeza só para/apaga o cluster se ele foi criado por
 *    esta execução. Diretórios/clusters preexistentes nunca são tocados.
 *  · As guardas de destino (host/porta/colisão com a origem) rodam ANTES de
 *    qualquer initdb; as guardas de data_directory/porta/listen_addresses rodam
 *    ANTES de CREATE DATABASE, bootstrap ou fixture.
 *  · O servidor escuta apenas 127.0.0.1; nenhuma credencial vai para argv nem
 *    para o log.
 *  · Restore com ON_ERROR_STOP=1: qualquer erro reprova (sem julgar validade por
 *    nome de objeto).
 *  · A estrutura é reexportada a cada execução (não há reuso de snapshot).
 *
 * Uso:
 *   node scripts/test-p04-isolated.mjs [--keep] [--self-test]
 *     --keep       preserva o cluster criado por ESTA execução para inspeção
 *     --self-test  verifica que uma falha antes do start não dispara limpeza
 *                  em cluster alheio (não roda as suítes)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ARGV = process.argv.slice(2);
const ARGS = new Set(ARGV);
const KEEP = ARGS.has("--keep");
const SELF_TEST = ARGS.has("--self-test");
const PENDING_SELF_TEST = ARGS.has("--pending-self-test");
/** valor de --chave=valor */
const opt = (nome) => {
  const p = ARGV.find((a) => a.startsWith(`--${nome}=`));
  return p ? p.slice(nome.length + 3) : null;
};
const lista = (nome) => (opt(nome) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const PORT = 55437;
const DB = "p04iso";
const SCHEMA_FILE = join(tmpdir(), `p04_schema_${process.pid}.sql`);
const MARKER = ".p04-runner-owned";

/**
 * Modo de suíte: o mesmo executor isolado serve outras validações.
 *   --suite=<nome>              prefixo dos arquivos de evidência
 *   --migrations=a.sql,b.sql    migrações aplicadas SOMENTE AO CLONE, após o
 *                               restore da estrutura e ANTES dos testes
 *   --tests=x.sql,y.sql         suítes SQL a executar no clone
 */
const SUITE = opt("suite") ?? "p0-4-functional-validation";
const MIGRATIONS = lista("migrations");
// o teste dirigido de pendência escreve em /tmp para não sobrescrever a evidência
const OUT_DIR = PENDING_SELF_TEST ? "/tmp" : resolve("docs/security");
const LOG_FILE = `${OUT_DIR}/${SUITE}.log.txt`;
const REPORT_FILE = `${OUT_DIR}/${SUITE}.report.json`;

const TEST_FILES = lista("tests").length
  ? lista("tests")
  : [
      "supabase/tests/dp_internal_functions_p04.test.sql",
      "supabase/tests/dp_p04_scenarios_isolated.test.sql",
    ];

/** Rotinas fechadas na P0.4 (9) + as 2 app-facing preservadas. */
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

/** Guards de titularidade e cadeia de autorização transitiva. */
const AUTHZ_FUNCS = [
  ["public", "companies_guard_owner_transfer"],
  ["public", "dp_guard_company_owner_transfer"],
  ["public", "prevent_company_ownership_transfer"],
  ["public", "is_super_admin"],
  ["public", "has_role"],
  ["public", "dp_folga_dias_fds_aplicaveis"],
  ["public", "dp_folgas_janela_efetiva"],
  ["private", "is_company_admin_or_owner"],
  ["private", "dp_access_enabled"],
  ["private", "company_owner_snapshot"],
];

/* --------------------------- estado da execução --------------------------- */

let RUN_DIR = null;
let DATA_DIR = null;
let SOCK_DIR = null;
let CREATED_BY_US = false; // só true depois de initdb bem-sucedido nesta execução

const logLines = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logLines.push(line);
  console.log(line);
}

function run(cmd, argv, opts = {}) {
  return spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
}
function must(cmd, argv, opts = {}) {
  const r = run(cmd, argv, opts);
  if (r.error) throw new Error(`${cmd} não executou: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} falhou (${r.status}): ${(r.stderr || "").slice(0, 3000)}`);
  return r.stdout ?? "";
}

function targetEnv() {
  return {
    ...process.env,
    PGSSLMODE: "disable",
    PGHOST: "127.0.0.1",
    PGPORT: String(PORT),
    PGUSER: "postgres",
    PGDATABASE: DB,
    PGPASSWORD: "",
    PGOPTIONS: "",
  };
}
const q = (sql, database = DB) =>
  must("psql", ["-v", "ON_ERROR_STOP=1", "-At", "-d", database, "-c", sql], { env: targetEnv() });

/** SELECT no banco de ORIGEM (somente leitura; credenciais só via env). */
const qSource = (sql) =>
  must("psql", ["-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { env: process.env });

const UNPRIV = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"];

/* --------------------------- cluster temporário --------------------------- */

/** Guardas que NÃO dependem de conexão — rodam antes de qualquer initdb. */
function preStartGuards() {
  const srcHost = process.env.PGHOST ?? "";
  const srcPort = Number(process.env.PGPORT ?? 0);
  const localHost = ["127.0.0.1", "localhost", "::1", ""].includes(srcHost);
  if (localHost && srcPort === PORT) {
    throw new Error("guarda pré-start: porta/host do destino colidem com a conexão de origem");
  }
  log("guardas pré-start aprovadas (destino não colide com a conexão de origem)");
}

function isUp() {
  return run("psql", ["-At", "-d", "postgres", "-c", "select 1"], { env: targetEnv() }).status === 0;
}

/** Só para/apaga o cluster desta execução — nunca um diretório preexistente. */
function cleanup() {
  if (!CREATED_BY_US || !DATA_DIR) {
    log("limpeza ignorada: nenhum cluster foi criado por esta execução");
    return;
  }
  if (!RUN_DIR || !existsSync(join(RUN_DIR, MARKER))) {
    log(`limpeza abortada: marcador ausente em ${RUN_DIR} (diretório não é desta execução)`);
    return;
  }
  run(UNPRIV[0], [...UNPRIV.slice(1), "pg_ctl", "-D", DATA_DIR, "-m", "immediate", "stop"]);
  rmSync(RUN_DIR, { recursive: true, force: true });
  rmSync(SOCK_DIR, { recursive: true, force: true });
  log("cluster desta execução destruído");
}

function startCluster() {
  RUN_DIR = mkdtempSync(join(tmpdir(), "p04pg-run-"));
  writeFileSync(join(RUN_DIR, MARKER), `${process.pid} ${new Date().toISOString()}\n`);
  DATA_DIR = join(RUN_DIR, "pgdata");
  mkdirSync(DATA_DIR);
  SOCK_DIR = mkdtempSync(join(tmpdir(), "p04pg-sock-"));
  if (readdirSync(DATA_DIR).length !== 0) throw new Error("guarda: diretório de dados não está vazio");
  must("chown", ["-R", "1000:1000", RUN_DIR, SOCK_DIR]);
  must(UNPRIV[0], [...UNPRIV.slice(1), "initdb", "-D", DATA_DIR, "-U", "postgres", "--auth=trust"]);
  CREATED_BY_US = true; // a partir daqui a limpeza pode agir sobre ESTE diretório
  must(UNPRIV[0], [
    ...UNPRIV.slice(1),
    "pg_ctl",
    "-D",
    DATA_DIR,
    "-o",
    [`-p ${PORT}`, `-k ${SOCK_DIR}`, "-c fsync=off", "-c listen_addresses=127.0.0.1"].join(" "),
    "-l",
    join(DATA_DIR, "server.log"),
    "start",
  ]);
  for (let i = 0; i < 30 && !isUp(); i++) run("sleep", ["1"]);
  if (!isUp()) throw new Error("cluster temporário não subiu");

  // Guardas pós-conexão, ANTES de CREATE DATABASE / bootstrap / fixtures.
  const dir = q("show data_directory", "postgres").trim();
  const port = q("show port", "postgres").trim();
  const listen = q("show listen_addresses", "postgres").trim();
  if (dir !== DATA_DIR) throw new Error(`guarda: data_directory inesperado (${dir})`);
  if (port !== String(PORT)) throw new Error(`guarda: porta inesperada (${port})`);
  if (listen !== "127.0.0.1") throw new Error(`guarda: listen_addresses inesperado (${listen})`);
  log(`cluster próprio no ar (data_directory=${dir}, porta ${port}, listen ${listen})`);

  q(`create database ${DB}`, "postgres");
  return { data_directory: dir, porta: Number(port), listen_addresses: listen };
}

/* ------------------------------ bootstrap -------------------------------- */

/**
 * Bootstrap: papéis + schemas de plataforma + shims de infraestrutura.
 * `public` é REMOVIDO aqui para que o dump o recrie com dono/grants reais e o
 * restore rode com ON_ERROR_STOP=1 sem colisão. `private` e `qa` também vêm do
 * dump. Nenhum objeto sob teste é criado ou substituído aqui.
 */
const BOOTSTRAP_SQL = `
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','sandbox_exec','authenticator',
                           'supabase_admin','supabase_auth_admin','supabase_storage_admin',
                           'dashboard_user','pgbouncer'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;
end $$;
alter role service_role bypassrls;
grant anon, authenticated, service_role to postgres;

drop schema if exists public cascade;
-- "public" e recriado aqui (e a linha CREATE SCHEMA public do dump e removida no
-- pré-processamento) porque o dump por --schema NÃO inclui CREATE EXTENSION, e
-- índices reais dependem de pg_trgm/unaccent instalados em public.
create schema public;
create extension pg_trgm with schema public;
create extension unaccent with schema public;

create schema auth;
create schema extensions;
create schema vault;
create schema cron;
create schema pgmq;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
grant usage on schema auth, extensions to anon, authenticated, service_role;

-- SHIM de estrutura: auth.users mínimo (colunas usadas pelo código real)
create table auth.users (
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

-- SHIMs de auth.*: corpos copiados do banco de origem (conferidos na etapa de
-- fidelidade auth_helpers_equivalentes).
create function auth.uid() returns uuid language sql stable as $fn$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;
create function auth.jwt() returns jsonb language sql stable as $fn$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$fn$;
create function auth.role() returns text language sql stable as $fn$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$fn$;
create function auth.email() returns text language sql stable as $fn$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$fn$;
grant execute on function auth.uid(), auth.jwt(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- STUBS vazios de infraestrutura externa (não são objetos sob teste)
create table cron.job (
  jobid bigserial primary key, schedule text, command text, nodename text default 'localhost',
  nodeport int default 5432, database text, username text, active boolean default true, jobname text);
create table cron.job_run_details (
  jobid bigint, runid bigserial primary key, job_pid int, database text, username text,
  command text, status text, return_message text, start_time timestamptz, end_time timestamptz);
create table vault.secrets (
  id uuid primary key default gen_random_uuid(), name text, description text,
  secret text, created_at timestamptz default now(), updated_at timestamptz default now());
create view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at, updated_at from vault.secrets;
create function pgmq.send(queue_name text, msg jsonb, delay integer default 0)
  returns setof bigint language sql as $fn$ select 0::bigint where false $fn$;
create function pgmq.read(queue_name text, vt integer, qty integer)
  returns setof record language sql as $fn$ select where false $fn$;
create function pgmq.delete(queue_name text, msg_id bigint)
  returns boolean language sql as $fn$ select true $fn$;
`;

/* ----------------------------- dump / restore ---------------------------- */

function dumpSchema() {
  log("exportando ESTRUTURA real (schema-only: public, private, qa) com grants/policies/owners…");
  must(
    "pg_dump",
    ["--schema-only", "--schema=public", "--schema=private", "--schema=qa", "-f", SCHEMA_FILE],
    { env: process.env }
  );
  // Pré-processamento mínimo do dump:
  //  1. remove a criação do schema public (já criado no bootstrap com extensões);
  //  2. remove os pares \restrict/\unrestrict emitidos pelo pg_dump 17.6+, que o
  //     psql rejeita ao ler o arquivo em modo restrito.
  // Owner/COMMENT/GRANTs do dump seguem aplicando normalmente.
  const raw = readFileSync(SCHEMA_FILE, "utf8");
  const filtered = raw
    .replace(/^CREATE SCHEMA public;$/m, "-- CREATE SCHEMA public; (criado no bootstrap com pg_trgm/unaccent)")
    .replace(/^\\(un)?restrict\b.*$/gm, "");
  if (filtered === raw) throw new Error("pré-processamento: linha CREATE SCHEMA public não encontrada no dump");
  writeFileSync(SCHEMA_FILE, filtered);

  log("estrutura exportada nesta execução (sem reuso de snapshot; nenhum dado copiado)");
}

/** Restore estrito: ON_ERROR_STOP=1, exit 0 obrigatório, sem allowlist por nome. */
function restoreSchema() {
  const r = run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-f", SCHEMA_FILE], { env: targetEnv() });
  if (r.error) throw new Error(`psql do restore não executou: ${r.error.message}`);
  const errors = (r.stderr || "")
    .split("\n")
    .filter((l) => /ERROR:|FATAL:|error:/.test(l))
    .map((l) => l.replace(/^psql:[^ ]+ /, "").trim());
  if (r.status !== 0 || errors.length > 0) {
    const amostra = errors.length
      ? errors
      : (r.stderr || "").split("\n").filter((l) => l.trim()).slice(-20);
    for (const e of amostra.slice(0, 20)) log(`  ! restore ${e}`);
    throw new Error(
      `restore reprovado (exit ${r.status}, ${errors.length} erro(s)) — validação inválida`
    );
  }
  log("restore concluído com ON_ERROR_STOP=1: exit 0 e nenhum erro");
  return { exit_code: r.status, erros: 0 };
}

/**
 * Aplica migrações NOVAS somente ao CLONE (nunca à origem), depois do restore da
 * estrutura real e antes de qualquer teste. ON_ERROR_STOP=1: qualquer erro
 * reprova a execução.
 */
function applyMigrations() {
  const etapas = [];
  for (const file of MIGRATIONS) {
    if (!existsSync(file)) throw new Error(`migração não encontrada: ${file}`);
    const r = run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-f", file], { env: targetEnv() });
    if (r.error) throw new Error(`psql da migração não executou: ${r.error.message}`);
    const errors = (r.stderr || "").split("\n").filter((l) => /ERROR:|FATAL:/.test(l));
    if (r.status !== 0 || errors.length > 0) {
      for (const e of errors.slice(0, 20)) log(`  ! migração ${e.trim()}`);
      throw new Error(`migração reprovada no clone (${file}, exit ${r.status})`);
    }
    log(`migração aplicada SOMENTE no clone: ${file}`);
    etapas.push({ etapa: "migracao_no_clone", arquivo: file, exit_code: r.status, status: "passed" });
    // idempotência: aplicar de novo não pode falhar
    const r2 = run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-f", file], { env: targetEnv() });
    if (r2.status !== 0) throw new Error(`migração não é idempotente: ${file}`);
    etapas.push({ etapa: "migracao_idempotente", arquivo: file, exit_code: r2.status, status: "passed" });
    log(`migração reaplicada sem erro (idempotente): ${file}`);
  }
  return etapas;
}



/**
 * Prova de concorrência real: preparo commitado, N processos psql SIMULTÂNEOS
 * (cada um recebe -v idx=<n>) e verificação. Só no clone descartável.
 *   --conc-setup=a.sql --conc-call=b.sql --conc-verify=c.sql [--conc-n=4]
 */
function concurrency() {
  const setup = opt("conc-setup");
  const call = opt("conc-call");
  const verify = opt("conc-verify");
  if (!setup || !call || !verify) return [];
  const n = Number(opt("conc-n") ?? 4);
  const etapas = [];

  for (const f of [setup, call, verify]) {
    if (!existsSync(f)) throw new Error(`arquivo de concorrência ausente: ${f}`);
  }

  const s = run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-f", setup], { env: targetEnv() });
  if (s.status !== 0) throw new Error(`preparo de concorrência falhou: ${(s.stderr || "").slice(0, 2000)}`);
  etapas.push({ etapa: "concorrencia_preparo", arquivo: setup, exit_code: 0, status: "passed" });

  // Cada filho tem diretório EXCLUSIVO e três arquivos: stdout, stderr e o
  // código de saída. Sem isso, `wait` esconde a falha de um dos processos.
  const dir = mkdtempSync(join(tmpdir(), "conc-"));
  // Guarda do próprio runner: um filho é forçado a falhar para provar exit 1.
  const guard = !!opt("conc-guard");
  const filhos = Array.from({ length: n }, (_, i) => ({
    idx: i + 1,
    forcarFalha: guard && i === 0,
  }));
  const cmds = filhos
    .map((f) => {
      const base = `psql -v ON_ERROR_STOP=1 -v idx=${f.idx} -d ${DB}`;
      const cmd = f.forcarFalha
        ? `${base} -c 'select 1/0 as guarda_do_runner'`
        : `${base} -f ${call}`;
      return `( ${cmd} > ${dir}/out_${f.idx} 2> ${dir}/err_${f.idx}; echo $? > ${dir}/exit_${f.idx} ) &`;
    })
    .join("\n");
  const p = run("bash", ["-c", `${cmds}\nwait`], { env: targetEnv() });

  const saidas = filhos.map((f) => {
    const ler = (nome) => (existsSync(`${dir}/${nome}_${f.idx}`) ? readFileSync(`${dir}/${nome}_${f.idx}`, "utf8") : null);
    const out = ler("out");
    const err = ler("err");
    const bruto = ler("exit");
    const exit = bruto === null || bruto.trim() === "" ? null : Number(bruto.trim());
    const texto = `${out ?? ""}\n${err ?? ""}`;
    const motivos = [];
    if (out === null || err === null || exit === null) motivos.push("saída do processo ausente");
    if (exit !== null && exit !== 0) motivos.push(`exit ${exit}`);
    if (/ERROR:|FATAL:|PANIC:/.test(texto)) motivos.push(texto.trim().slice(0, 500));
    return {
      idx: f.idx,
      exit_code: exit,
      forcado: f.forcarFalha,
      retorno: (out ?? "").trim().slice(0, 500),
      erro: motivos.length ? motivos.join(" | ") : null,
    };
  });
  const comErro = saidas.filter((x) => x.erro);
  if (p.status !== 0 || comErro.length > 0) {
    for (const x of comErro) log(`  ! concorrência idx=${x.idx}: ${x.erro}`);
    throw new Error(
      `chamadas concorrentes falharam (${comErro.length}/${n}; bash exit ${p.status}; logs em ${dir})`,
    );
  }
  log(`${n} chamadas simultâneas da RPC concluídas sem erro (exit 0 em todas)`);
  for (const x of saidas) log(`  · idx=${x.idx} exit=${x.exit_code} retorno=${x.retorno.replace(/\s+/g, " ").slice(0, 160)}`);
  etapas.push({
    etapa: "concorrencia_chamadas_simultaneas",
    arquivo: call,
    processos: n,
    logs: dir,
    detalhe: "idx 1 e 2 no MESMO item; idx 3 e 4 em itens distintos do MESMO lote",
    saidas,
    exit_code: 0,
    status: "passed",
  });

  const v = run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-f", verify], { env: targetEnv() });
  const out = `${v.stdout || ""}\n${v.stderr || ""}`;
  const notices = out.split("\n").filter((l) => /NOTICE:\s+(OK|PREP|PENDENTE)/.test(l))
    .map((l) => l.replace(/^.*NOTICE:\s+/, "").trim());
  for (const c of notices) log(`  · ${c}`);
  if (v.status !== 0 || /ERROR:|FALHA /.test(out)) {
    throw new Error(`verificação de concorrência reprovada: ${out.slice(0, 2000)}`);
  }
  etapas.push({
    etapa: "concorrencia_verificacao",
    arquivo: verify,
    exit_code: 0,
    assercoes: notices,
    status: "passed",
  });
  return etapas;
}

/* ------------------------------ fidelidade ------------------------------- */

const inList = (arr) => arr.map((f) => `'${f}'`).join(",");

const SQL_ACL = `
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' ||
       coalesce((select string_agg(distinct coalesce(a.grantee::regrole::text,'PUBLIC'), ',' order by coalesce(a.grantee::regrole::text,'PUBLIC'))
                 from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), '-')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in (${inList(CRITICAL_FUNCS)})
 order by 1`;

/** Corpo + dono + security definer + search_path das rotinas sob teste. */
const SQL_DEFS = `
select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' ||
       pg_get_userbyid(p.proowner) || '|' || p.prosecdef::text || '|' ||
       coalesce(array_to_string(p.proconfig, ','), '-') || '|' ||
       md5(regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname = 'public' and p.proname in (${inList(CRITICAL_FUNCS)}))
    or (n.nspname || '.' || p.proname) in (${inList(AUTHZ_FUNCS.map(([s, f]) => `${s}.${f}`))})
 order by 1`;

const SQL_POLICIES = `
select policyname || '|' || cmd || '|' || permissive || '|' ||
       coalesce(array_to_string(roles, ','), '-') || '|' ||
       coalesce(qual, '-') || '|' || coalesce(with_check, '-')
  from pg_policies where schemaname = 'public' and tablename = 'companies' order by 1`;

const SQL_TRIGGERS = `
select t.tgname || '|' || t.tgenabled::text || '|' || pg_get_triggerdef(t.oid)
  from pg_trigger t
 where t.tgrelid = 'public.companies'::regclass and not t.tgisinternal order by 1`;

/** Corpos normalizados de auth.uid/jwt/role/email (shim × real). */
const SQL_AUTH = `
select p.proname || '|' || pg_get_function_result(p.oid) || '|' ||
       md5(regexp_replace(coalesce(p.prosrc,''), '\\s+', ' ', 'g'))
  from pg_proc p
 where p.pronamespace = 'auth'::regnamespace
   and p.proname in ('uid','jwt','role','email')
 order by 1`;

function fidelity() {
  const checks = [];
  for (const [name, sql] of [
    ["acl_rotinas_criticas", SQL_ACL],
    ["definicoes_rotinas_e_autorizacao", SQL_DEFS],
    ["policies_companies", SQL_POLICIES],
    ["triggers_companies", SQL_TRIGGERS],
    ["auth_helpers_equivalentes", SQL_AUTH],
  ]) {
    const src = qSource(sql).trim();
    const dst = q(sql).trim();
    const ok = src === dst && src.length > 0;
    const linhas = src.split("\n").filter(Boolean).length;
    checks.push({
      check: name,
      status: ok ? "passed" : "failed",
      linhas_origem: linhas,
      linhas_clone: dst.split("\n").filter(Boolean).length,
      diferenca: ok
        ? null
        : {
            somente_origem: src.split("\n").filter((l) => l && !dst.includes(l)).slice(0, 20),
            somente_clone: dst.split("\n").filter((l) => l && !src.includes(l)).slice(0, 20),
          },
    });
    log(`fidelidade ${name}: ${ok ? "IDÊNTICA" : "DIVERGENTE"} (${linhas} linha(s) na origem)`);
  }
  return checks;
}

/* --------------------------------- testes -------------------------------- */

function runTestFile(file) {
  if (!existsSync(file)) {
    return { file, status: "pending", exit_code: null, motivo: "arquivo ausente" };
  }
  const r = run("psql", ["-v", "ON_ERROR_STOP=1", "-d", DB, "-f", file], { env: targetEnv() });
  if (r.error) return { file, status: "pending", exit_code: null, motivo: `psql não executou: ${r.error.message}` };
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const notices = out
    .split("\n")
    .filter((l) => /NOTICE:\s+(OK|PREP|PENDENTE)/.test(l))
    .map((l) => l.replace(/^.*NOTICE:\s+/, "").trim());
  const preparacao = notices.filter((l) => l.startsWith("PREP"));
  const pendentes = notices.filter((l) => l.startsWith("PENDENTE"));
  const grupos = notices.filter((l) => l.startsWith("OK"));
  const subcasos = grupos.reduce((acc, l) => {
    // aceita tanto "(18 casos)" quanto "(42501 FORBIDDEN, 4 casos)"
    const m = l.match(/(\d+)\s+casos?\)/);
    return acc + (m ? Number(m[1]) : 0);
  }, 0);
  const falhas = out.split("\n").filter((l) => /ERROR:|FALHA /.test(l)).map((l) => l.trim());
  const status =
    r.status !== 0 || falhas.length > 0 ? "failed" : pendentes.length > 0 ? "partial" : "passed";
  log(`teste ${file}: exit=${r.status} status=${status} preparacao=${preparacao.length} grupos=${grupos.length} subcasos=${subcasos} pendentes=${pendentes.length}`);
  for (const c of notices) log(`  · ${c}`);
  for (const f of falhas) log(`  ! ${f}`);
  return {
    file,
    comando: `psql -v ON_ERROR_STOP=1 -d ${DB} -f ${file}`,
    status,
    exit_code: r.status,
    contagem: {
      preparacao: preparacao.length,
      grupos_de_assercoes: grupos.length,
      subcasos_declarados: subcasos,
      pendentes: pendentes.length,
    },
    preparacao,
    grupos_de_assercoes: grupos,
    pendentes,
    falhas,
  };
}

/* ------------------------------- self-test ------------------------------- */

/** Comprova que uma falha ANTES do start não dispara limpeza em cluster alheio. */
function selfTest() {
  const alheio = mkdtempSync(join(tmpdir(), "p04pg-alheio-"));
  writeFileSync(join(alheio, "PGVERSION"), "17\n");
  const resultados = [];

  // 1. falha pré-start: nenhuma limpeza, nada apagado
  RUN_DIR = alheio;
  DATA_DIR = join(alheio, "pgdata");
  SOCK_DIR = alheio;
  CREATED_BY_US = false;
  cleanup();
  resultados.push({
    caso: "falha_pre_start_nao_limpa_cluster_alheio",
    status: existsSync(join(alheio, "PGVERSION")) ? "passed" : "failed",
  });

  // 2. mesmo com CREATED_BY_US ligado por engano, a ausência do marcador protege
  CREATED_BY_US = true;
  cleanup();
  resultados.push({
    caso: "sem_marcador_nao_apaga_diretorio",
    status: existsSync(join(alheio, "PGVERSION")) ? "passed" : "failed",
  });

  // 3. guarda de colisão com a origem
  let colidiu = false;
  const hadHost = Object.prototype.hasOwnProperty.call(process.env, "PGHOST");
  const hadPort = Object.prototype.hasOwnProperty.call(process.env, "PGPORT");
  const backup = { host: process.env.PGHOST, port: process.env.PGPORT };
  process.env.PGHOST = "127.0.0.1";
  process.env.PGPORT = String(PORT);
  try {
    preStartGuards();
  } catch {
    colidiu = true;
  }
  // restaurar com atribuição de undefined criaria a string "undefined" no Node
  if (hadHost) process.env.PGHOST = backup.host;
  else delete process.env.PGHOST;
  if (hadPort) process.env.PGPORT = backup.port;
  else delete process.env.PGPORT;
  resultados.push({ caso: "guarda_colisao_com_origem", status: colidiu ? "passed" : "failed" });

  rmSync(alheio, { recursive: true, force: true });
  RUN_DIR = null;
  DATA_DIR = null;
  SOCK_DIR = null;
  CREATED_BY_US = false;
  for (const r of resultados) log(`self-test ${r.caso}: ${r.status}`);
  return resultados;
}

/* --------------------------------- main ---------------------------------- */

const report = {
  fase: `${SUITE} — validação funcional em banco isolado`,
  suite: SUITE,
  migracoes_aplicadas_somente_no_clone: MIGRATIONS,
  gerado_em: new Date().toISOString(),
  comando: `node ${process.argv.slice(1).join(" ").replace(/^.*scripts\//, "scripts/")}`,
  ambiente: {
    tipo: "cluster PostgreSQL local temporário, exclusivo desta execução e descartável",
    host: "127.0.0.1",
    porta: PORT,
    banco: DB,
    origem_dos_dados: "nenhuma — apenas ESTRUTURA (pg_dump --schema-only), reexportada nesta execução",
  },
  incluido: [
    "schemas public, private e qa completos (tabelas, funções, policies, triggers, grants, owners) restaurados com ON_ERROR_STOP=1",
    "papéis anon/authenticated/service_role/sandbox_exec e papéis de plataforma, para os grants do dump aplicarem sem erro",
    "auth.users (estrutura) e auth.uid/jwt/role/email com corpos idênticos aos do banco real (conferido)",
  ],
  excluido: [
    "TODOS os dados reais — nenhuma linha copiada, nenhum dado pessoal",
    "extensões externas indisponíveis localmente: pg_cron, pg_net, pgmq, supabase_vault, pg_stat_statements — substituídas por tabelas/funções STUB vazias",
    "schemas de plataforma não referenciados pelos objetos sob teste: storage, realtime, supabase_functions, graphql",
    "serviços gerenciados (GoTrue, PostgREST, agendador, filas, cofre): não há equivalência integral; apenas o contrato de claims do auth.* é reproduzido",
  ],
  nao_substituido: [
    "nenhuma função de segurança sob teste (rotinas internas, RPCs de folga, guards de titularidade, has_role/is_super_admin/is_company_admin_or_owner/dp_access_enabled/company_owner_snapshot) foi criada ou alterada pelo bootstrap — todas vêm do dump real e têm corpo/dono/security definer/search_path conferidos",
  ],
  self_test_runner: [],
  etapas: [],
  fidelidade: [],
  testes: [],
  resumo_cenarios: {},
  limitacoes: [
    "Rotinas globais dp_escala_auto_gerar_todas() e dp_folga_autoatribuir_todas() só são exercitadas pela negação de EXECUTE: em modo global varrem todas as empresas do banco e não agregam prova além do caminho por empresa.",
    "Agendador (pg_cron), filas (pgmq) e cofre (supabase_vault) são stubs vazios: a execução agendada não é simulada; segue comprovada por privilégio e cadeia de chamadas.",
    "Camada HTTP não é exercitada: PostgREST e GoTrue não rodam aqui. As provas são no banco (privilégios, RLS, políticas, gatilhos, corpos das funções) com claims injetados como o PostgREST faz.",
    "Sem dados reais, o comportamento sobre volume, índices e latência de produção não é avaliado nesta etapa.",
    "S5.2 usa fixture de jornada LEGADA (gatilhos de selo desabilitados só durante o ARRANGE, no cluster descartável, e reabilitados/conferidos antes das chamadas). Isso comprova COMPATIBILIDADE com dados históricos — NÃO comprova geração automática a partir do modelo atual (Turnos + Configuração de trabalho).",
    "RISCO OPERACIONAL SEPARADO (evidência somente-leitura na origem, 2026-09-15): public.dp_jornadas tem 2 registros, public.dp_colaborador_jornadas tem 0 e public.dp_colaborador_config_trabalho tem 16 linhas com vigencia_fim IS NULL. Como dp_escala_auto_gerar lê exclusivamente dp_colaborador_jornadas + dp_jornadas e o gatilho trg_dp_jornadas_legado (BEFORE INSERT) sela o cadastro antigo, a geração automática de escala hoje não enxerga as configurações atuais. Modernizar essa rotina (e a importação) é o próximo ajuste técnico, fora desta etapa.",
  ],
};

let exitCode = 0;
try {
  log("iniciando validação funcional isolada da P0.4");
  preStartGuards();

  if (SELF_TEST) {
    report.self_test_runner = selfTest();
    report.status_geral = report.self_test_runner.every((r) => r.status === "passed") ? "passed" : "failed";
    exitCode = report.status_geral === "passed" ? 0 : 1;
  } else {
    report.self_test_runner = selfTest();
    if (report.self_test_runner.some((r) => r.status !== "passed")) {
      throw new Error("self-test do runner reprovado — não prossegue");
    }
    dumpSchema();
    report.ambiente = { ...report.ambiente, ...startCluster() };
    q(BOOTSTRAP_SQL);
    log("bootstrap de papéis/schemas/shims aplicado (public removido para o dump recriá-lo)");

    report.etapas.push({ etapa: "restore_estrutura", ...restoreSchema(), status: "passed" });

    const tabelas = Number(
      q("select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'").trim()
    );
    const funcs = Number(
      q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'").trim()
    );
    report.etapas.push({ etapa: "inventario_clone", tabelas_public: tabelas, funcoes_public: funcs });
    log(`clone: ${tabelas} tabelas e ${funcs} funções em public`);
    if (tabelas < 150) throw new Error(`estrutura incompleta no clone (${tabelas} tabelas)`);

    report.fidelidade = fidelity();
    if (report.fidelidade.some((c) => c.status !== "passed")) {
      throw new Error("fidelidade divergente entre origem e clone — validação inválida");
    }

    // fidelidade é conferida ANTES: as migrações novas entram só depois, e só no clone
    for (const e of applyMigrations()) report.etapas.push(e);

    for (const f of TEST_FILES) report.testes.push(runTestFile(f));
    for (const e of concurrency()) report.etapas.push(e);
    report.resumo_cenarios = report.testes.reduce(
      (acc, t) => ({
        preparacao: acc.preparacao + (t.contagem?.preparacao ?? 0),
        grupos_de_assercoes: acc.grupos_de_assercoes + (t.contagem?.grupos_de_assercoes ?? 0),
        subcasos_declarados: acc.subcasos_declarados + (t.contagem?.subcasos_declarados ?? 0),
        pendentes: acc.pendentes + (t.contagem?.pendentes ?? 0),
      }),
      { preparacao: 0, grupos_de_assercoes: 0, subcasos_declarados: 0, pendentes: 0 }
    );
    if (report.testes.some((t) => t.status === "failed")) exitCode = 1;
    if (report.testes.some((t) => t.status === "partial")) exitCode = exitCode || 2;
    if (report.testes.some((t) => t.status === "pending")) {
      report.limitacoes.push("Arquivo de teste não executado (ver testes[].motivo) — PENDENTE, não aprovado.");
      exitCode = exitCode || 2;
    }
    if (report.resumo_cenarios.pendentes > 0) {
      report.limitacoes.push(
        `${report.resumo_cenarios.pendentes} cenário(s) marcados como PENDENTE pelas suítes (ver testes[].pendentes) — não contam como aprovação.`
      );
      exitCode = exitCode || 2;
    }
    if (PENDING_SELF_TEST) {
      // ramo dirigido: força uma pendência sintética para provar que o selo geral
      // NÃO fica "passed" e o código de saída passa a 2 (reservando 1 para falha)
      report.resumo_cenarios.pendentes += 1;
      report.limitacoes.push("teste dirigido --pending-self-test: pendência sintética injetada para verificar o selo partial/exit 2");
      exitCode = exitCode || 2;
    }
    report.status_geral = exitCode === 0 ? "passed" : exitCode === 2 ? "partial" : "failed";
  }
} catch (err) {
  exitCode = 1;
  report.status_geral = "failed";
  report.erro = String(err.message || err).slice(0, 4000);
  log(`ERRO: ${report.erro}`);
} finally {
  rmSync(SCHEMA_FILE, { force: true });
  if (KEEP && CREATED_BY_US) log(`cluster próprio mantido em ${DATA_DIR} (--keep)`);
  else cleanup();
  report.codigo_saida = exitCode;
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(LOG_FILE, `${logLines.join("\n")}\n\n=== status geral: ${report.status_geral} (exit ${exitCode}) ===\n`);
  console.log(`relatório: ${REPORT_FILE}\nlog: ${LOG_FILE}`);
}
process.exit(exitCode);
