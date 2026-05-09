#!/usr/bin/env node
/**
 * Custom security linter — runs the same checks the Supabase linter flags
 * and exits non-zero on findings.
 *
 * Requirements:
 *   - `psql` available on PATH
 *   - `SUPABASE_DB_URL` (or PG* env vars) pointing at the project DB
 *
 * If neither requirement is met the script exits 0 with a warning so the
 * build does not break in environments without DB access (e.g. Lovable's
 * managed build pipeline).
 *
 * Wire-up: see `prebuild` script in package.json.
 */
import { spawnSync } from "node:child_process";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function skip(reason) {
  console.warn(`${YELLOW}[security-lint] skipped: ${reason}${RESET}`);
  process.exit(0);
}

// Detect psql
const which = spawnSync("which", ["psql"], { encoding: "utf8" });
if (which.status !== 0) skip("psql not found on PATH");

const dbUrl = process.env.SUPABASE_DB_URL;
const hasPgEnv = !!process.env.PGHOST;
if (!dbUrl && !hasPgEnv) skip("no SUPABASE_DB_URL / PG* env vars");

// Lint queries — keep aligned with Supabase splinter rules we care about.
const checks = [
  {
    id: "0028_anon_security_definer",
    description:
      "SECURITY DEFINER function in `public` schema executable by anon/PUBLIC",
    sql: `
      SELECT n.nspname || '.' || p.proname || '(' ||
             pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS finding
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      LEFT JOIN pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND a.privilege_type = 'EXECUTE'
        AND (a.grantee = 0 OR r.rolname = 'anon');
    `,
  },
  {
    id: "0029_authenticated_security_definer",
    description:
      "SECURITY DEFINER function in `public` schema executable by authenticated",
    sql: `
      SELECT n.nspname || '.' || p.proname || '(' ||
             pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS finding
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND a.privilege_type = 'EXECUTE'
        AND r.rolname = 'authenticated';
    `,
  },
  {
    id: "rls_disabled",
    description: "Table in `public` schema with RLS disabled",
    sql: `
      SELECT schemaname || '.' || tablename AS finding
      FROM pg_tables
      WHERE schemaname = 'public' AND rowsecurity = false;
    `,
  },
  {
    id: "function_search_path_mutable",
    description:
      "SECURITY DEFINER function in `public` without an explicit search_path",
    sql: `
      SELECT n.nspname || '.' || p.proname AS finding
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
        AND NOT EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
          WHERE c LIKE 'search_path=%'
        );
    `,
  },
];

function runQuery(sql) {
  const args = ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql];
  if (dbUrl) args.unshift(dbUrl);
  const res = spawnSync("psql", args, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`psql failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

let total = 0;
const report = [];

for (const check of checks) {
  let findings;
  try {
    findings = runQuery(check.sql);
  } catch (err) {
    console.error(`${RED}[security-lint] ${check.id} query failed${RESET}`);
    console.error(err.message);
    process.exit(2);
  }
  if (findings.length) {
    total += findings.length;
    report.push({ ...check, findings });
  }
}

if (total === 0) {
  console.log(`${GREEN}[security-lint] OK — no findings${RESET}`);
  process.exit(0);
}

console.error(
  `${RED}[security-lint] ${total} finding(s) — failing build${RESET}`,
);
for (const r of report) {
  console.error(`\n${RED}✗ ${r.id}${RESET} — ${r.description}`);
  for (const f of r.findings) console.error(`    • ${f}`);
}
console.error(
  `\n${YELLOW}Fix these via a new SQL migration and re-run the build.${RESET}`,
);
process.exit(1);
