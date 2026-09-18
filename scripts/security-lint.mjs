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
 * Sem pré-requisitos: falha em --ci/--require; uso local avulso pode ignorar.
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
  process.exit(CI || args.has("--require") ? 1 : 0);
}

const which = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (which.status !== 0) skip("psql not found on PATH");

const dbUrl = process.env.SUPABASE_DB_URL;
const hasPgEnv = !!process.env.PGHOST;
if (!dbUrl && !hasPgEnv) skip("no SUPABASE_DB_URL / PG* env vars");

/**
 * Allowlist documentada (P0 — security hardening).
 *
 * Só entram aqui funções `SECURITY DEFINER` em `public` cuja execução por
 * `anon` é parte de um fluxo realmente anônimo do produto (login, recuperação
 * de acesso, landing/lead, webhook, consentimento/OAuth ou página legal) E que
 * validam entrada e autorização internamente.
 *
 * Regras para incluir uma função:
 *   1. O fluxo é acessível sem sessão por decisão de produto.
 *   2. A função não lê nem escreve dado financeiro de empresa.
 *   3. Tem `SET search_path` explícito e rate limit/validação própria.
 *   4. A justificativa fica registrada em docs/security/p0-security-hardening.md.
 *
 * Qualquer exposição nova fora desta lista continua sendo finding crítico.
 * Estado atual: nenhuma função pública é necessária (lista vazia por design).
 */
const ANON_SECURITY_DEFINER_ALLOWLIST = [
  // exemplo de formato: "public.minha_funcao_anonima(text)"
];

const allowlistSqlArray = ANON_SECURITY_DEFINER_ALLOWLIST.length
  ? `ARRAY[${ANON_SECURITY_DEFINER_ALLOWLIST.map((f) => `'${f.replace(/'/g, "''")}'`).join(",")}]`
  : `ARRAY[]::text[]`;

/** Tabelas financeiras que nunca podem ficar acessíveis a `anon`. */
const TABELAS_FINANCEIRAS = [
  "accounts",
  "transactions",
  "credit_cards",
  "credit_card_invoices",
  "pluggy_connections",
  "pluggy_accounts",
  "pluggy_v2_connections",
  "pluggy_v2_accounts",
  "pluggy_v2_sync_runs",
  "pluggy_v2_transactions_raw",
  "invoices",
  "subscriptions",
];

const financeirasSqlValues = TABELAS_FINANCEIRAS.map((t) => `('${t}')`).join(", ");

/**
 * P0.2-A — rotinas internas do domínio financeiro/Open Finance.
 * São helpers chamados apenas por outras rotinas SECURITY DEFINER, funções de
 * trigger, ou fluxos legados sem nenhuma chamada em `src/` e
 * `supabase/functions/`. Nenhuma delas pode voltar a ser executável por
 * authenticated/anon/PUBLIC — apenas service_role.
 * Ver docs/security/p0-2a-finance-functions-hardening.md
 */
const FINANCE_INTERNAL_FUNCTIONS = [
  "assign_transaction_to_invoice",
  "chart_account_next_code",
  "chart_accounts_seed_default",
  "recalc_credit_card_invoice_totals",
  "recompute_account_balance",
  "soft_delete_account",
  "report_balance_drift",
  "sync_of_account_balance",
  "create_and_link_open_finance_account",
  "link_open_finance_account",
  "ignore_open_finance_account",
  "ignore_open_finance_raw",
  "promote_open_finance_transactions",
  "open_finance_sync_health",
  "audit_pluggy_v2_raw_delete",
  "chart_account_autofill_code",
  "guard_of_current_balance",
  "guard_transaction_category_active",
  "learn_categorization_rule",
  "pluggy_sync_pause_on_account_toggle",
  "prevent_hard_delete_account_with_history",
  "seed_default_account_on_company",
  "tg_transactions_assign_cc_invoice",
];

const financeInternalSqlValues = FINANCE_INTERNAL_FUNCTIONS.map((f) => `('${f}')`).join(", ");

const checks = [
  {
    id: "0028_anon_security_definer",
    severity: "critical",
    description:
      "SECURITY DEFINER em `public` executável por anon/PUBLIC fora da allowlist documentada (escalada de privilégio para usuários não autenticados)",
    sql: `
      SELECT finding FROM (
        SELECT n.nspname || '.' || p.proname || '(' ||
               pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS finding
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        LEFT JOIN pg_roles r ON r.oid = a.grantee
        WHERE n.nspname = 'public' AND p.prosecdef = true
          AND a.privilege_type = 'EXECUTE'
          AND (a.grantee = 0 OR r.rolname = 'anon')
      ) s
      WHERE finding <> ALL (${allowlistSqlArray});
    `,
  },
  {
    id: "anon_grants_financeiro",
    severity: "critical",
    description:
      "Tabela financeira com privilégio concedido a `anon` (defesa em profundidade: RLS não pode ser a única barreira)",
    sql: `
      WITH targets(tbl) AS (VALUES ${financeirasSqlValues})
      SELECT t.tbl || ' (anon tem privilégio de tabela)' AS finding
      FROM targets t
      JOIN pg_class c ON c.relname = t.tbl
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE has_table_privilege('anon', c.oid, 'SELECT')
         OR has_table_privilege('anon', c.oid, 'INSERT')
         OR has_table_privilege('anon', c.oid, 'UPDATE')
         OR has_table_privilege('anon', c.oid, 'DELETE');
    `,
  },
  {
    id: "realtime_financeiro_anon",
    severity: "critical",
    description:
      "Tabela financeira publicada em Realtime sem RLS, sem policy restritiva ou com policy alcançável por anon/public",
    sql: `
      WITH targets(tbl) AS (VALUES ${financeirasSqlValues})
      SELECT pt.tablename || ' (' ||
        CASE WHEN NOT COALESCE(t2.rowsecurity, false) THEN 'RLS desabilitado'
             WHEN EXISTS (
               SELECT 1 FROM pg_policies p
               WHERE p.schemaname='public' AND p.tablename = pt.tablename
                 AND p.roles && ARRAY['anon','public']::name[]
             ) THEN 'policy alcançável por anon/public'
             ELSE 'sem policy de SELECT'
        END || ')' AS finding
      FROM pg_publication_tables pt
      JOIN targets t ON t.tbl = pt.tablename
      LEFT JOIN pg_tables t2 ON t2.schemaname='public' AND t2.tablename = pt.tablename
      WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public'
        AND (
          NOT COALESCE(t2.rowsecurity, false)
          OR NOT EXISTS (
            SELECT 1 FROM pg_policies p
            WHERE p.schemaname='public' AND p.tablename = pt.tablename
              AND p.cmd IN ('SELECT','ALL')
          )
          OR EXISTS (
            SELECT 1 FROM pg_policies p
            WHERE p.schemaname='public' AND p.tablename = pt.tablename
              AND p.roles && ARRAY['anon','public']::name[]
          )
        );
    `,
  },
  {
    id: "finance_internal_functions_authenticated",
    severity: "critical",
    description:
      "Rotina interna do financeiro/Open Finance (P0.2-A) executável por authenticated/anon/PUBLIC — deve ficar restrita a service_role",
    sql: `
      WITH targets(fname) AS (VALUES ${financeInternalSqlValues})
      SELECT p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS finding
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN targets t ON t.fname = p.proname
      WHERE n.nspname = 'public'
        AND (
          has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR has_function_privilege('anon', p.oid, 'EXECUTE')
        );
    `,
  },
  {
    id: "test_helpers_unguarded",
    severity: "critical",
    description:
      "Rotina de QA (`_e2e_*`/`_test_*`/`_assert_test_helper_allowed`) presente em `public` ou executável por anon/PUBLIC/authenticated — desde a P0.3 elas vivem no schema `qa`, fora do PostgREST, e só rodam por conexão direta/service_role",
    sql: `
      -- Allowlist P0.3: VAZIA por design. Nenhuma rotina de QA pode estar em
      -- \`public\` nem ser executável por sessão de usuário; o E2E usa conexão
      -- direta server-side (e2e/qa_admin.py). Qualquer exceção futura precisa de
      -- justificativa curta aqui e registro em
      -- docs/security/p0-3-qa-functions-private-schema.md.
      SELECT n.nspname || '.' || p.proname || '(' ||
             pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' ||
             CASE WHEN n.nspname = 'public' THEN ' [em schema exposto public]'
                  WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN ' [executável por anon]'
                  ELSE ' [executável por authenticated]' END AS finding
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE (p.proname LIKE E'\\\\_e2e\\\\_%' OR p.proname LIKE E'\\\\_test\\\\_%'
             OR p.proname = '_assert_test_helper_allowed')
        AND (
          n.nspname = 'public'
          OR has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        );
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
