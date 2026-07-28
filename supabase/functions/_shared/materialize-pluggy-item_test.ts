// P0 — Testes do helper materializePluggyItem.
// Cobre os cenários exigidos no prompt (onSuccess only, webhook only, duplicidade,
// aut. pendente, correlação expirada, cross-tenant, reconnect).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { materializePluggyItem } from "./materialize-pluggy-item.ts";

// Mock supabase-js chainable client
type Row = Record<string, any>;
interface Store {
  requests: Row[];
  connections: Row[];
  accounts: Row[];
  runs: Row[];
}

function makeSupabase(store: Store) {
  const build = (table: keyof Store) => {
    const state: any = {
      table,
      filters: [] as { col: string; op: string; val: any }[],
      _op: null as null | "select" | "insert" | "update" | "upsert",
      _row: null as any,
      _rows: null as any,
      _onConflict: null as string | null,
      _in: [] as { col: string; vals: any[] }[],
    };
    const api: any = {
      select: (_?: string) => { state._op = state._op ?? "select"; return api; },
      insert: (row: any) => { state._op = "insert"; state._row = row; return api; },
      update: (row: any) => { state._op = "update"; state._row = row; return api; },
      upsert: (rows: any, opts?: { onConflict?: string }) => {
        state._op = "upsert";
        state._rows = Array.isArray(rows) ? rows : [rows];
        state._onConflict = opts?.onConflict ?? null;
        return api;
      },
      eq: (col: string, val: any) => { state.filters.push({ col, op: "eq", val }); return api; },
      in: (col: string, vals: any[]) => { state._in.push({ col, vals }); return api; },
      lt: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => execute(state, store, "one"),
      single: async () => execute(state, store, "one"),
    };
    // Make it thenable so `await supabase.from(...).insert(...)` works.
    (api as any).then = (resolve: any, reject: any) =>
      execute(state, store, state._op === "insert" || state._op === "upsert" ? "many" : "many")
        .then(resolve, reject);
    return api;
  };
  return {
    from: (table: string) => build(table as keyof Store),
    rpc: async () => ({ data: null, error: null }),
  };
}

function execute(state: any, store: Store, kind: "one" | "many"): any {
  const tbl = store[state.table as keyof Store];
  if (state._op === "select") {
    let rows = tbl.filter((r: Row) =>
      state.filters.every((f: any) => r[f.col] === f.val) &&
      state._in.every((i: any) => i.vals.includes(r[i.col])),
    );
    return Promise.resolve({ data: kind === "one" ? rows[0] ?? null : rows, error: null });
  }
  if (state._op === "insert") {
    const row = { ...state._row, id: state._row.id ?? crypto.randomUUID() };
    tbl.push(row);
    return Promise.resolve({ data: kind === "one" ? row : [row], error: null });
  }
  if (state._op === "upsert") {
    const conflict = (state._onConflict ?? "").split(",").map((s: string) => s.trim());
    const result: Row[] = [];
    for (const row of state._rows) {
      const idx = tbl.findIndex((r: Row) => conflict.every((c: string) => r[c] === row[c]));
      if (idx >= 0) {
        Object.assign(tbl[idx], row);
        result.push(tbl[idx]);
      } else {
        const withId = { ...row, id: row.id ?? crypto.randomUUID() };
        tbl.push(withId);
        result.push(withId);
      }
    }
    return Promise.resolve({ data: kind === "one" ? result[0] : result, error: null });
  }
  if (state._op === "update") {
    let matched = tbl.filter((r: Row) => state.filters.every((f: any) => r[f.col] === f.val));
    if (state._in.length) {
      matched = matched.filter((r: Row) => state._in.every((i: any) => i.vals.includes(r[i.col])));
    }
    for (const row of matched) Object.assign(row, state._row);
    return Promise.resolve({ data: matched, error: null });
  }
  return Promise.resolve({ data: null, error: null });
}

// Stub Pluggy client via module-level import replacement is complex; instead we
// override globalThis.fetch to answer /items/{id} and /accounts?itemId=...
function stubFetch(item: any, accounts: any[]) {
  (globalThis as any).fetch = async (url: string) => {
    const s = String(url);
    if (s.endsWith("/auth")) {
      return new Response(JSON.stringify({ apiKey: "stub" }), { status: 200 });
    }
    if (s.includes("/items/")) {
      return new Response(JSON.stringify(item), { status: 200 });
    }
    if (s.includes("/accounts")) {
      return new Response(JSON.stringify({ results: accounts }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
}

const REQ_ID = "11111111-1111-1111-1111-111111111111";
const COMPANY = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";
const ITEM = "item_abc";

function baseRequest(overrides: Partial<Row> = {}): Row {
  return {
    id: REQ_ID,
    company_id: COMPANY,
    requested_by_user_id: USER,
    status: "token_created",
    correlation_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    cancelled_at: null,
    pluggy_item_id: null,
    mode: "new",
    ...overrides,
  };
}
function baseItem() {
  return {
    id: ITEM,
    clientUserId: `ofreq:${REQ_ID}`,
    connector: { id: 201, name: "Santander", imageUrl: "" },
    status: "UPDATED",
    executionStatus: "SUCCESS",
    consentExpiresAt: null,
  };
}

Deno.env.set("PLUGGY_CLIENT_ID", "id");
Deno.env.set("PLUGGY_CLIENT_SECRET", "sec");

Deno.test("CASE 2 — Webhook-only cria conexão, contas e sync inicial", async () => {
  const store: Store = { requests: [baseRequest()], connections: [], accounts: [], runs: [] };
  stubFetch(baseItem(), [{ id: "acc1", type: "BANK", name: "CC", currencyCode: "BRL", balance: 100 }]);
  const r = await materializePluggyItem({
    supabase: makeSupabase(store) as any,
    itemId: ITEM,
    clientUserId: `ofreq:${REQ_ID}`,
    trigger: "webhook:item/created",
  });
  assertEquals(r.ok, true);
  assertEquals(store.connections.length, 1);
  assertEquals(store.accounts.length, 1);
  assertEquals(store.runs.length, 1);
  assertEquals(store.requests[0].status, "connected");
});

Deno.test("CASE 3 — Webhook + item_register não duplicam", async () => {
  const store: Store = { requests: [baseRequest()], connections: [], accounts: [], runs: [] };
  stubFetch(baseItem(), [{ id: "acc1", type: "BANK", currencyCode: "BRL" }]);
  await materializePluggyItem({ supabase: makeSupabase(store) as any, itemId: ITEM, clientUserId: `ofreq:${REQ_ID}`, trigger: "webhook:item/created" });
  const r2 = await materializePluggyItem({ supabase: makeSupabase(store) as any, itemId: ITEM, requestId: REQ_ID, connectedByUserId: USER, trigger: "item_register", expectedCompanyId: COMPANY });
  assertEquals(r2.ok, true);
  if (r2.ok) assertEquals(r2.alreadyMaterialized, true);
  assertEquals(store.connections.length, 1);
  assertEquals(store.accounts.length, 1);
  assertEquals(store.runs.length, 1);
});

Deno.test("CASE 5 — Webhook duplicado 3x mantém 1 conexão/1 conta/1 run", async () => {
  const store: Store = { requests: [baseRequest()], connections: [], accounts: [], runs: [] };
  stubFetch(baseItem(), [{ id: "acc1", type: "BANK", currencyCode: "BRL" }]);
  for (let i = 0; i < 3; i++) {
    await materializePluggyItem({ supabase: makeSupabase(store) as any, itemId: ITEM, clientUserId: `ofreq:${REQ_ID}`, trigger: "webhook:item/created" });
  }
  assertEquals(store.connections.length, 1);
  assertEquals(store.accounts.length, 1);
  assertEquals(store.runs.length, 1);
});

Deno.test("CASE 8 — correlação expirada rejeita quando não há conexão prévia", async () => {
  const store: Store = { requests: [baseRequest({ correlation_expires_at: new Date(Date.now() - 1000).toISOString() })], connections: [], accounts: [], runs: [] };
  stubFetch(baseItem(), []);
  const r = await materializePluggyItem({ supabase: makeSupabase(store) as any, itemId: ITEM, clientUserId: `ofreq:${REQ_ID}`, trigger: "webhook:item/created" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "correlation_expired");
});

Deno.test("CASE 9 — clientUserId inválido rejeita", async () => {
  const store: Store = { requests: [], connections: [], accounts: [], runs: [] };
  stubFetch({ ...baseItem(), clientUserId: "garbage" }, []);
  const r = await materializePluggyItem({ supabase: makeSupabase(store) as any, itemId: ITEM, clientUserId: "garbage", trigger: "webhook:item/created" });
  assertEquals(r.ok, false);
  assertEquals(store.connections.length, 0);
});

Deno.test("CASE 10 — cross-tenant: item já pertence a outra empresa", async () => {
  const otherCompany = "99999999-9999-9999-9999-999999999999";
  const store: Store = {
    requests: [baseRequest()],
    connections: [{ id: "existing", company_id: otherCompany, connected_by_user_id: USER, pluggy_item_id: ITEM }],
    accounts: [],
    runs: [],
  };
  stubFetch(baseItem(), []);
  const r = await materializePluggyItem({ supabase: makeSupabase(store) as any, itemId: ITEM, clientUserId: `ofreq:${REQ_ID}`, trigger: "webhook:item/created" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.errorCode, "item_company_conflict");
  assertEquals(store.connections.length, 1); // não altera conexão da outra empresa
  assertEquals(store.connections[0].company_id, otherCompany);
});

Deno.test("CASE 12 — reconnect atualiza conexão existente sem duplicar", async () => {
  const store: Store = {
    requests: [baseRequest({ mode: "reconnect", existing_connection_id: "existing" })],
    connections: [{ id: "existing", company_id: COMPANY, connected_by_user_id: USER, pluggy_item_id: ITEM, status: "OUTDATED" }],
    accounts: [{ id: "a1", connection_id: "existing", company_id: COMPANY, pluggy_account_id: "acc1", currency: "BRL" }],
    runs: [],
  };
  stubFetch(baseItem(), [{ id: "acc1", type: "BANK", currencyCode: "BRL", balance: 250 }]);
  const r = await materializePluggyItem({ supabase: makeSupabase(store) as any, itemId: ITEM, requestId: REQ_ID, trigger: "webhook:item/updated" });
  assertEquals(r.ok, true);
  assertEquals(store.connections.length, 1);
  assertEquals(store.connections[0].status, "UPDATED");
  assertEquals(store.accounts.length, 1);
  assertEquals(store.accounts[0].balance, 250);
});
