#!/usr/bin/env node
/**
 * Verificação de migrations antes do release:
 *  1. Nomes em ordem cronológica e sem timestamps duplicados.
 *  2. Todo CREATE TABLE em public tem GRANT + ENABLE ROW LEVEL SECURITY.
 *  3. Sem statements proibidos (ALTER DATABASE, INSERT/UPDATE em storage.buckets).
 *  4. Com SUPABASE_DB_URL + CLI: `supabase db push --dry-run` (nenhuma migration pendente).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const DIR = "supabase/migrations";
if (!existsSync(DIR)) {
  console.log(`${YELLOW}⚠ ${DIR} não existe.${RESET}`);
  process.exit(0);
}

// Baseline: migrations anteriores a este timestamp são históricas e ficam fora
// das regras 2 e 3 (GRANT/RLS/statements proibidos). Toda migration NOVA precisa
// passar. Ajuste apenas para cima, nunca para trás.
const BASELINE = process.env.MIGRATIONS_BASELINE || "20260828000000";

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
console.log(`${CYAN}▶ analisando ${files.length} migrations${RESET}`);

const errors = [];
const warnings = [];
const seen = new Map();

for (const file of files) {
  const stamp = file.slice(0, 14);
  if (!/^\d{14}$/.test(stamp)) {
    errors.push(`${file}: nome não começa com timestamp de 14 dígitos`);
    continue;
  }
  if (seen.has(stamp)) warnings.push(`${file}: timestamp duplicado com ${seen.get(stamp)}`);
  seen.set(stamp, file);

  const sql = readFileSync(`${DIR}/${file}`, "utf8");
  const lower = sql.toLowerCase();

  const legacy = stamp < BASELINE;
  if (legacy) continue;

  if (/alter\s+database\s+postgres/i.test(sql)) {
    errors.push(`${file}: ALTER DATABASE postgres é proibido`);
  }
  if (/(insert\s+into|update)\s+storage\.buckets/i.test(sql)) {
    errors.push(`${file}: alterar storage.buckets em migration é proibido`);
  }

  const created = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)]
    .map((m) => m[1].toLowerCase());
  for (const table of created) {
    const hasGrant = new RegExp(`grant[\\s\\S]{0,200}public\\.${table}\\b`, "i").test(sql);
    const hasRls = new RegExp(`alter\\s+table[\\s\\S]{0,80}public\\.${table}[\\s\\S]{0,80}enable\\s+row\\s+level\\s+security`, "i")
      .test(lower);
    if (!hasGrant) errors.push(`${file}: public.${table} criada sem GRANT`);
    if (!hasRls) errors.push(`${file}: public.${table} criada sem ENABLE ROW LEVEL SECURITY`);
  }
}

for (const w of warnings) console.warn(`${YELLOW}⚠ ${w}${RESET}`);
for (const e of errors) console.error(`${RED}✗ ${e}${RESET}`);

if (errors.length) {
  console.error(`${RED}✗ verificação estática de migrations reprovada (${errors.length})${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓ verificação estática de migrations aprovada${RESET}`);

const hasCli = spawnSync("supabase", ["--version"], { encoding: "utf8" }).status === 0;
if (!hasCli || !process.env.SUPABASE_DB_URL) {
  console.log(
    `${YELLOW}⚠ dry-run ignorado (${!hasCli ? "supabase CLI ausente" : "SUPABASE_DB_URL ausente"}).${RESET}`,
  );
  process.exit(0);
}

console.log(`${CYAN}▶ supabase db push --dry-run${RESET}`);
const push = spawnSync(
  "supabase",
  ["db", "push", "--dry-run", "--db-url", process.env.SUPABASE_DB_URL],
  { encoding: "utf8" },
);
const out = `${push.stdout ?? ""}${push.stderr ?? ""}`;
console.log(out.trim());
if (push.status !== 0) {
  console.error(`${RED}✗ dry-run de migrations falhou${RESET}`);
  process.exit(1);
}
if (/would push|pending migration/i.test(out)) {
  console.error(`${RED}✗ há migrations não aplicadas no banco alvo — aplique antes de liberar${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓ migrations em sincronia com o banco alvo${RESET}`);
