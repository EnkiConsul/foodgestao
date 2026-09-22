/**
 * Fase 2 — solicitações e estados administrativos.
 *
 * Visitante (sem sessão) não executa nenhuma das rotinas novas e o aplicativo
 * não altera nem apaga solicitações direto na tabela. Os casos que dependem de
 * sessão autenticada (empresa de outro, correção, exclusão lógica, origem do
 * adiantamento, duplo clique) são verificados no banco com a sessão simulada —
 * ver o relatório da fase.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const UUID_QUALQUER = "00000000-0000-4000-8000-0000000000cc";
const DATA_QUALQUER = "2099-03-10";

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

describe("Solicitações: visitante negado nas rotinas administrativas", () => {
  const casos: Array<[string, string, Record<string, unknown>]> = [
    [
      "corrigir atestado",
      "dp_solicitacao_corrigir",
      {
        p_id: UUID_QUALQUER,
        p_colaborador: UUID_QUALQUER,
        p_data_alvo: DATA_QUALQUER,
        p_data_fim: DATA_QUALQUER,
        p_motivo: null,
        p_justificativa: null,
      },
    ],
    ["excluir solicitação", "dp_solicitacao_excluir", { p_id: UUID_QUALQUER, p_motivo: null }],
    [
      "registrar retorno de licença",
      "dp_licenca_retorno_registrar",
      { p_id: UUID_QUALQUER, p_acao: "confirmar", p_data: DATA_QUALQUER, p_observacao: null },
    ],
    [
      "registrar adiantamento",
      "dp_adiantamento_registrar",
      { p_colaborador: UUID_QUALQUER, p_tipo: "ativar", p_data: DATA_QUALQUER, p_observacao: null },
    ],
    [
      "cancelar folga como gestor",
      "dp_folga_admin_cancelar",
      {
        p_folga_id: null,
        p_solicitacao_id: UUID_QUALQUER,
        p_colaborador: UUID_QUALQUER,
        p_data: DATA_QUALQUER,
        p_motivo: null,
      },
    ],
    [
      "remarcar folga como gestor",
      "dp_folga_admin_remarcar",
      {
        p_folga_id: null,
        p_solicitacao_id: UUID_QUALQUER,
        p_colaborador: UUID_QUALQUER,
        p_data_atual: DATA_QUALQUER,
        p_data_nova: "2099-03-17",
      },
    ],
  ];

  for (const [nome, fn, args] of casos) {
    it(`nega ${nome}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    });
  }

  it("não altera solicitação direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_solicitacoes")
      .update({ status: "aprovada" } as never)
      .eq("id", UUID_QUALQUER);
    expect(error).toBeTruthy();
  });

  it("não apaga solicitação direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().from("dp_solicitacoes").delete().eq("id", UUID_QUALQUER);
    expect(error).toBeTruthy();
  });

  it("não grava adiantamento direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_adiantamento_solicitacoes")
      .insert({
        company_id: UUID_QUALQUER,
        colaborador_id: UUID_QUALQUER,
        tipo: "ativar",
        data_solicitacao: DATA_QUALQUER,
        origem: "gestor",
      } as never);
    expect(error).toBeTruthy();
  });

  it("não lê adiantamentos de ninguém", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("dp_adiantamento_solicitacoes")
      .select("id")
      .limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
