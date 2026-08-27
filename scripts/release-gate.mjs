#!/usr/bin/env node
/**
 * Release gate — executa localmente a mesma bateria obrigatória do workflow
 * .github/workflows/release-gate.yml.
 *
 * Uso:
 *   npm run release:gate              # roda tudo que houver credencial para rodar
 *   npm run release:gate -- --require # exige TODAS as etapas (modo gate oficial)
 *   npm run release:gate -- --only=typescript,tests
 *   npm run release:gate -- --skip=e2e,backup
 *
 * Em --require nenhuma etapa pode ser ignorada por falta de credencial:
 * qualquer etapa "skipped" reprova o gate.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const value = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const REQUIRE = flag("require");
const only = value("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const skip = new Set(value("skip")?.split(",").map((s) => s.trim()) ?? []);

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const env = process.env;
const has = (...keys) => keys.every((k) => !!env[k]);

const TENANCY_ENV = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_ANON_KEY",
  "TEST_USER_A_EMAIL",
  "TEST_USER_A_PASSWORD",
  "TEST_USER_B_EMAIL",
  "TEST_USER_B_PASSWORD",
  "TEST_USER_C_EMAIL",
  "TEST_USER_C_PASSWORD",
  "TEST_USER_D_EMAIL",
  "TEST_USER_D_PASSWORD",
  "TEST_COMPANY_1_ID",
  "TEST_COMPANY_2_ID",
];

/** @type {{id:string,label:string,cmd:string,args:string[],needs?:()=>string|null}[]} */
const STAGES = [
  {
    id: "typescript",
    label: "TypeScript strict (teto de erros)",
    cmd: "node",
    args: ["scripts/quality-ceilings.mjs", "typescript"],
  },
  {
    id: "lint",
    label: "ESLint (tetos de erros/warnings)",
    cmd: "node",
    args: ["scripts/quality-ceilings.mjs", "eslint"],
  },
  {
    id: "tests",
    label: "Vitest (unit + RLS)",
    cmd: "npm",
    args: ["test"],
  },
  {
    id: "tenancy",
    label: "Tenancy real (multiempresa contra banco de testes)",
    cmd: "npx",
    args: ["vitest", "run", "src/test/tenancy", "--reporter=verbose"],
    needs: () =>
      has(...TENANCY_ENV)
        ? null
        : `variáveis de tenancy ausentes: ${TENANCY_ENV.filter((k) => !env[k]).join(", ")}`,
  },
  {
    id: "security",
    label: "Security lint (strict)",
    cmd: "node",
    args: ["scripts/security-lint.mjs", "--ci", "--strict"],
    needs: () => (has("SUPABASE_DB_URL") ? null : "SUPABASE_DB_URL ausente"),
  },
  {
    id: "policy",
    label: "Policy sweep (RLS em massa)",
    cmd: "node",
    args: ["scripts/policy-sweep.mjs"],
    needs: () => (has("SUPABASE_DB_URL") ? null : "SUPABASE_DB_URL ausente"),
  },
  {
    id: "deno",
    label: "Deno check das edge functions",
    cmd: "node",
    args: ["scripts/deno-check.mjs"],
  },
  {
    id: "migrations",
    label: "Migrations aplicáveis (supabase db push --dry-run)",
    cmd: "node",
    args: ["scripts/migrations-check.mjs"],
  },
  {
    id: "functions-config",
    label: "Config das edge functions em sincronia (config.toml + baseline Deno)",
    cmd: "node",
    args: ["scripts/functions-config-check.mjs", "--require"],
  },
  {
    id: "cron",
    label: "Healthcheck dos agendamentos (falha, nunca executado ou atrasado)",
    cmd: "node",
    args: ["scripts/cron-healthcheck.mjs", ...(REQUIRE ? ["--require"] : [])],
    needs: () =>
      has("CRON_HEALTH_DB_URL") || has("SUPABASE_DB_URL")
        ? null
        : "CRON_HEALTH_DB_URL/SUPABASE_DB_URL ausente",
  },
  {
    id: "build",
    label: "Build de produção",
    cmd: "npx",
    args: ["vite", "build"],
  },
  {
    id: "e2e",
    label: "E2E Playwright",
    cmd: "node",
    args: ["scripts/run-e2e.mjs"],
  },
  {
    id: "backup",
    label: "Backup/restore drill",
    cmd: "node",
    args: ["scripts/backup-restore-drill.mjs", ...(REQUIRE ? ["--require"] : [])],
    needs: () =>
      has("RESTORE_DB_URL") ? null : "RESTORE_DB_URL ausente (banco descartável de restore)",
  },
  {
    id: "smoke",
    label: "Smoke test do checkout (staging)",
    cmd: "node",
    args: ["scripts/smoke-checkout.mjs", ...(REQUIRE ? ["--require"] : [])],
    needs: () =>
      has("SMOKE_BASE_URL", "SMOKE_SUPABASE_URL", "SMOKE_SUPABASE_ANON_KEY")
        ? null
        : "variáveis SMOKE_* ausentes",
  },
  {
    id: "load-db",
    label: "Carga no banco (latência das consultas + FKs sem índice)",
    cmd: "node",
    args: [
      "scripts/load-test-db.mjs",
      "--conns=10",
      "--rounds=20",
      ...(REQUIRE ? ["--require"] : []),
    ],
    needs: () =>
      has("PGHOST") || has("SUPABASE_DB_URL") ? null : "PGHOST/SUPABASE_DB_URL ausente",
  },
  {
    id: "load-api",
    label: "Carga ponta a ponta na API (latência, throughput, erro)",
    cmd: "node",
    args: [
      "scripts/load-test.mjs",
      "--vus=20",
      "--duration=30",
      ...(REQUIRE ? ["--require"] : []),
    ],
    needs: () =>
      has("LOAD_TEST_ACCESS_TOKEN") || has("TEST_USER", "TEST_PASS")
        ? null
        : "LOAD_TEST_ACCESS_TOKEN ou TEST_USER/TEST_PASS ausentes",
  },
];


const selected = STAGES.filter(
  (s) => (!only || only.includes(s.id)) && !skip.has(s.id),
);

const results = [];
for (const stage of selected) {
  const missing = stage.needs?.() ?? null;
  if (missing) {
    if (REQUIRE) {
      console.error(`\n${RED}✗ ${stage.label} — etapa obrigatória sem credencial: ${missing}${RESET}`);
      results.push({ id: stage.id, status: "failed", reason: missing });
      continue;
    }
    console.warn(`\n${YELLOW}⚠ ${stage.label} — ignorada (${missing})${RESET}`);
    results.push({ id: stage.id, status: "skipped", reason: missing });
    continue;
  }

  console.log(`\n${CYAN}${BOLD}▶ ${stage.label}${RESET} ${DIM}(${stage.cmd} ${stage.args.join(" ")})${RESET}`);
  const t0 = Date.now();
  const res = spawnSync(stage.cmd, stage.args, { stdio: "inherit", env });
  const ms = Date.now() - t0;
  if (res.status === 0) {
    console.log(`${GREEN}✓ ${stage.label}${RESET} (${ms}ms)`);
    results.push({ id: stage.id, status: "passed", ms });
  } else {
    console.error(`${RED}✗ ${stage.label} falhou (exit ${res.status})${RESET}`);
    results.push({ id: stage.id, status: "failed", ms, exit: res.status ?? 1 });
  }
}

const failed = results.filter((r) => r.status === "failed");
const skipped = results.filter((r) => r.status === "skipped");

console.log(`\n${BOLD}Resumo do release gate${RESET}`);
console.table(
  results.map((r) => ({
    etapa: r.id,
    status: r.status,
    ms: r.ms ?? "",
    motivo: r.reason ?? "",
  })),
);

try {
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/release-gate.json",
    JSON.stringify(
      { ranAt: new Date().toISOString(), requireMode: REQUIRE, results },
      null,
      2,
    ),
  );
} catch {
  /* relatório best-effort */
}

if (!existsSync(".lovable/release-freeze.json")) {
  console.log(`${DIM}Sem marcador de freeze — main liberada.${RESET}`);
}

if (failed.length) {
  console.error(
    `${RED}✗ Release gate REPROVADO — ${failed.length} etapa(s): ${failed.map((f) => f.id).join(", ")}${RESET}`,
  );
  process.exit(1);
}
if (skipped.length && REQUIRE) {
  console.error(`${RED}✗ Release gate REPROVADO — etapas ignoradas em modo --require${RESET}`);
  process.exit(1);
}
console.log(
  `${GREEN}✓ Release gate APROVADO${skipped.length ? ` (${skipped.length} etapa(s) ignorada(s))` : ""}${RESET}`,
);
