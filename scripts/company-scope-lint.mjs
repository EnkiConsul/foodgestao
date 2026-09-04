#!/usr/bin/env node
/**
 * Company scope lint — guarda automática de isolamento entre empresas.
 *
 * Duas frentes complementares:
 *
 *  A) Estática (sempre roda, sem banco):
 *     varre TODO o front-end (`src/`) e TODAS as edge functions
 *     (`supabase/functions/`) procurando leituras de tabelas multiempresa
 *     sem filtro de empresa (`company_id`, `applyFinancialScope`,
 *     `selectedCompanyId`, ...). Cada vazamento entre empresas observado
 *     veio exatamente daí.
 *
 *  B) Banco (roda quando SUPABASE_DB_URL/PG* estão disponíveis):
 *     confirma que as RLS policies não permitem bypass — RLS habilitada em
 *     toda tabela multiempresa, nenhuma policy com atalho "dono vê tudo"
 *     sem checagem de participação na empresa, e nenhum acesso anônimo.
 *
 * Flags:
 *   --json    Saída JSON pura.
 *   --ci      Logs verbosos; falha em findings críticos.
 *   --strict  Falha em qualquer finding (default fora de --ci).
 *
 * Sem credenciais de banco, a parte (B) é pulada com aviso — a parte (A)
 * continua valendo e bloqueando o CI.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const args = new Set(process.argv.slice(2));
const JSON_ONLY = args.has("--json");
const CI = args.has("--ci");
const STRICT = args.has("--strict") || (!CI && !JSON_ONLY);

const log = (m) => {
  if (!JSON_ONLY) console.log(m);
};
const warn = (m) => {
  if (!JSON_ONLY) console.warn(m);
};

/* ------------------------------------------------------------------ */
/* Configuração                                                        */
/* ------------------------------------------------------------------ */

/** Tabelas cujos registros pertencem a uma empresa específica. */
const TENANT_TABLES = [
  "accounts",
  "budgets",
  "categories",
  "categorization_rules",
  "contacts",
  "cost_centers",
  "credit_card_invoices",
  "credit_cards",
  "import_rules",
  "payment_methods",
  "pluggy_accounts",
  "pluggy_connections",
  "pluggy_staging_transactions",
  "pluggy_v2_accounts",
  "pluggy_v2_connections",
  "pluggy_v2_transactions_raw",
  "tags",
  "transaction_attachments",
  "transactions",
];

/** Marcadores que provam escopo por empresa na vizinhança da consulta. */
const SCOPE_MARKERS = [
  "company_id",
  "companyId",
  "applyFinancialScope",
  "assertFinancialScope",
  "selectedCompanyId",
  "scopeFilter",
];

/**
 * Exceções conscientes (caminho de arquivo → motivo). Só entram aqui
 * consultas que provadamente não podem vazar entre empresas: rotinas
 * administrativas com service role e escopo próprio, jobs de cron que
 * varrem todas as empresas por design, e utilitários de teste.
 */
const ALLOWLIST = new Map([
  ["supabase/functions/admin-reset-data/index.ts", "reset administrativo de um usuário (service role)"],
  ["supabase/functions/delete-user-account/index.ts", "exclusão total da conta do próprio usuário"],
  ["supabase/functions/export-user-data/index.ts", "exportação LGPD dos dados do próprio usuário"],
  ["supabase/functions/close-credit-card-invoices/index.ts", "cron: fecha faturas de todas as empresas"],
  ["supabase/functions/pluggy-cron-sync/index.ts", "cron: sincroniza itens de todas as empresas"],
  ["supabase/functions/pluggy-webhook-worker/index.ts", "worker: resolve empresa a partir do item do provedor"],
  ["supabase/functions/pluggy-reconcile-items/index.ts", "job de reconciliação global de itens"],
  ["supabase/functions/pluggy-admin-find-items/index.ts", "diagnóstico administrativo"],
]);

const ROOTS = ["src", "supabase/functions"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "__snapshots__"]);
const CODE_EXT = /\.(ts|tsx)$/;

/* ------------------------------------------------------------------ */
/* (A) Varredura estática                                              */
/* ------------------------------------------------------------------ */

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (CODE_EXT.test(entry)) out.push(full);
  }
  return out;
}

function scanFile(file) {
  const rel = relative(process.cwd(), file).replace(/\\/g, "/");
  if (ALLOWLIST.has(rel)) return [];
  if (rel.startsWith("src/test/")) return [];

  const source = readFileSync(file, "utf8");
  const findings = [];

  for (const table of TENANT_TABLES) {
    for (const quote of ['"', "'", "`"]) {
      const needle = `.from(${quote}${table}${quote})`;
      let idx = source.indexOf(needle);
      while (idx !== -1) {
        const before = source.slice(Math.max(0, idx - 700), idx);
        const rest = source.slice(idx + needle.length, idx + needle.length + 1400);
        const after = rest.split(".from(")[0];
        const window = `${before}${after}`;

        const isRead =
          /\.select\(/.test(after) && !/\.(insert|upsert|update|delete)\(/.test(after);
        const scoped = SCOPE_MARKERS.some((m) => window.includes(m));

        if (isRead && !scoped) {
          const line = source.slice(0, idx).split("\n").length;
          findings.push({
            file: rel,
            line,
            table,
            snippet: after.replace(/\s+/g, " ").trim().slice(0, 140),
          });
        }
        idx = source.indexOf(needle, idx + needle.length);
      }
    }
  }
  return findings;
}

function runStatic() {
  const files = ROOTS.flatMap((r) => walk(join(process.cwd(), r)));
  const findings = files.flatMap(scanFile);
  return {
    id: "unscoped_tenant_reads",
    severity: "critical",
    description:
      "Leitura de tabela multiempresa sem filtro de empresa (company_id / applyFinancialScope)",
    scanned: files.length,
    findings: findings.map((f) => `${f.file}:${f.line} → ${f.table} :: ${f.snippet}`),
  };
}

/* ------------------------------------------------------------------ */
/* (B) Checagens de RLS no banco                                       */
/* ------------------------------------------------------------------ */

const TABLE_LIST_SQL = TENANT_TABLES.map((t) => `'${t}'`).join(",");

const DB_CHECKS = [
  {
    id: "tenant_table_rls_disabled",
    severity: "critical",
    description: "Tabela multiempresa sem RLS habilitada (toda linha exposta pela Data API)",
    sql: `
      SELECT c.relname AS finding
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (${TABLE_LIST_SQL})
        AND c.relkind = 'r'
        AND NOT c.relrowsecurity;
    `,
  },
  {
    id: "tenant_table_without_policies",
    severity: "critical",
    description: "Tabela multiempresa com RLS habilitada e nenhuma policy (acesso quebrado ou aberto por GRANT)",
    sql: `
      SELECT c.relname AS finding
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (${TABLE_LIST_SQL})
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname
        );
    `,
  },
  {
    id: "tenant_owner_bypass",
    severity: "critical",
    description:
      "Policy de leitura em tabela multiempresa que autoriza pelo dono (`user_id = auth.uid()`) sem exigir participação na empresa — permite ver registros de outra empresa do mesmo dono",
    sql: `
      SELECT tablename || ' :: ' || policyname || ' (' || cmd || ')' AS finding
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (${TABLE_LIST_SQL})
        AND cmd IN ('SELECT','ALL')
        AND COALESCE(qual, '') ~ 'user_id\\s*=\\s*auth\\.uid\\(\\)'
        AND COALESCE(qual, '') !~ 'company'
        AND COALESCE(qual, '') !~ 'is_company_member';
    `,
  },
  {
    id: "tenant_policy_open_to_anon",
    severity: "critical",
    description: "Policy de tabela multiempresa concedida a `anon`/`public`",
    sql: `
      SELECT tablename || ' :: ' || policyname || ' (' || cmd || ' → ' || array_to_string(roles, ',') || ')' AS finding
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (${TABLE_LIST_SQL})
        AND roles && ARRAY['anon','public']::name[];
    `,
  },
  {
    id: "tenant_grant_to_anon",
    severity: "critical",
    description: "GRANT de leitura para `anon` em tabela multiempresa",
    sql: `
      SELECT table_name || ' :: ' || privilege_type AS finding
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee = 'anon'
        AND table_name IN (${TABLE_LIST_SQL});
    `,
  },
  {
    id: "tenant_policy_always_true",
    severity: "critical",
    description: "Policy de tabela multiempresa com USING/WITH CHECK igual a `true`",
    sql: `
      SELECT tablename || ' :: ' || policyname || ' (' || cmd || ')' AS finding
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (${TABLE_LIST_SQL})
        AND (
          COALESCE(qual, '') IN ('true','(true)')
          OR COALESCE(with_check, '') IN ('true','(true)')
        );
    `,
  },
  {
    id: "tenant_table_missing_company_column",
    severity: "warning",
    description:
      "Tabela multiempresa sem coluna `company_id` nem tabela associativa `*_companies` (escopo depende só de joins)",
    sql: `
      WITH t(name) AS (VALUES ${TENANT_TABLES.map((x) => `('${x}')`).join(",")})
      SELECT t.name AS finding
      FROM t
      WHERE NOT EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = 'public' AND c.table_name = t.name AND c.column_name = 'company_id'
            )
        AND NOT EXISTS (
              SELECT 1 FROM information_schema.tables x
              WHERE x.table_schema = 'public'
                AND x.table_name = regexp_replace(t.name, 's$', '') || '_companies'
            );
    `,
  },
];

function psql(sql) {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const argv = ["-X", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-c", sql];
  if (dbUrl) argv.unshift(dbUrl);
  const res = spawnSync("psql", argv, { encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr?.trim() || "psql failed");
  return res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function runDbChecks() {
  const hasPsql = spawnSync("which", ["psql"], { encoding: "utf8" }).status === 0;
  if (!hasPsql) return { skipped: "psql não encontrado no PATH" };
  if (!process.env.SUPABASE_DB_URL && !process.env.PGHOST)
    return { skipped: "sem SUPABASE_DB_URL / PG*" };

  const results = [];
  for (const check of DB_CHECKS) {
    try {
      results.push({ ...check, findings: psql(check.sql) });
    } catch (e) {
      results.push({ ...check, severity: "warning", findings: [`erro na consulta: ${e.message}`] });
    }
  }
  return { results };
}

/* ------------------------------------------------------------------ */
/* Execução                                                           */
/* ------------------------------------------------------------------ */

const staticResult = runStatic();
const db = runDbChecks();
const results = [staticResult, ...(db.results ?? [])];

const critical = results.filter((r) => r.severity === "critical" && r.findings.length);
const warnings = results.filter((r) => r.severity === "warning" && r.findings.length);

if (JSON_ONLY) {
  console.log(
    JSON.stringify(
      {
        scanned_files: staticResult.scanned,
        db_skipped: db.skipped ?? null,
        critical: critical.length,
        warnings: warnings.length,
        results: results.map(({ id, severity, description, findings }) => ({
          id,
          severity,
          description,
          findings,
        })),
      },
      null,
      2,
    ),
  );
} else {
  log(`${BOLD}${CYAN}[company-scope-lint]${RESET} isolamento entre empresas`);
  log(`${DIM}arquivos varridos: ${staticResult.scanned}${RESET}`);
  if (db.skipped) warn(`${YELLOW}checagens de RLS puladas: ${db.skipped}${RESET}`);

  for (const r of results) {
    const ok = r.findings.length === 0;
    const tag = ok ? `${GREEN}ok${RESET}` : r.severity === "critical" ? `${RED}CRÍTICO${RESET}` : `${YELLOW}aviso${RESET}`;
    log(`  ${tag}  ${r.id} ${DIM}— ${r.description}${RESET}`);
    for (const f of r.findings) log(`        ${r.severity === "critical" ? RED : YELLOW}• ${f}${RESET}`);
  }
}

if (critical.length) {
  if (!JSON_ONLY)
    console.error(
      `${RED}${BOLD}[company-scope-lint] ${critical.length} verificação(ões) crítica(s) de isolamento falharam.${RESET}`,
    );
  process.exit(1);
}
if (warnings.length && STRICT) {
  if (!JSON_ONLY)
    console.error(`${YELLOW}[company-scope-lint] avisos presentes e modo estrito ativo.${RESET}`);
  process.exit(1);
}
if (!JSON_ONLY) log(`${GREEN}[company-scope-lint] isolamento entre empresas ok.${RESET}`);
