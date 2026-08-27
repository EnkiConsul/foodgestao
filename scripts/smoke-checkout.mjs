#!/usr/bin/env node
/**
 * Smoke test do checkout (staging) — valida o caminho crítico de assinatura
 * sem criar cobranças reais por padrão.
 *
 * Uso:
 *   node scripts/smoke-checkout.mjs                 # skip-safe se faltar env
 *   node scripts/smoke-checkout.mjs --require       # falha se faltar env (release gate)
 *   node scripts/smoke-checkout.mjs --with-charge   # também gera cobrança PIX de teste
 *
 * Variáveis:
 *   SMOKE_BASE_URL         ex.: https://staging.gestor360food.com
 *   SMOKE_SUPABASE_URL     URL do backend de staging
 *   SMOKE_SUPABASE_ANON_KEY
 *   SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD  (necessários p/ --with-charge)
 *   SMOKE_PLAN_SLUG        default: primeiro plano ativo encontrado
 */
const args = new Set(process.argv.slice(2));
const REQUIRE = args.has("--require");
const WITH_CHARGE = args.has("--with-charge");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const BASE = process.env.SMOKE_BASE_URL;
const SB_URL = process.env.SMOKE_SUPABASE_URL;
const SB_KEY = process.env.SMOKE_SUPABASE_ANON_KEY;

if (!BASE || !SB_URL || !SB_KEY) {
  const msg =
    "SMOKE_BASE_URL / SMOKE_SUPABASE_URL / SMOKE_SUPABASE_ANON_KEY ausentes";
  if (REQUIRE) {
    console.error(`${RED}✗ ${msg}${RESET}`);
    process.exit(1);
  }
  console.warn(`${YELLOW}⚠ ${msg} — smoke test ignorado.${RESET}`);
  process.exit(0);
}

const results = [];
let failed = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail });
    console.log(`${GREEN}✓${RESET} ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failed++;
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(e.message ?? e) });
    console.error(`${RED}✗${RESET} ${name} — ${e.message ?? e}`);
  }
}

const rest = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${init.token ?? SB_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

const fn = (name, body, token) =>
  fetch(`${SB_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${token ?? SB_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

console.log(`${CYAN}▶ smoke checkout em ${BASE}${RESET}`);

let plan = null;
let accessToken = null;

await step("app responde na raiz", async () => {
  const res = await fetch(BASE, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (!/<div id="root"/.test(html)) throw new Error("HTML sem #root");
  return `HTTP ${res.status}`;
});

await step("plano ativo disponível na API", async () => {
  const slug = process.env.SMOKE_PLAN_SLUG;
  const query = slug
    ? `plans?select=id,slug,name,price_cents,trial_days&slug=eq.${encodeURIComponent(slug)}`
    : "plans?select=id,slug,name,price_cents,trial_days&order=price_cents.asc&limit=1";
  const res = await rest(query);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (!rows.length) throw new Error("nenhum plano retornado");
  plan = rows[0];
  return `${plan.slug} (${plan.price_cents} centavos)`;
});

await step("rota /checkout/:slug servida pelo SPA", async () => {
  const res = await fetch(`${BASE}/checkout/${plan?.slug ?? "teste"}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});

await step("validate-coupon rejeita cupom inexistente", async () => {
  const res = await fn("validate-coupon", {
    code: `SMOKE-${Date.now()}`,
    planId: plan?.id,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.valid !== false) throw new Error(`esperado valid=false, veio ${JSON.stringify(data)}`);
  return `reason=${data.reason ?? "not_found"}`;
});

await step("asaas-create-checkout exige autenticação", async () => {
  const res = await fn("asaas-create-checkout", { planId: plan?.id, paymentMethod: "PIX" });
  const body = await res.text();
  const denied = res.status === 401 || res.status === 403 || /unauthor|não autenticado/i.test(body);
  if (!denied) throw new Error(`anônimo não foi bloqueado (HTTP ${res.status})`);
  return `HTTP ${res.status}`;
});

if (WITH_CHARGE) {
  const email = process.env.SMOKE_USER_EMAIL;
  const password = process.env.SMOKE_USER_PASSWORD;
  if (!email || !password) {
    console.error(`${RED}✗ --with-charge exige SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD${RESET}`);
    failed++;
  } else {
    await step("login do usuário de smoke", async () => {
      const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      accessToken = data.access_token;
      if (!accessToken) throw new Error("sem access_token");
      return "sessão obtida";
    });

    await step("cobrança PIX de teste criada", async () => {
      const res = await fn(
        "asaas-create-checkout",
        {
          planId: plan?.id,
          paymentMethod: "PIX",
          holder: { cpfCnpj: "19100000000", phone: "11999999999" },
        },
        accessToken,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.invoiceId && !data.free) throw new Error("resposta sem invoiceId");
      return data.free ? "plano gratuito ativado" : `invoice ${data.invoiceId}`;
    });
  }
}

const report = { ranAt: new Date().toISOString(), base: BASE, withCharge: WITH_CHARGE, results };
try {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/smoke-checkout.json", JSON.stringify(report, null, 2));
} catch {
  /* relatório é best-effort */
}

if (failed > 0) {
  console.error(`${RED}✗ smoke checkout reprovado (${failed} falha(s))${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓ smoke checkout aprovado${RESET}`);
