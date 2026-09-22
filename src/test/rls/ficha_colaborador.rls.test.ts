/**
 * Fase 6 — ficha do colaborador, recontratação, folgas e disciplinares.
 *
 * Visitante (sem sessão) não executa as rotinas oficiais e não lê nem grava
 * nas tabelas envolvidas. Os casos com sessão (papel, empresa, Pix, duplo
 * clique, recontratação com histórico) são verificados no banco com sessão
 * simulada — ver o relatório da fase.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const ID = "00000000-0000-4000-8000-0000000000dd";
const DATA = "2099-05-10";

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
    "salvar a ficha do colaborador",
    "dp_colaborador_salvar",
    { p_dados: { nome: "TESTE" }, p_id: null, p_company_id: ID },
  ],
  [
    "atualizar o próprio cadastro",
    "dp_colaborador_perfil_atualizar",
    { p_dados: { telefone: "62999999999" } },
  ],
  [
    "ajustar colaboradores em lote",
    "dp_colaboradores_ajustar_lote",
    { p_company_id: ID, p_dados: { vale_transporte: false }, p_ids: [ID] },
  ],
  ["recontratar colaborador", "dp_recontratar_colaborador", { p_colaborador_id: ID, p_data_admissao: DATA }],
  [
    "criar folga pelo DP",
    "dp_folga_admin_criar",
    { p_colaborador_id: ID, p_data: DATA, p_tipo: "normal", p_origem: "admin_manual", p_observacao: null },
  ],
  [
    "criar folgas em lote",
    "dp_folgas_admin_criar_lote",
    { p_itens: [{ colaborador_id: ID, data: DATA }] },
  ],
  [
    "registrar medida disciplinar",
    "dp_registro_disciplinar_registrar",
    { p_colaborador_id: ID, p_tipo: "advertencia_escrita", p_data: DATA, p_descricao: "teste", p_dias: null },
  ],
  [
    "excluir medida disciplinar",
    "dp_registro_disciplinar_excluir",
    { p_id: ID, p_motivo: "teste" },
  ],
  ["aceitar documento anexado", "dp_documento_anexo_aceitar", { p_documento_id: ID }],
];

describe("Ficha do colaborador: visitante negado nas rotinas", () => {
  for (const [nome, fn, args] of rotinas) {
    it(`nega ${nome}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    });
  }
});

describe("Ficha do colaborador: visitante negado nas tabelas", () => {
  const tabelas = [
    "dp_colaboradores",
    "dp_colaborador_config_trabalho",
    "dp_colaborador_config_dias",
    "dp_colaborador_historico_condicoes",
    "dp_folgas",
    "dp_registros_disciplinares",
    "dp_documento_aceites",
  ];

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

  it("não cria colaborador direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_colaboradores")
      .insert({ company_id: ID, nome: "BURLA" } as never);
    expect(error).toBeTruthy();
  });

  it("não cria medida disciplinar direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_registros_disciplinares")
      .insert({
        company_id: ID,
        colaborador_id: ID,
        tipo: "advertencia_escrita",
        data: DATA,
      } as never);
    expect(error).toBeTruthy();
  });

  it("não cria aceite de documento direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_documento_aceites")
      .insert({ company_id: ID, colaborador_id: ID } as never);
    expect(error).toBeTruthy();
  });

  it("não altera condições de trabalho direto na tabela", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("dp_colaborador_config_trabalho")
      .update({ carga_semanal_horas: 1 } as never)
      .neq("carga_semanal_horas", 1)
      .select("id");
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
