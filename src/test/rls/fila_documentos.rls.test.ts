/**
 * Fase 6 — fila durável de importação de documentos e OCR.
 *
 * Visitante (sem sessão) não executa nenhuma rotina da fila, não aciona o
 * processador de segundo plano e não lê nem grava nas tabelas do lote.
 * Os casos de fila com sessão/serviço (reserva concorrente, concessão expirada,
 * retry, tentativa máxima, idempotência) são verificados no banco — ver
 * supabase/tests/dp_bulk_queue.test.sql e o relatório da fase.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

const ID = "00000000-0000-4000-8000-0000000000dd";

let networkAvailable = true;

beforeAll(async () => {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    networkAvailable = res.ok;
  } catch {
    networkAvailable = false;
  }
});

const anon = () =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const rotinas: Array<[string, string, Record<string, unknown>]> = [
  ["reservar lotes", "dp_bulk_claim_batches", { _worker: "teste", _limit: 1, _lease_seconds: 60 }],
  ["enfileirar páginas", "dp_bulk_enqueue_pages", { _batch_id: ID, _total_pages: 2, _worker: "teste" }],
  ["reservar itens", "dp_bulk_claim_items", { _worker: "teste", _limit: 1, _lease_seconds: 60 }],
  [
    "concluir item com sucesso",
    "dp_bulk_item_finish_success",
    { _item_id: ID, _worker: "teste", _payload: {} },
  ],
  [
    "concluir item com falha",
    "dp_bulk_item_finish_failure",
    { _item_id: ID, _worker: "teste", _error: "x", _error_class: "transient", _fatal: false },
  ],
  ["recuperar reservas expiradas", "dp_bulk_reclaim_expired", { _limit: 10 }],
  ["finalizar lote", "dp_bulk_batch_finalize", { _batch_id: ID }],
  ["ler o segredo do processador", "dp_bulk_worker_secret", {}],
];

describe("Fila de documentos: visitante negado nas rotinas", () => {
  for (const [nome, fn, args] of rotinas) {
    it(`nega ${nome}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    });
  }
});

describe("Fila de documentos: visitante negado nas tabelas", () => {
  const tabelas = ["dp_bulk_import_batches", "dp_bulk_import_items"];

  for (const t of tabelas) {
    it(`não lê ${t}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { data, error } = await anon()
        .from(t as never)
        .select("id")
        .limit(1);
      if (error) expect(error).toBeTruthy();
      else expect(data?.length ?? 0).toBe(0);
    });
  }

  it("não cria lote direto na tabela", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { error } = await anon()
      .from("dp_bulk_import_batches")
      .insert({
        company_id: ID,
        tipo: "outros",
        source_file_path: "x/y.pdf",
        source_file_name: "y.pdf",
        status: "queued",
      } as never);
    expect(error).toBeTruthy();
  });

  it("não reserva item da fila alterando a tabela", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon()
      .from("dp_bulk_import_items")
      .update({ status: "processing", locked_by: "invasor" } as never)
      .in("status", ["queued", "retry"])
      .select("id");
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});

describe("Fila de documentos: processador não é público", () => {
  it("nega chamada do processador sem segredo interno", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/dp-doc-bulk-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  it("nega chamada do processador com segredo errado", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/dp-doc-bulk-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        "x-worker-secret": "segredo-invalido",
      },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });
});
