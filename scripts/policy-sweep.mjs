#!/usr/bin/env node
/**
 * Policy sweep — auditoria em massa das policies RLS do schema `public`.
 *
 * Complementa `security-lint.mjs` com verificações amplas usadas antes de
 * promover mudanças para produção (gate de staging).
 *
 * Flags:
 *   --json    Saída JSON pura, sem cores.
 *   --strict  Falha em qualquer finding (default em CI).
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
const JSON_ONLY = args.has("--json");
const STRICT = args.has("--strict") || !!process.env.CI;

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
  warn(`${YELLOW}[policy-sweep] skipped: ${reason}${RESET}`);
  if (JSON_ONLY) console.log(JSON.stringify({ skipped: true, reason }));
  process.exit(0);
}

const which = spawnSync("which", ["psql"], { encoding: "utf8" });
if (which.status !== 0) skip("psql not found on PATH");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl && !process.env.PGHOST) skip("no SUPABASE_DB_URL / PG* env vars");

/**
 * Cada check retorna linhas descritivas em `finding` (uma por violação).
 */
const checks = [
  {
    id: "public_permissive_anon_policies",
    severity: "critical",
    description:
      "Policies em `public` que concedem qualquer comando ao role `anon` ou `public` sem cláusula restritiva",
    sql: `
      SELECT tablename || ' :: ' || policyname || ' (' || cmd || ' → ' || array_to_string(roles, ',') || ')' AS finding
      FROM pg_policies
      WHERE schemaname = 'public'
        AND roles && ARRAY['anon','public']::name[]
        AND COALESCE(qual, 'true')       IN ('true','(true)')
        AND COALESCE(with_check, 'true') IN ('true','(true)');
    `,
  },
  {
    id: "policies_true_condition",
    severity: "warning",
    description:
      "Policies com USING/WITH CHECK == `true` (aberto para todos os roles listados) — revisar necessidade",
    sql: `
      SELECT tablename || ' :: ' || policyname || ' (' || cmd || ')' AS finding
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          COALESCE(qual, '')       IN ('true','(true)')
          OR COALESCE(with_check,'') IN ('true','(true)')
        );
    `,
  },
  {
    id: "write_policy_without_check",
    severity: "critical",
    description:
      "Policies de INSERT/UPDATE em `public` sem WITH CHECK definido (aceita qualquer payload)",
    sql: `
      SELECT tablename || ' :: ' || policyname || ' (' || cmd || ')' AS finding
      FROM pg_policies
      WHERE schemaname = 'public'
        AND cmd IN ('INSERT','UPDATE','ALL')
        AND with_check IS NULL;
    `,
  },
  {
    id: "sensitive_table_anon_readable",
    severity: "critical",
    description:
      "Tabelas sensíveis (financeiro/PII) com policy SELECT alcançável por anon/public",
    sql: `
      WITH sensitive(tbl) AS (VALUES
        ('invoices'),('subscriptions'),('transactions'),('accounts'),
        ('company_invites'),('user_roles'),('profiles'),('audit_logs'),
        ('legal_acceptances'),('email_send_log'),('coupons'),('coupon_redemptions')
      )
      SELECT p.tablename || ' :: ' || p.policyname AS finding
      FROM pg_policies p
      JOIN sensitive s ON s.tbl = p.tablename
      WHERE p.schemaname = 'public'
        AND p.cmd IN ('SELECT','ALL')
        AND p.roles && ARRAY['anon','public']::name[];
    `,
  },
  {
    id: "table_grants_missing_authenticated",
    severity: "warning",
    description:
      "Tabelas em `public` com RLS + policies para `authenticated` mas sem GRANT correspondente (queries falharão com permission denied)",
    sql: `
      WITH policied AS (
        SELECT DISTINCT p.tablename
        FROM pg_policies p
        WHERE p.schemaname='public' AND p.roles && ARRAY['authenticated']::name[]
      )
      SELECT p.tablename AS finding
      FROM policied p
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants g
        WHERE g.table_schema='public'
          AND g.table_name = p.tablename
          AND g.grantee = 'authenticated'
      );
    `,
  },
  {
    id: "table_grants_leaked_to_anon",
    severity: "critical",
    description:
      "Tabelas em `public` com GRANT direto para `anon` (bypassa filtragem por role nas policies)",
    sql: `
      SELECT g.table_name || ' (' || string_agg(DISTINCT g.privilege_type, ',') || ')' AS finding
      FROM information_schema.role_table_grants g
      WHERE g.table_schema='public'
        AND g.grantee='anon'
      GROUP BY g.table_name;
    `,
    allowlist: new Set([]), // adicione nomes de tabelas realmente públicas aqui
  },
  {
    id: "duplicate_policies_same_cmd",
    severity: "warning",
    description:
      "Policies duplicadas (mesma tabela + comando + role) que podem se sobrepor de forma inesperada",
    sql: `
      SELECT tablename || ' (' || cmd || ' → ' || array_to_string(roles, ',') || ') x' || count(*) AS finding
      FROM pg_policies
      WHERE schemaname='public'
      GROUP BY tablename, cmd, roles
      HAVING count(*) > 1;
    `,
  },
  {
    id: "security_definer_without_search_path",
    severity: "critical",
    description:
      "Funções SECURITY DEFINER em `public` sem `SET search_path` explícito (schema hijack)",
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
    id: "realtime_publication_sensitive",
    severity: "warning",
    description:
      "Tabelas sensíveis publicadas em `supabase_realtime` — confirme que RLS bloqueia leitura cruzada",
    sql: `
      SELECT schemaname || '.' || tablename AS finding
      FROM pg_publication_tables
      WHERE pubname='supabase_realtime'
        AND schemaname='public'
        AND tablename IN (
          'invoices','subscriptions','transactions','accounts',
          'company_invites','user_roles','profiles','audit_logs'
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_tables t
          WHERE t.schemaname='public' AND t.tablename = pg_publication_tables.tablename
            AND t.rowsecurity = true
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
log(`${BOLD}${CYAN}━━━ Policy Sweep (staging gate) ━━━${RESET}`);
log(`${DIM}target: ${dbUrl ? new URL(dbUrl).host : process.env.PGHOST}${RESET}`);
log(`${DIM}checks: ${checks.length} | strict: ${STRICT}${RESET}\n`);

const report = [];
let critical = 0;
let warning = 0;

for (const check of checks) {
  const t0 = Date.now();
  let findings;
  try {
    findings = runQuery(check.sql);
  } catch (e) {
    err(`${RED}[policy-sweep] ${check.id} — query falhou${RESET}`);
    err(e.message);
    process.exit(2);
  }
  if (check.allowlist) {
    findings = findings.filter((f) => {
      const name = f.split(" ")[0];
      return !check.allowlist.has(name);
    });
  }
  const took = Date.now() - t0;
  const ok = findings.length === 0;
  const icon = ok
    ? `${GREEN}✓${RESET}`
    : check.severity === "critical"
      ? `${RED}✗${RESET}`
      : `${YELLOW}⚠${RESET}`;
  log(
    `${icon} ${check.id.padEnd(40)} ${DIM}${check.severity.padEnd(8)}${took}ms${RESET}` +
      (ok ? "" : ` ${DIM}(${findings.length} finding${findings.length > 1 ? "s" : ""})${RESET}`),
  );
  if (!ok) {
    if (check.severity === "critical") critical += findings.length;
    else warning += findings.length;
    report.push({ ...check, findings });
  }
}

const tookTotal = Date.now() - startedAt;

if (JSON_ONLY) {
  console.log(
    JSON.stringify(
      { ok: report.length === 0, critical, warning, took_ms: tookTotal, findings: report },
      null,
      2,
    ),
  );
}

if (report.length === 0) {
  log(`\n${GREEN}${BOLD}✓ policy-sweep OK${RESET} ${DIM}(${tookTotal}ms)${RESET}`);
  process.exit(0);
}

log(
  `\n${BOLD}Resumo:${RESET} ${RED}${critical} critical${RESET} · ${YELLOW}${warning} warning${RESET} ${DIM}(${tookTotal}ms)${RESET}`,
);
for (const r of report) {
  const color = r.severity === "critical" ? RED : YELLOW;
  log(`\n${color}${BOLD}● ${r.id}${RESET} ${DIM}[${r.severity}]${RESET}`);
  log(`  ${r.description}`);
  for (const f of r.findings) log(`    ${color}•${RESET} ${f}`);
}

if (critical > 0) {
  err(`\n${RED}${BOLD}✗ Falha: ${critical} finding(s) crítico(s)${RESET}`);
  process.exit(1);
}
if (STRICT && warning > 0) {
  err(`\n${YELLOW}${BOLD}✗ Falha (strict): ${warning} warning(s)${RESET}`);
  process.exit(1);
}
log(`\n${YELLOW}⚠ ${warning} warning(s) — não bloqueante${RESET}`);
process.exit(0);
