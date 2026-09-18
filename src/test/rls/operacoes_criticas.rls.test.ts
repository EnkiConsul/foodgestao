/**
 * Fase 5 — operações críticas (trocas, férias, convocações, escala).
 *
 * Visitante (sem sessão) não executa nenhuma das rotinas destes domínios e não
 * grava nem lê nada nas tabelas envolvidas. Os casos com sessão (papel, empresa,
 * status, concorrência, retry) são verificados no banco com sessão simulada —
 * ver o relatório da fase.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

const ID = "00000000-0000-4000-8000-0000000000cc";
const DATA = "2099-03-10";

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
  [
    "propor troca",
    "dp_troca_propor",
    { p_destino: ID, p_data_original: DATA, p_data_proposta: "2099-03-11", p_motivo: "teste" },
  ],
  ["responder troca como colega", "dp_troca_responder_colega", { p_id: ID, p_aceito: true }],
  [
    "responder troca como gestor",
    "dp_troca_responder_gestor",
    { p_id: ID, p_aceito: true, p_observacao: null },
  ],
  ["cancelar a própria troca", "dp_troca_cancelar_self", { p_id: ID }],
  ["processar troca", "dp_processar_troca", { _troca_id: ID }],
  ["processar troca direta", "dp_processar_troca_direta", { _troca_id: ID }],
  ["cancelar troca aprovada", "dp_cancelar_troca", { _troca_id: ID, _motivo: "teste" }],
  [
    "editar férias programadas",
    "dp_ferias_gozo_editar",
    {
      p_gozo_id: ID,
      p_data_inicio: DATA,
      p_data_fim: "2099-03-19",
      p_dias_abono: 0,
      p_adiantar_13: false,
      p_aviso_em: null,
      p_observacao: null,
      p_justificativa: null,
    },
  ],
  [
    "solicitar férias",
    "dp_ferias_solicitar",
    {
      _periodo_id: ID,
      _data_inicio: DATA,
      _data_fim: "2099-03-19",
      _dias_abono: 0,
      _adiantar_13: false,
      _observacao: null,
    },
  ],
  [
    "aprovar férias",
    "dp_ferias_aprovar",
    { _solicitacao_id: ID, _justificativa: null, _resposta: null },
  ],
  ["recusar férias", "dp_ferias_recusar", { _solicitacao_id: ID, _motivo: "teste" }],
  ["cancelar férias", "dp_ferias_cancelar", { _gozo_id: ID, _motivo: "teste" }],
  [
    "criar convocação",
    "dp_convocacao_criar",
    {
      p_colaborador: ID,
      p_data: DATA,
      p_entrada: "08:00",
      p_saida: "17:00",
      p_intervalo_minutos: 60,
      p_termina_no_dia_seguinte: false,
      p_carga_prevista_horas: 8,
      p_unidade: null,
      p_turno: null,
      p_prazo_resposta: null,
      p_observacao: null,
    },
  ],
  ["cancelar convocação", "dp_convocacao_cancelar", { p_id: ID, p_motivo: null }],
  [
    "responder convocação",
    "dp_convocacao_responder_oferta",
    {
      p_convocacao_id: ID,
      p_aceito: true,
      p_motivo: null,
      p_parcial_entrada: null,
      p_parcial_saida: null,
      p_parcial_termina_no_dia_seguinte: false,
      p_parcial_observacao: null,
      p_atraso_justificativa: null,
    },
  ],
  [
    "publicar escala",
    "dp_escala_publicar",
    { p_competencia: "2099-03", p_unidade_id: ID, p_escala_id: null },
  ],
  ["reabrir escala", "dp_escala_reabrir", { p_escala_id: ID }],
];

describe("Operações críticas: visitante negado nas rotinas", () => {
  for (const [nome, fn, args] of rotinas) {
    it(`nega ${nome}`, async () => {
      if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    });
  }
});

describe("Operações críticas: visitante negado nas tabelas", () => {
  const tabelas = ["dp_trocas", "dp_ferias_gozos", "dp_convocacoes", "dp_escalas", "dp_escala_itens"];

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

  it("não grava troca direto na tabela", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { error } = await anon()
      .from("dp_trocas")
      .insert({
        company_id: ID,
        solicitante_id: ID,
        destino_id: ID,
        data_original: DATA,
        data_proposta: "2099-03-11",
        motivo: "teste",
      } as never);
    expect(error).toBeTruthy();
  });

  it("não publica escala direto na tabela", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon()
      .from("dp_escalas")
      .update({ status: "publicada" } as never)
      .neq("status", "publicada")
      .select("id");
    // Sem sessão, nenhuma linha é alcançada pela política de escrita.
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
