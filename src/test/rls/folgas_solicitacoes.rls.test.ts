/**
 * Fase 4 — folgas e solicitações seguras.
 *
 * Visitante (sem sessão) não escreve nem lê nada de folgas/solicitações e não
 * executa nenhuma das rotinas novas. Os casos que dependem de sessão
 * autenticada (janela, limite, duplicidade, concorrência, aprovação) são
 * verificados no banco, com a sessão simulada — ver o relatório da fase.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const UUID_QUALQUER = "00000000-0000-4000-8000-0000000000bb";
const DATA_QUALQUER = "2099-01-15";

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

describe("Folgas e solicitações: visitante negado nas rotinas", () => {
  const casos: Array<[string, string, Record<string, unknown>]> = [
    ["marcar folga", "dp_folga_marcar", { p_data: DATA_QUALQUER }],
    ["remover folga", "dp_folga_remover", { p_data: DATA_QUALQUER }],
    [
      "solicitar folga",
      "dp_folga_solicitar",
      { p_data: DATA_QUALQUER, p_motivo: "teste", p_fora_da_janela: true },
    ],
    [
      "criar solicitação",
      "dp_solicitacao_criar",
      {
        p_tipo: "folga",
        p_data_alvo: DATA_QUALQUER,
        p_data_fim: null,
        p_motivo: null,
        p_arquivo_path: null,
      },
    ],
    ["cancelar solicitação", "dp_solicitacao_cancelar", { p_id: UUID_QUALQUER }],
    [
      "responder solicitação",
      "dp_solicitacao_responder",
      { p_id: UUID_QUALQUER, p_status: "aprovada", p_resposta: null },
    ],
    [
      "criar solicitação como gestor",
      "dp_solicitacao_criar_admin",
      {
        p_colaborador: UUID_QUALQUER,
        p_tipo: "folga",
        p_data_alvo: DATA_QUALQUER,
        p_data_fim: null,
        p_motivo: null,
        p_arquivo_path: null,
        p_aprovada: true,
      },
    ],
    [
      "atribuir folga como gestor",
      "dp_folga_atribuir_admin",
      { p_colaborador: UUID_QUALQUER, p_data: DATA_QUALQUER, p_motivo: null },
    ],
    [
      "consultar limite do dia",
      "dp_folga_limite_dia",
      {
        p_company: UUID_QUALQUER,
        p_unidade: null,
        p_cargo: null,
        p_data: DATA_QUALQUER,
        p_ignorar_colaborador: null,
        p_setor: null,
      },
    ],
    [
      "consultar janela mensal",
      "dp_folgas_janela_efetiva",
      { _company: UUID_QUALQUER, _unidade: null, _data_ref: null },
    ],
  ];

  for (const [nome, fn, args] of casos) {
    it(`nega ${nome}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    });
  }

  it("não grava folga direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_folgas")
      .insert({
        company_id: UUID_QUALQUER,
        colaborador_id: UUID_QUALQUER,
        data: DATA_QUALQUER,
      } as never);
    expect(error).toBeTruthy();
  });

  it("não grava solicitação direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_solicitacoes")
      .insert({
        company_id: UUID_QUALQUER,
        colaborador_id: UUID_QUALQUER,
        tipo: "folga",
        data_alvo: DATA_QUALQUER,
      } as never);
    expect(error).toBeTruthy();
  });

  it("não lê folgas de ninguém", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from("dp_folgas").select("id").limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });

  it("não lê solicitações de ninguém", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from("dp_solicitacoes").select("id").limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
