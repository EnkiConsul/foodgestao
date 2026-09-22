/**
 * Fase 10 — regras que governam as validações de Pessoas 360°.
 *
 * Visitante (sem sessão) não executa as rotinas oficiais das regras e não lê nem
 * grava nas tabelas de configuração do DP, bloqueios, datas bloqueadas, limite de
 * folgas do dia, regras e períodos de férias, cobertura mínima, dependentes,
 * disponibilidade em outras unidades, avisos, comentários e histórico de regras.
 * Os casos com sessão (empresa alheia, escopo cruzado, faixa inválida, período
 * invertido, gravação por fora) são verificados no banco com sessão simulada —
 * ver o relatório.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const ID = "00000000-0000-4000-8000-0000000000f0";

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
  ["salvar configuração do DP", "dp_config_dp_salvar", { p_company_id: ID, p_unidade_id: null, p_patch: { folgas_fds_por_mes: 1 } }],
  ["remover exceção da unidade", "dp_config_dp_excecao_excluir", { p_company_id: ID, p_unidade_id: ID }],
  ["salvar regra de bloqueio", "dp_bloqueio_regra_salvar", { p_company_id: ID, p_regra: { nome: "BURLA", tipo: "fixa_anual", mes: 1, dia: 1 }, p_unidades: [] }],
  ["excluir regra de bloqueio", "dp_bloqueio_regra_excluir", { p_id: ID, p_motivo: "teste" }],
  ["salvar data bloqueada", "dp_data_bloqueada_salvar", { p_company_id: ID, p_data: "2030-01-01", p_motivo: "BURLA", p_unidade_id: null, p_liberada: false, p_id: null }],
  ["bloquear datas em lote", "dp_datas_bloqueadas_definir_lote", { p_company_id: ID, p_datas: ["2030-01-01"], p_unidades: [ID], p_motivo: "BURLA", p_liberada: false }],
  ["excluir data bloqueada", "dp_data_bloqueada_excluir", { p_id: ID }],
  ["bloquear data novamente", "dp_data_bloqueada_rebloquear", { p_id: ID }],
  ["definir limite do dia", "dp_dia_config_definir", { p_company_id: ID, p_data: "2030-01-01", p_limite: 1, p_unidade_id: null, p_observacao: null }],
  ["excluir limite do dia", "dp_dia_config_excluir", { p_id: ID }],
  ["salvar regra de férias", "dp_ferias_regra_salvar", { p_company_id: ID, p_regra: { max_simultaneos: 1 } }],
  ["excluir regra de férias", "dp_ferias_regra_excluir", { p_id: ID, p_motivo: null }],
  ["salvar período bloqueado de férias", "dp_ferias_bloqueio_salvar", { p_company_id: ID, p_bloqueio: { nome: "BURLA", data_inicio: "2030-01-01", data_fim: "2030-01-02" } }],
  ["excluir período bloqueado de férias", "dp_ferias_bloqueio_excluir", { p_id: ID, p_motivo: null }],
  ["salvar cobertura mínima", "dp_cobertura_minima_salvar", { p_company_id: ID, p_regra: { minimo: 1 } }],
  ["excluir cobertura mínima", "dp_cobertura_minima_excluir", { p_id: ID, p_motivo: null }],
  ["definir grau de parentesco", "dp_admissao_regra_parentesco_definir", { p_company_id: ID, p_parentesco: "FILHO", p_dependente: true, p_sesc: false }],
  ["salvar dependente", "dp_dependente_salvar", { p_colaborador_id: ID, p_dependente: { nome: "BURLA", parentesco: "filho" } }],
  ["excluir dependente", "dp_dependente_excluir", { p_id: ID }],
  ["salvar disponibilidade em outra unidade", "dp_apoio_unidade_salvar", { p_company_id: ID, p_apoio: { colaborador_id: ID, unidade_id: ID } }],
  ["excluir disponibilidade", "dp_apoio_unidade_excluir", { p_id: ID }],
  ["salvar aviso", "dp_aviso_salvar", { p_company_id: ID, p_aviso: { titulo: "BURLA", conteudo: "BURLA" } }],
  ["excluir aviso", "dp_aviso_excluir", { p_id: ID }],
  ["comentar aviso", "dp_aviso_comentar", { p_aviso_id: ID, p_conteudo: "BURLA", p_autor_nome: null }],
  ["excluir comentário", "dp_aviso_comentario_excluir", { p_id: ID }],
  ["moderar comentário", "dp_aviso_comentario_moderar", { p_id: ID, p_status: "aprovado" }],
  ["registrar ciência de regra", "dp_regras_ciencia_registrar", { p_company_id: ID, p_tabela: "BURLA", p_registro_id: null, p_justificativa: null, p_valor_antigo: null, p_valor_novo: null, p_ciencia: true }],
];

describe("Regras: visitante negado nas rotinas", () => {
  for (const [nome, fn, args] of rotinas) {
    it(`nega ${nome}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    });
  }
});

const tabelas = [
  "dp_config_dp",
  "dp_bloqueio_regras",
  "dp_datas_bloqueadas",
  "dp_dia_config",
  "dp_ferias_regras",
  "dp_ferias_bloqueios",
  "dp_cobertura_minima",
  "dp_dependentes",
  "dp_apoio_unidades",
  "dp_avisos",
  "dp_avisos_comentarios",
  "dp_regras_historico",
];

describe("Regras: visitante negado nas tabelas", () => {
  for (const t of tabelas) {
    it(`não lê ${t}`, async () => {
      if (!networkAvailable) return;
      const { data, error } = await anon()
        .from(t as never)
        .select("id")
        .limit(1);
      if (error) expect(error).toBeTruthy();
      else expect(data?.length ?? 0).toBe(0);
    });
  }

  it("não grava configuração do DP direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_config_dp")
      .insert({ company_id: ID, unidade_id: null } as never);
    expect(error).toBeTruthy();
  });

  it("não bloqueia data direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_datas_bloqueadas")
      .insert({ company_id: ID, data: "2030-01-01", motivo: "BURLA" } as never);
    expect(error).toBeTruthy();
  });

  it("não define limite do dia direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_dia_config")
      .insert({ company_id: ID, data: "2030-01-01", limite_folgas: 9 } as never);
    expect(error).toBeTruthy();
  });

  it("não cria aviso direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_avisos")
      .insert({ company_id: ID, titulo: "BURLA", conteudo: "BURLA" } as never);
    expect(error).toBeTruthy();
  });

  it("não escreve no histórico de regras direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_regras_historico")
      .insert({ company_id: ID, tabela: "BURLA" } as never);
    expect(error).toBeTruthy();
  });

  it("não altera regra de bloqueio direto na tabela", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("dp_bloqueio_regras")
      .update({ ativo: false } as never)
      .neq("nome", "")
      .select("id");
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });

  it("não apaga data bloqueada direto na tabela", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("dp_datas_bloqueadas")
      .delete()
      .neq("motivo", "")
      .select("id");
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
