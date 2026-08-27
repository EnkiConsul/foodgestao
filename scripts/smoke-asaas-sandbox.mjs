#!/usr/bin/env node
/**
 * Smoke de certificação — Asaas SANDBOX.
 *
 * Valida o caminho de cobrança + inbox de webhook sem tocar em produção:
 *   1. chave sandbox válida (GET /myAccount)
 *   2. cria cliente de teste
 *   3. cria cobrança PIX de teste
 *   4. entrega o webhook no endpoint com segredo por HEADER (nunca query string)
 *   5. confere que o evento foi enfileirado e processado, sem dead letter
 *
 * Variáveis:
 *   ASAAS_SANDBOX_API_KEY         chave sandbox ($aact_hmlg_...)
 *   ASAAS_SANDBOX_WEBHOOK_SECRET  segredo esperado pelo endpoint asaas-webhook
 *   SMOKE_SUPABASE_URL            backend de staging
 *   SMOKE_SUPABASE_ANON_KEY
 *   ASAAS_SANDBOX_API_URL         default https://sandbox.asaas.com/api/v3
 *   SMOKE_SERVICE_ROLE_KEY        (staging) necessário para ler o inbox de webhooks
 *
 * Nunca aponte este script para produção.
 */
import { writeFileSync, mkdirSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const REQUIRE = args.has("--require");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const API_KEY = process.env.ASAAS_SANDBOX_API_KEY;
const WEBHOOK_SECRET = process.env.ASAAS_SANDBOX_WEBHOOK_SECRET;
const SB_URL = process.env.SMOKE_SUPABASE_URL;
const SB_KEY = process.env.SMOKE_SUPABASE_ANON_KEY;
const API_URL = process.env.ASAAS_SANDBOX_API_URL ?? "https://sandbox.asaas.com/api/v3";

const faltando = [
  ["ASAAS_SANDBOX_API_KEY", API_KEY],
  ["ASAAS_SANDBOX_WEBHOOK_SECRET", WEBHOOK_SECRET],
  ["SMOKE_SUPABASE_URL", SB_URL],
  ["SMOKE_SUPABASE_ANON_KEY", SB_KEY],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (faltando.length) {
  const msg = `credenciais de sandbox ausentes: ${faltando.join(", ")}`;
  if (REQUIRE) {
    console.error(`${RED}✗ ${msg}${RESET}`);
    process.exit(1);
  }
  console.warn(`${YELLOW}⚠ ${msg} — smoke Asaas sandbox ignorado.${RESET}`);
  process.exit(0);
}

if (!API_URL.includes("sandbox")) {
  console.error(`${RED}✗ ASAAS_SANDBOX_API_URL precisa apontar para o sandbox.${RESET}`);
  process.exit(1);
}

const results = [];
let failed = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail: detail ?? null });
    console.log(`${GREEN}✓${RESET} ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failed++;
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(e?.message ?? e) });
    console.error(`${RED}✗${RESET} ${name} — ${e?.message ?? e}`);
  }
}

const asaas = async (path, init = {}) => {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      access_token: API_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : {};
};

// Leitura do inbox exige papel administrativo (RLS: só super admin).
const ADMIN_KEY = process.env.SMOKE_SERVICE_ROLE_KEY ?? null;
const rest = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ADMIN_KEY ?? SB_KEY,
      Authorization: `Bearer ${ADMIN_KEY ?? SB_KEY}`,
      ...(init.headers ?? {}),
    },
  });

const stamp = Date.now();
let customerId = null;
let paymentId = null;
const eventId = `smoke_${stamp}`;

console.log(`${BOLD}${CYAN}Smoke Asaas sandbox${RESET}`);

await step("chave sandbox válida", async () => {
  const me = await asaas("/myAccount");
  return me?.email ? "conta sandbox acessível" : "conta acessível";
});

await step("cria cliente de teste", async () => {
  const c = await asaas("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: `Smoke Certificacao ${stamp}`,
      cpfCnpj: "24971563792",
      email: `smoke+${stamp}@example.com`,
      externalReference: `smoke-${stamp}`,
    }),
  });
  customerId = c.id;
  return `customer criado`;
});

await step("cria cobrança PIX de teste", async () => {
  const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const p = await asaas("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: "PIX",
      value: 5,
      dueDate: due,
      description: "Smoke de certificação (sandbox)",
      externalReference: `smoke-${stamp}`,
    }),
  });
  paymentId = p.id;
  return `cobrança ${p.status}`;
});

await step("webhook aceito com segredo em header", async () => {
  const res = await fetch(`${SB_URL}/functions/v1/asaas-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "asaas-access-token": WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      id: eventId,
      event: "PAYMENT_CREATED",
      payment: { id: paymentId, customer: customerId, value: 5, status: "PENDING" },
    }),
  });
  const body = await res.text();
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return `HTTP ${res.status}`;
});

await step("webhook sem segredo é rejeitado", async () => {
  const res = await fetch(`${SB_URL}/functions/v1/asaas-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: `${eventId}_noauth`, event: "PAYMENT_CREATED", payment: { id: paymentId } }),
  });
  await res.text();
  if (res.status === 200 || res.status === 202) throw new Error("endpoint aceitou webhook sem segredo");
  return `HTTP ${res.status}`;
});

await step("segredo em query string é rejeitado", async () => {
  const res = await fetch(
    `${SB_URL}/functions/v1/asaas-webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: `${eventId}_qs`, event: "PAYMENT_CREATED", payment: { id: paymentId } }),
    },
  );
  await res.text();
  if (res.status === 200 || res.status === 202) throw new Error("endpoint aceitou segredo por query string");
  return `HTTP ${res.status}`;
});

await step("evento entrou no inbox e foi processado", async () => {
  if (!ADMIN_KEY) throw new Error("SMOKE_SERVICE_ROLE_KEY ausente — inbox não é legível por anon (RLS)");
  const deadline = Date.now() + 90_000;
  let last = null;
  while (Date.now() < deadline) {
    const res = await rest(`asaas_webhook_events?event_id=eq.${eventId}&select=status,attempt_count,error`);
    const rows = res.ok ? await res.json() : [];
    last = Array.isArray(rows) ? rows[0] : null;
    if (last?.status === "processed") return "status=processed";
    if (last?.status === "dead_letter") throw new Error(`dead letter: ${last.error ?? "sem detalhe"}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`não concluiu em 90s (status=${last?.status ?? "ausente"})`);
});

await step("sem dead letters recentes", async () => {
  if (!ADMIN_KEY) throw new Error("SMOKE_SERVICE_ROLE_KEY ausente — inbox não é legível por anon (RLS)");
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const res = await rest(`asaas_webhook_events?status=eq.dead_letter&created_at=gte.${since}&select=event_id`);
  const rows = res.ok ? await res.json() : [];
  if (Array.isArray(rows) && rows.length > 0) throw new Error(`${rows.length} dead letter(s) nos últimos 30min`);
  return "nenhuma";
});

mkdirSync("reports", { recursive: true });
writeFileSync(
  "reports/smoke-asaas-sandbox.json",
  JSON.stringify({ generated_at: new Date().toISOString(), api_url: API_URL, results, failed }, null, 2),
);

if (failed > 0) {
  console.error(`${RED}✗ smoke Asaas sandbox reprovado (${failed} falha(s))${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓ smoke Asaas sandbox aprovado${RESET}`);
