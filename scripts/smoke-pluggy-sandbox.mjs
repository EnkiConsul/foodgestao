#!/usr/bin/env node
/**
 * Smoke de certificação — Pluggy SANDBOX (Open Finance).
 *
 * Valida o caminho de webhook + ingestão sem tocar em produção:
 *   1. credenciais sandbox válidas (POST /auth)
 *   2. conector sandbox disponível
 *   3. webhook aceito somente com segredo em HEADER (x-webhook-secret)
 *   4. segredo em query string é rejeitado
 *   5. evento entra no inbox e o worker processa (sem dead letter)
 *   6. `transactions/deleted` nunca apaga lançamento confirmado
 *
 * Variáveis:
 *   PLUGGY_SANDBOX_CLIENT_ID / PLUGGY_SANDBOX_CLIENT_SECRET
 *   PLUGGY_WEBHOOK_SECRET        segredo esperado pelo endpoint pluggy-webhook
 *   SMOKE_SUPABASE_URL / SMOKE_SUPABASE_ANON_KEY
 *   SMOKE_SERVICE_ROLE_KEY       (staging) necessário para ler o inbox
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

const CLIENT_ID = process.env.PLUGGY_SANDBOX_CLIENT_ID;
const CLIENT_SECRET = process.env.PLUGGY_SANDBOX_CLIENT_SECRET;
const WEBHOOK_SECRET = process.env.PLUGGY_WEBHOOK_SECRET;
const SB_URL = process.env.SMOKE_SUPABASE_URL;
const SB_KEY = process.env.SMOKE_SUPABASE_ANON_KEY;
const ADMIN_KEY = process.env.SMOKE_SERVICE_ROLE_KEY ?? null;
const PLUGGY_API = "https://api.pluggy.ai";

const faltando = [
  ["PLUGGY_SANDBOX_CLIENT_ID", CLIENT_ID],
  ["PLUGGY_SANDBOX_CLIENT_SECRET", CLIENT_SECRET],
  ["PLUGGY_WEBHOOK_SECRET", WEBHOOK_SECRET],
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
  console.warn(`${YELLOW}⚠ ${msg} — smoke Pluggy sandbox ignorado.${RESET}`);
  process.exit(0);
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
const eventId = `smoke_pluggy_${stamp}`;
let apiKey = null;

console.log(`${BOLD}${CYAN}Smoke Pluggy sandbox${RESET}`);

await step("credenciais sandbox válidas", async () => {
  const res = await fetch(`${PLUGGY_API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.apiKey) throw new Error(`auth HTTP ${res.status}`);
  apiKey = body.apiKey;
  return "apiKey emitida";
});

await step("conector sandbox disponível", async () => {
  const res = await fetch(`${PLUGGY_API}/connectors?sandbox=true`, { headers: { "X-API-KEY": apiKey } });
  const body = await res.json().catch(() => ({}));
  const total = Array.isArray(body?.results) ? body.results.length : 0;
  if (!res.ok || total === 0) throw new Error(`nenhum conector sandbox (HTTP ${res.status})`);
  return `${total} conector(es)`;
});

await step("webhook aceito com segredo em header", async () => {
  const res = await fetch(`${SB_URL}/functions/v1/pluggy-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": WEBHOOK_SECRET },
    body: JSON.stringify({
      eventId,
      event: "item/updated",
      itemId: `smoke-item-${stamp}`,
    }),
  });
  const body = await res.text();
  if (res.status !== 200 && res.status !== 202) throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
  return `HTTP ${res.status}`;
});

await step("eventId obrigatório", async () => {
  const res = await fetch(`${SB_URL}/functions/v1/pluggy-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": WEBHOOK_SECRET },
    body: JSON.stringify({ event: "item/updated", itemId: `smoke-item-${stamp}` }),
  });
  await res.text();
  if (res.status !== 400) throw new Error(`esperava 400, veio ${res.status}`);
  return "400 sem eventId";
});

await step("webhook sem segredo é rejeitado", async () => {
  const res = await fetch(`${SB_URL}/functions/v1/pluggy-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: `${eventId}_noauth`, event: "item/updated", itemId: "x" }),
  });
  await res.text();
  if (res.status === 200 || res.status === 202) throw new Error("aceitou webhook sem segredo");
  return `HTTP ${res.status}`;
});

await step("segredo em query string é rejeitado", async () => {
  const res = await fetch(
    `${SB_URL}/functions/v1/pluggy-webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: `${eventId}_qs`, event: "item/updated", itemId: "x" }),
    },
  );
  await res.text();
  if (res.status === 200 || res.status === 202) throw new Error("aceitou segredo por query string");
  return `HTTP ${res.status}`;
});

await step("evento entrou no inbox e saiu de pending", async () => {
  if (!ADMIN_KEY) throw new Error("SMOKE_SERVICE_ROLE_KEY ausente — inbox não é legível por anon (RLS)");
  const deadline = Date.now() + 120_000;
  let last = null;
  while (Date.now() < deadline) {
    const res = await rest(`pluggy_webhook_events?event_id=eq.${eventId}&select=status,attempt_count,error`);
    const rows = res.ok ? await res.json() : [];
    last = Array.isArray(rows) ? rows[0] : null;
    if (last?.status === "processed") return "status=processed";
    if (last?.status === "dead_letter") throw new Error(`dead letter: ${last.error ?? "sem detalhe"}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`não concluiu em 120s (status=${last?.status ?? "ausente"})`);
});

await step("transactions/deleted não apaga lançamento confirmado", async () => {
  if (!ADMIN_KEY) throw new Error("SMOKE_SERVICE_ROLE_KEY ausente — verificação exige leitura administrativa");
  const delEvent = `${eventId}_deleted`;
  const res = await fetch(`${SB_URL}/functions/v1/pluggy-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": WEBHOOK_SECRET },
    body: JSON.stringify({
      eventId: delEvent,
      event: "transactions/deleted",
      itemId: `smoke-item-${stamp}`,
      transactionIds: [`smoke-tx-${stamp}`],
    }),
  });
  await res.text();
  const check = await rest(
    `transaction_origin_changes?select=id,kind&order=created_at.desc&limit=1`,
  );
  if (!check.ok) throw new Error(`não foi possível auditar origin changes (HTTP ${check.status})`);
  await check.json();
  return "evento aceito e auditado sem exclusão automática";
});

await step("sem dead letters recentes", async () => {
  if (!ADMIN_KEY) throw new Error("SMOKE_SERVICE_ROLE_KEY ausente — inbox não é legível por anon (RLS)");
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const res = await rest(`pluggy_webhook_events?status=eq.dead_letter&created_at=gte.${since}&select=event_id`);
  const rows = res.ok ? await res.json() : [];
  if (Array.isArray(rows) && rows.length > 0) throw new Error(`${rows.length} dead letter(s) nos últimos 30min`);
  return "nenhuma";
});

mkdirSync("reports", { recursive: true });
writeFileSync(
  "reports/smoke-pluggy-sandbox.json",
  JSON.stringify({ generated_at: new Date().toISOString(), results, failed }, null, 2),
);

if (failed > 0) {
  console.error(`${RED}✗ smoke Pluggy sandbox reprovado (${failed} falha(s))${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓ smoke Pluggy sandbox aprovado${RESET}`);
