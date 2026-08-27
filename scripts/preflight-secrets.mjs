#!/usr/bin/env node
/**
 * Preflight de credenciais do release gate / certificação de produção.
 *
 * Reporta apenas PRESENTE/AUSENTE — nunca imprime valores.
 *
 * Uso:
 *   node scripts/preflight-secrets.mjs             # relatório
 *   node scripts/preflight-secrets.mjs --require   # falha se faltar obrigatório
 *   node scripts/preflight-secrets.mjs --json
 */
import { writeFileSync, mkdirSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const REQUIRE = args.has("--require");
const JSON_ONLY = args.has("--json");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** @type {{grupo:string,obrigatorio:boolean,vars:string[],para:string}[]} */
const GRUPOS = [
  {
    grupo: "staging-db",
    obrigatorio: true,
    para: "security lint, policy sweep e dry-run de migrations",
    vars: ["STAGING_SUPABASE_DB_URL"],
  },
  {
    grupo: "tenancy",
    obrigatorio: true,
    para: "suíte de tenancy real multiempresa (A/B/C na Empresa 1, D na Empresa 2)",
    vars: [
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
    ],
  },
  {
    grupo: "smoke-checkout",
    obrigatorio: true,
    para: "smoke do checkout em staging",
    vars: ["SMOKE_BASE_URL", "SMOKE_SUPABASE_URL", "SMOKE_SUPABASE_ANON_KEY"],
  },
  {
    grupo: "smoke-checkout-cobranca",
    obrigatorio: false,
    para: "smoke com cobrança PIX real (workflow_dispatch with_charge)",
    vars: ["SMOKE_USER_EMAIL", "SMOKE_USER_PASSWORD", "SMOKE_PLAN_SLUG"],
  },
  {
    grupo: "asaas-sandbox",
    obrigatorio: false,
    para: "scripts/smoke-asaas-sandbox.mjs",
    vars: ["ASAAS_SANDBOX_API_KEY", "ASAAS_SANDBOX_WEBHOOK_SECRET"],
  },
  {
    grupo: "pluggy-sandbox",
    obrigatorio: false,
    para: "scripts/smoke-pluggy-sandbox.mjs",
    vars: ["PLUGGY_SANDBOX_CLIENT_ID", "PLUGGY_SANDBOX_CLIENT_SECRET", "PLUGGY_WEBHOOK_SECRET"],
  },
  {
    grupo: "seed-staging",
    obrigatorio: false,
    para: "scripts/seed-staging.mjs (cria usuários e empresas de teste)",
    vars: ["STAGING_SUPABASE_URL", "STAGING_SERVICE_ROLE_KEY"],
  },
];

const presente = (name) => {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
};

const relatorio = GRUPOS.map((g) => {
  const faltando = g.vars.filter((v) => !presente(v));
  return {
    grupo: g.grupo,
    obrigatorio: g.obrigatorio,
    para: g.para,
    total: g.vars.length,
    presentes: g.vars.length - faltando.length,
    faltando,
    ok: faltando.length === 0,
  };
});

const bloqueantes = relatorio.filter((r) => r.obrigatorio && !r.ok);

mkdirSync("reports", { recursive: true });
writeFileSync(
  "reports/preflight-secrets.json",
  JSON.stringify({ generated_at: new Date().toISOString(), grupos: relatorio }, null, 2),
);

if (JSON_ONLY) {
  console.log(JSON.stringify({ grupos: relatorio, bloqueantes: bloqueantes.map((b) => b.grupo) }, null, 2));
} else {
  console.log(`${BOLD}${CYAN}Preflight de credenciais${RESET}`);
  for (const r of relatorio) {
    const tag = r.ok ? `${GREEN}✓${RESET}` : r.obrigatorio ? `${RED}✗${RESET}` : `${YELLOW}⚠${RESET}`;
    console.log(`${tag} ${r.grupo} ${DIM}(${r.presentes}/${r.total}) — ${r.para}${RESET}`);
    if (!r.ok) console.log(`    faltando: ${r.faltando.join(", ")}`);
  }
  console.log(`\n${DIM}Relatório: reports/preflight-secrets.json (sem valores de segredo)${RESET}`);
}

if (REQUIRE && bloqueantes.length > 0) {
  console.error(
    `${RED}✗ credenciais obrigatórias ausentes: ${bloqueantes.map((b) => b.grupo).join(", ")}${RESET}`,
  );
  process.exit(1);
}
process.exit(0);
