#!/usr/bin/env node
/**
 * Security linter — verifica regras de segurança no banco.
 *
 * Flags:
 *   --ci         Modo CI: logs verbosos (JSON + tabela) e falha apenas em findings críticos.
 *   --json       Imprime relatório em JSON puro (sem cores) e sai.
 *   --strict     Falha em qualquer finding (default fora do --ci).
 *
 * Severidades:
 *   critical → exit 1 sempre
 *   warning  → exit 1 só se --strict (ou modo default sem --ci)
 *
 * Sem credenciais (psql/SUPABASE_DB_URL ausentes) → sai 0 com aviso.
 */
import { spawnSync } from "node:child_process";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const args = new Set(process.argv.slice(2));
const CI = args.has("--ci");
const JSON_ONLY = args.has("--json");
const STRICT = args.has("--strict") || (!CI && !JSON_ONLY);

function log(msg) {
  if (!JSON_ONLY) console.log(msg);
}
function warn(msg) {
  if (!JSON_ONLY) console.warn(msg);
}
function err(msg) {
  if (!JSON_ONLY) console.error(msg);
}

function skip(reason) {
  warn(`${YELLOW}[security-lint] skipped: ${reason}${RESET}`);
  if (JSON_ONLY) console.log(JSON.stringify({ skipped: true, reason }));
  process.exit(0);
}

const which = spawnSync("which", ["psql"], { encoding: "utf8" });
if (which.status !== 0) skip("psql not found on PATH");

const dbUrl = process.env.SUPABASE_DB_URL;
const hasPgEnv = !!process.env.PGHOST;
if (!dbUrl && !hasPgEnv) skip("no SUPABASE_DB_URL / PG* env vars");

const checks = [
  {
    id: "0028_anon_security_definer",
    severity: "critical",
    description:
      "SECURITY DEFINER em `public` executável por anon/PUBLIC (escalada de privilégio para usuários não autenticados)",
    sql: `
      SELECT n.nspname || '.' || p.proname || '(' ||
             pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS finding
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      LEFT JOIN pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'public' AND p.prosecdef = true
        AND a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0 OR r.rolname = 'anon');
    `,
  },
  {
    id: "rls_disabled",
    severity: "critical",
    description: "Tabela em `public` sem RLS habilitado (acesso irrestrito)",
    sql: `
      SELECT schemaname || '.' || tablename AS finding
      FROM pg_tables
      WHERE schemaname = 'public' AND rowsecurity = false;
    `,
  },
  {
    id: "table_no_policies",
    severity: "critical",
    description:
      "Tabela em `public` com RLS habilitado mas SEM nenhuma policy (bloqueia tudo silenciosamente)",
    sql: `
      SELECT t.schemaname || '.' || t.tablename AS finding
      FROM pg_tables t
      WHERE t.schemaname = 'public' AND t.rowsecurity = true
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename
        );
    `,
  },
  {
    id: "0029_authenticated_security_definer",
    severity: "warning",
    description:
      "SECURITY DEFINER em `public` executável por authenticated (recomendado mover para schema privado)",
    sql: `
      SELECT n.nspname || '.' || p.proname || '(' ||
             pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS finding
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'public' AND p.prosecdef = true
        AND a.privilege_type = 'EXECUTE'
        AND r.rolname = 'authenticated';
    `,
  },
  {
    id: "webhook_events_client_writable",
    severity: "critical",
    description:
      "asaas_webhook_events com policy que permita INSERT/UPDATE/DELETE a anon/authenticated (writes devem ser exclusivos do service_role)",
    sql: `
      SELECT p.policyname || ' (' || p.cmd || ' → ' || array_to_string(p.roles, ',') || ')' AS finding
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename  = 'asaas_webhook_events'
        AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
        AND (p.roles && ARRAY['anon','authenticated','public']::name[])
        AND COALESCE(p.with_check, p.qual, 'true') NOT IN ('false','(false)');
    `,
  },
  {
    id: "company_invites_anon_exposure",
    severity: "critical",
    description:
      "company_invites com policy permitindo acesso ao role anon (tokens de convite não podem vazar para não autenticados)",
    sql: `
      SELECT p.policyname || ' (' || p.cmd || ')' AS finding
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename  = 'company_invites'
        AND p.roles && ARRAY['anon','public']::name[];
    `,
  },
  {
    id: "realtime_billing_unprotected",
    severity: "critical",
    description:
      "Tabelas financeiras publicadas em Realtime (invoices/subscriptions) sem RLS ou sem policy de SELECT restritiva",
    sql: `
      WITH targets(tbl) AS (VALUES ('invoices'), ('subscriptions'))
      SELECT t.tbl || ' (' ||
        CASE WHEN NOT COALESCE(pt.rowsecurity,false) THEN 'RLS desabilitado'
             WHEN NOT EXISTS (
               SELECT 1 FROM pg_policies p
               WHERE p.schemaname='public' AND p.tablename=t.tbl
                 AND p.cmd IN ('SELECT','ALL')
             ) THEN 'sem policy de SELECT'
             ELSE 'anon/public com SELECT'
        END || ')' AS finding
      FROM targets t
      LEFT JOIN pg_tables pt ON pt.schemaname='public' AND pt.tablename=t.tbl
      WHERE NOT COALESCE(pt.rowsecurity,false)
         OR NOT EXISTS (
              SELECT 1 FROM pg_policies p
              WHERE p.schemaname='public' AND p.tablename=t.tbl
                AND p.cmd IN ('SELECT','ALL')
            )
         OR EXISTS (
              SELECT 1 FROM pg_policies p
              WHERE p.schemaname='public' AND p.tablename=t.tbl
                AND p.cmd IN ('SELECT','ALL')
                AND p.roles && ARRAY['anon','public']::name[]
            );
    `,
  },
  {
    id: "function_search_path_mutable",
    severity: "warning",
    description:
      "SECURITY DEFINER sem `SET search_path` explícito (vulnerável a hijack de schema)",
    sql: `
      SELECT n.nspname || '.' || p.proname AS finding
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef = true
        AND NOT EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
          WHERE c LIKE 'search_path=%'
        );
    `,
  },
  {
    id: "associative_ownership_fallback",
    severity: "critical",
    description:
      "Tabela associativa `*_companies` com policy cujo predicado usa `user_id = auth.uid()` ou `user_owns_*` como autorização — vínculo empresarial deve exigir membership + módulo, nunca criador da entidade",
    sql: `
      SELECT p.tablename || '.' || p.policyname || ' (' || p.cmd || ')' AS finding
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename LIKE '%\\_companies' ESCAPE '\\'
        AND (
          COALESCE(p.qual, '')       ~* '(user_owns_[a-z_]+|user_id\\s*=\\s*auth\\.uid\\(\\))'
          OR COALESCE(p.with_check,'') ~* '(user_owns_[a-z_]+|user_id\\s*=\\s*auth\\.uid\\(\\))'
        );
    `,
  },
  {
    id: "associative_missing_company_check",
    severity: "critical",
    description:
      "Tabela associativa `*_companies` com policy de INSERT/DELETE/ALL que não referencia `company_id` no predicado (autorização por empresa ausente)",
    sql: `
      SELECT p.tablename || '.' || p.policyname || ' (' || p.cmd || ')' AS finding
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename LIKE '%\\_companies' ESCAPE '\\'
        AND p.cmd IN ('INSERT','DELETE','ALL','UPDATE')
        AND COALESCE(p.with_check, p.qual, '') !~ 'company_id';
    `,
  },
  {
    id: "app_hidden_screens_public_select",
    severity: "critical",
    description:
      "Regressão: `app_hidden_screens` exposta a anon/public (policy alcançável por anon ou GRANT direto para anon)",
    sql: `
      SELECT 'policy ' || policyname || ' (' || cmd || ' → ' || array_to_string(roles, ',') || ')' AS finding
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'app_hidden_screens'
        AND roles && ARRAY['anon','public']::name[]
      UNION ALL
      SELECT 'grant ' || privilege_type || ' → anon' AS finding
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = 'app_hidden_screens'
        AND grantee = 'anon';
    `,
  },
  {
    id: "dp_documentos_storage_member_read_bypass",
    severity: "critical",
    description:
      "Regressão: policy de leitura do bucket `dp-documentos` sem restrição a admin/owner, super admin ou o próprio colaborador dono do documento",
    sql: `
      SELECT policyname || ' (' || cmd || ')' AS finding
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND cmd IN ('SELECT','ALL')
        AND COALESCE(qual, 'true') ~ 'dp-documentos'
        AND NOT (
          COALESCE(qual, '') ~ 'is_company_admin_or_owner'
          AND COALESCE(qual, '') ~ 'is_super_admin'
        );
    `,
  },
];



function runQuery(sql) {
  const psqlArgs = ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
  if (dbUrl) psqlArgs.unshift(dbUrl);
  const res = spawnSync("psql", psqlArgs, { encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return res.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const startedAt = Date.now();
if (CI) {
  log(`${BOLD}${CYAN}━━━ Security Linter (CI mode) ━━━${RESET}`);
  log(`${DIM}target: ${dbUrl ? new URL(dbUrl).host : process.env.PGHOST}${RESET}`);
  log(`${DIM}checks: ${checks.length} | strict: ${STRICT}${RESET}\n`);
}

const report = [];
let critical = 0;
let warning = 0;

for (const check of checks) {
  const t0 = Date.now();
  let findings;
  try {
    findings = runQuery(check.sql);
  } catch (e) {
    err(`${RED}[security-lint] ${check.id} — query falhou${RESET}`);
    err(e.message);
    process.exit(2);
  }
  const took = Date.now() - t0;
  const status = findings.length === 0;
  if (CI) {
    const icon = status ? `${GREEN}✓${RESET}` : check.severity === "critical" ? `${RED}✗${RESET}` : `${YELLOW}⚠${RESET}`;
    log(
      `${icon} ${check.id.padEnd(40)} ${DIM}${check.severity.padEnd(8)}${took}ms${RESET}` +
        (status ? "" : ` ${DIM}(${findings.length} finding${findings.length > 1 ? "s" : ""})${RESET}`),
    );
  }
  if (!status) {
    if (check.severity === "critical") critical += findings.length;
    else warning += findings.length;
    report.push({ ...check, findings });
  }
}

const tookTotal = Date.now() - startedAt;

if (JSON_ONLY) {
  console.log(
    JSON.stringify(
      {
        ok: report.length === 0,
        critical,
        warning,
        took_ms: tookTotal,
        findings: report,
      },
      null,
      2,
    ),
  );
}

if (report.length === 0) {
  log(`\n${GREEN}${BOLD}✓ security-lint OK${RESET} ${DIM}(${tookTotal}ms)${RESET}`);
  process.exit(0);
}

if (!JSON_ONLY) {
  log(
    `\n${BOLD}Resumo:${RESET} ${RED}${critical} critical${RESET} · ${YELLOW}${warning} warning${RESET} ${DIM}(${tookTotal}ms)${RESET}`,
  );
  for (const r of report) {
    const color = r.severity === "critical" ? RED : YELLOW;
    log(`\n${color}${BOLD}● ${r.id}${RESET} ${DIM}[${r.severity}]${RESET}`);
    log(`  ${r.description}`);
    for (const f of r.findings) log(`    ${color}•${RESET} ${f}`);
  }
}

if (critical > 0) {
  err(
    `\n${RED}${BOLD}✗ Falha: ${critical} finding(s) crítico(s)${RESET}`,
  );
  process.exit(1);
}
if (STRICT && warning > 0) {
  err(
    `\n${YELLOW}${BOLD}✗ Falha (strict): ${warning} warning(s)${RESET}`,
  );
  process.exit(1);
}
log(
  `\n${YELLOW}⚠ ${warning} warning(s) — não bloqueante em modo CI${RESET}`,
);
process.exit(0);
