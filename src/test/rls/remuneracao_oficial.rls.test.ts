/**
 * Fase 9 — cadastros de remuneração e benefícios.
 *
 * Visitante (sem sessão) não executa as rotinas oficiais e não lê nem grava nas
 * tabelas de cargos, pisos, benefícios, padrões, adicional por tempo de serviço
 * e benefícios do colaborador. Os casos com sessão (empresa alheia, valores fora
 * da faixa, vigência sobreposta, redução de piso sem justificativa, cargo em uso)
 * são verificados no banco com sessão simulada — ver o relatório.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const ID = "00000000-0000-4000-8000-0000000000e9";

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
  ["salvar cargo", "dp_cargo_salvar", { p_dados: { nome: "TESTE" }, p_company_id: ID, p_id: null }],
  [
    "definir piso do cargo",
    "dp_cargo_piso_definir",
    { p_dados: { cargo_id: ID, salario_base: 1500, unidade_id: ID }, p_id: null, p_justificativa: null },
  ],
  ["salvar benefício", "dp_beneficio_salvar", { p_dados: { nome: "TESTE" }, p_company_id: ID, p_id: null }],
  [
    "salvar padrão de benefícios",
    "dp_beneficio_padrao_salvar",
    { p_company_id: ID, p_payload: {}, p_unidade_id: null, p_cargo_id: null, p_limpar_especificos: false },
  ],
  [
    "salvar adicional por tempo de serviço",
    "dp_adicional_tempo_servico_salvar",
    { p_dados: { escopo: "empresa", percentual_por_ciclo: 1 }, p_company_id: ID, p_id: null },
  ],
  [
    "definir benefício do colaborador",
    "dp_colaborador_beneficio_definir",
    { p_dados: { colaborador_id: ID, beneficio_id: ID }, p_id: null },
  ],
  [
    "definir benefícios em lote",
    "dp_colaborador_beneficios_definir_lote",
    { p_itens: [{ colaborador_id: ID, beneficio_id: ID }] },
  ],
  [
    "excluir cadastro de remuneração",
    "dp_cadastro_remuneracao_excluir",
    { p_tabela: "dp_cargos", p_id: ID, p_motivo: "teste" },
  ],
];

describe("Remuneração: visitante negado nas rotinas", () => {
  for (const [nome, fn, args] of rotinas) {
    it(`nega ${nome}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    });
  }
});

const tabelas = [
  "dp_cargos",
  "dp_cargo_salarios",
  "dp_beneficios",
  "dp_beneficios_padroes",
  "dp_adicionais_tempo_servico",
  "dp_colaborador_beneficios",
];

describe("Remuneração: visitante negado nas tabelas", () => {
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

  it("não cria cargo direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_cargos")
      .insert({ company_id: ID, nome: "BURLA" } as never);
    expect(error).toBeTruthy();
  });

  it("não cria piso salarial direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_cargo_salarios")
      .insert({
        company_id: ID,
        cargo_id: ID,
        salario_base: 1,
        vigencia_inicio: "2026-01-01",
      } as never);
    expect(error).toBeTruthy();
  });

  it("não cria benefício direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_beneficios")
      .insert({ company_id: ID, nome: "BURLA" } as never);
    expect(error).toBeTruthy();
  });

  it("não atribui benefício a colaborador direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_colaborador_beneficios")
      .insert({ company_id: ID, colaborador_id: ID, beneficio_id: ID } as never);
    expect(error).toBeTruthy();
  });

  it("não altera piso salarial direto na tabela", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("dp_cargo_salarios")
      .update({ salario_base: 1 } as never)
      .neq("salario_base", -1)
      .select("id");
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });

  it("não apaga cargo direto na tabela", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from("dp_cargos").delete().neq("nome", "").select("id");
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
