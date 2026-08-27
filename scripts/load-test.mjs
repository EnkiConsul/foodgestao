#!/usr/bin/env node
/**
 * Teste de carga ponta a ponta (API pública do backend + RPCs).
 *
 * Mede latência (p50/p90/p95/p99), throughput (req/s) e taxa de erro por
 * cenário, simulando VUs (usuários virtuais) concorrentes durante uma janela
 * de tempo. Só executa leitura — nenhum cenário escreve no banco.
 *
 * Uso:
 *   node scripts/load-test.mjs --vus=20 --duration=30 [--require] [--scenario=nome]
 *
 * Credenciais (nenhuma é impressa):
 *   LOAD_TEST_ACCESS_TOKEN  token de acesso já emitido, ou
 *   ~/.cache/lovable-auth/session.json (lovable auth-session --json), ou
 *   TEST_USER + TEST_PASS   login por e-mail/senha
 *
 * Saída: reports/load-test.json
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ARGS = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const REQUIRE = ARGS.has("require");
const VUS = Math.max(1, Number(ARGS.get("vus") ?? 20));
const DURATION_S = Math.max(1, Number(ARGS.get("duration") ?? 30));
const ONLY = ARGS.get("scenario") ?? null;
const REPORT_PATH = ARGS.get("report") ?? "reports/load-test.json";

/** Limites que reprovam o teste (p95 em ms por cenário e erro global). */
const THRESHOLDS = {
  p95_ms: Number(ARGS.get("p95") ?? 1500),
  error_rate: Number(ARGS.get("max-error-rate") ?? 0.01),
};

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const dotenv = readEnvFile(path.resolve(".env"));
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || dotenv.VITE_SUPABASE_URL;
const ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || dotenv.VITE_SUPABASE_PUBLISHABLE_KEY;

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(REQUIRE ? 1 : 0);
}

if (!SUPABASE_URL || !ANON_KEY) fail("VITE_SUPABASE_URL/PUBLISHABLE_KEY ausentes.");

/** Resolve o token de acesso sem nunca imprimi-lo. */
async function resolveAccessToken() {
  if (process.env.LOAD_TEST_ACCESS_TOKEN) return process.env.LOAD_TEST_ACCESS_TOKEN;

  const sessionFile = path.join(os.homedir(), ".cache/lovable-auth/session.json");
  if (fs.existsSync(sessionFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
      const token = s.access_token || s.session?.access_token;
      if (token) return token;
    } catch {
      /* formato inesperado — segue para o login por senha */
    }
  }

  const email = process.env.TEST_USER;
  const password = process.env.TEST_PASS;
  if (!email || !password) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    await res.text();
    return null;
  }
  const body = await res.json();
  return body.access_token ?? null;
}

const ACCESS_TOKEN = await resolveAccessToken();
if (!ACCESS_TOKEN) {
  fail(
    "Sem credencial de teste. Defina LOAD_TEST_ACCESS_TOKEN, gere ~/.cache/lovable-auth/session.json ou defina TEST_USER/TEST_PASS."
  );
}

const HEADERS = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function rest(pathname, { method = "GET", body, prefer } = {}) {
  const started = performance.now();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    method,
    headers: prefer ? { ...HEADERS, Prefer: prefer } : HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { ms: performance.now() - started, ok: res.ok, status: res.status, text };
}

/* ------------------------------------------------------------------ */
/* Descoberta de contexto (empresa e período) — fora da medição       */
/* ------------------------------------------------------------------ */

const ctx = { companyId: null, from: null, to: null };
{
  const me = await rest("company_members?select=company_id&limit=1");
  if (!me.ok) fail(`Não foi possível ler company_members (HTTP ${me.status}).`);
  const rows = JSON.parse(me.text || "[]");
  ctx.companyId = rows[0]?.company_id ?? null;
  const now = new Date();
  ctx.from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  ctx.to = new Date(Date.UTC(now.getUTCFullYear(), 11, 31)).toISOString().slice(0, 10);
}
if (!ctx.companyId) fail("Usuário de teste não pertence a nenhuma empresa.");

const companyFilter = `company_id=eq.${ctx.companyId}`;

/* ------------------------------------------------------------------ */
/* Cenários (somente leitura)                                         */
/* ------------------------------------------------------------------ */

const SCENARIOS = [
  {
    name: "dashboard_saldos",
    weight: 3,
    run: () =>
      rest(
        `accounts?select=id,name,current_balance,bank_balance,is_active&${companyFilter}&is_active=eq.true&order=name`
      ),
  },
  {
    name: "lancamentos_pagina",
    weight: 4,
    run: () =>
      rest(
        `transactions?select=id,description,amount,amount_paid,status,due_date,transaction_date,transaction_type,category_id,account_id,contact_id&${companyFilter}&order=due_date.desc&limit=50`,
        { prefer: "count=exact" }
      ),
  },
  {
    name: "lancamentos_periodo",
    weight: 2,
    run: () =>
      rest(
        `transactions?select=id,amount,amount_paid,status,due_date,transaction_type,category_id&${companyFilter}&due_date=gte.${ctx.from}&due_date=lte.${ctx.to}&order=due_date.asc&limit=1000`
      ),
  },
  {
    name: "categorias_arvore",
    weight: 2,
    run: () =>
      rest(
        `categories?select=id,name,transaction_type,parent_id,sort_order,is_active,category_companies!inner(company_id)&category_companies.company_id=eq.${ctx.companyId}&order=parent_id.asc,sort_order.asc`
      ),
  },
  {
    name: "contatos_busca",
    weight: 2,
    run: () =>
      rest(
        `contacts?select=id,name,contact_type,document,contact_companies!inner(company_id)&contact_companies.company_id=eq.${ctx.companyId}&order=name.asc&limit=100`
      ),
  },
  {
    name: "rpc_plano_contas",
    weight: 1,
    run: () =>
      rest("rpc/chart_accounts_report", {
        method: "POST",
        body: {
          _company_id: ctx.companyId,
          _from: ctx.from,
          _to: ctx.to,
          _regime: "competencia",
          _include_zero: false,
        },
      }),
  },
  {
    name: "colaboradores_lista",
    weight: 2,
    run: () =>
      rest(
        `dp_colaboradores?select=id,nome,cargo_id,unidade_id,status,regime&${companyFilter}&order=nome.asc&limit=100`,
        { prefer: "count=exact" }
      ),
  },
  {
    name: "cartoes_faturas",
    weight: 1,
    run: () =>
      rest(
        `credit_card_invoices?select=id,credit_card_id,status,total_amount,due_date&${companyFilter}&order=due_date.desc&limit=50`
      ),
  },
].filter((s) => !ONLY || s.name === ONLY);

if (SCENARIOS.length === 0) fail(`Cenário desconhecido: ${ONLY}`);

/* ------------------------------------------------------------------ */
/* Execução                                                            */
/* ------------------------------------------------------------------ */

const pool = SCENARIOS.flatMap((s) => Array.from({ length: s.weight }, () => s));
const stats = new Map(
  SCENARIOS.map((s) => [s.name, { samples: [], errors: 0, statuses: {} }])
);

// Warm-up: uma execução de cada cenário fora da medição (cache/plan).
for (const s of SCENARIOS) {
  try {
    await s.run();
  } catch {
    /* medido durante o teste */
  }
}

const deadline = Date.now() + DURATION_S * 1000;
let completed = 0;

async function vu(seed) {
  let i = seed;
  while (Date.now() < deadline) {
    const scenario = pool[i++ % pool.length];
    const bucket = stats.get(scenario.name);
    try {
      const r = await scenario.run();
      bucket.samples.push(r.ms);
      bucket.statuses[r.status] = (bucket.statuses[r.status] ?? 0) + 1;
      if (!r.ok) bucket.errors++;
    } catch {
      bucket.errors++;
      bucket.statuses.network = (bucket.statuses.network ?? 0) + 1;
    }
    completed++;
  }
}

const startedAt = Date.now();
await Promise.all(Array.from({ length: VUS }, (_, i) => vu(i)));
const elapsedS = (Date.now() - startedAt) / 1000;

/* ------------------------------------------------------------------ */
/* Relatório                                                           */
/* ------------------------------------------------------------------ */

const pct = (arr, p) => {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(1));
};

const scenarioReport = SCENARIOS.map((s) => {
  const b = stats.get(s.name);
  const n = b.samples.length + b.errors;
  return {
    scenario: s.name,
    requests: n,
    errors: b.errors,
    error_rate: n ? Number((b.errors / n).toFixed(4)) : 0,
    rps: Number((n / elapsedS).toFixed(2)),
    p50_ms: pct(b.samples, 50),
    p90_ms: pct(b.samples, 90),
    p95_ms: pct(b.samples, 95),
    p99_ms: pct(b.samples, 99),
    max_ms: b.samples.length ? Number(Math.max(...b.samples).toFixed(1)) : null,
    statuses: b.statuses,
  };
});

const allSamples = scenarioReport.flatMap((r) => stats.get(r.scenario).samples);
const totalErrors = scenarioReport.reduce((a, r) => a + r.errors, 0);
const globalErrorRate = completed ? Number((totalErrors / completed).toFixed(4)) : 0;

const violations = [];
for (const r of scenarioReport) {
  if (r.p95_ms !== null && r.p95_ms > THRESHOLDS.p95_ms) {
    violations.push(`${r.scenario}: p95 ${r.p95_ms}ms > ${THRESHOLDS.p95_ms}ms`);
  }
  if (r.error_rate > THRESHOLDS.error_rate) {
    violations.push(`${r.scenario}: erro ${(r.error_rate * 100).toFixed(2)}% acima do limite`);
  }
}

const report = {
  generated_at: new Date().toISOString(),
  config: { vus: VUS, duration_s: DURATION_S, thresholds: THRESHOLDS },
  totals: {
    requests: completed,
    elapsed_s: Number(elapsedS.toFixed(2)),
    rps: Number((completed / elapsedS).toFixed(2)),
    errors: totalErrors,
    error_rate: globalErrorRate,
    p50_ms: pct(allSamples, 50),
    p95_ms: pct(allSamples, 95),
    p99_ms: pct(allSamples, 99),
  },
  scenarios: scenarioReport.sort((a, b) => (b.p95_ms ?? 0) - (a.p95_ms ?? 0)),
  violations,
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  `\nCarga: ${VUS} VUs por ${DURATION_S}s → ${report.totals.requests} req ` +
    `(${report.totals.rps} req/s), erro ${(globalErrorRate * 100).toFixed(2)}%, ` +
    `p95 global ${report.totals.p95_ms}ms\n`
);
console.log(
  ["cenário", "req", "rps", "p50", "p95", "p99", "max", "erros"].join("\t")
);
for (const r of report.scenarios) {
  console.log(
    [r.scenario, r.requests, r.rps, r.p50_ms, r.p95_ms, r.p99_ms, r.max_ms, r.errors].join("\t")
  );
}
console.log(`\nRelatório: ${REPORT_PATH}`);

if (violations.length > 0) {
  console.error("\n✖ Limites violados:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(REQUIRE ? 1 : 0);
}
console.log("\n✔ Todos os cenários dentro dos limites.");
