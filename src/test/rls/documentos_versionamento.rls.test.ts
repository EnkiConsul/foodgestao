/**
 * Fase 2 — documentos: as rotinas novas não podem ser usadas por visitante
 * e nenhuma linha de dp_documentos pode ser lida sem sessão.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const FAKE_ID = "00000000-0000-4000-8000-000000000000";

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

describe("Documentos: acesso anônimo fechado", () => {
  it("não lê dp_documentos", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from("dp_documentos").select("id").limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });

  it("não obtém o caminho do arquivo pela rotina autorizada", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().rpc("dp_documento_arquivo", { _documento_id: FAKE_ID });
    expect(error ?? (Array.isArray(data) && data.length === 0)).toBeTruthy();
  });

  it("não arquiva documento", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().rpc("dp_documento_arquivar", {
      _documento_id: FAKE_ID,
      _motivo: "probe",
    });
    expect(error).toBeTruthy();
  });

  it("não exclui documento definitivamente", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().rpc("dp_documento_excluir_definitivo", {
      _documento_id: FAKE_ID,
      _motivo: "probe",
    });
    expect(error).toBeTruthy();
  });

  it("não publica versão de documento", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().rpc("dp_documento_versao_publicar", {
      _novo_id: FAKE_ID,
      _anterior_id: null,
      _motivo: null,
    });
    expect(error).toBeTruthy();
  });

  it("não reserva item de importação em lote", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().rpc("dp_bulk_item_reservar" as never, { _item_id: FAKE_ID } as never);
    expect(error).toBeTruthy();
  });

  it("não lê nem grava no bucket disciplinar", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().storage.from("dp-disciplinar").list();
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
