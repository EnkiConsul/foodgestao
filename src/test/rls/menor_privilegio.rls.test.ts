/**
 * Fase 8 — menor privilégio: visitante (sem sessão) não grava nada.
 *
 * Confere pela chave publicável que quem não está logado não consegue inserir,
 * alterar nem apagar em tabelas representativas de Pessoas, do financeiro e da
 * organização, não executa rotinas do servidor e continua lendo o que é
 * realmente público (planos e catálogo de módulos).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const ID = "00000000-0000-4000-8000-00000000f008";

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

const tabelas: Array<[string, Record<string, unknown>]> = [
  ["dp_cargos", { company_id: ID, nome: "BURLA" }],
  ["dp_unidades", { company_id: ID, nome: "BURLA" }],
  ["dp_turnos", { company_id: ID, nome: "BURLA" }],
  ["dp_avisos", { company_id: ID, titulo: "Burla" }],
  ["dp_notificacoes", { company_id: ID, tipo: "ferias_aviso" }],
  ["dp_dependentes", { company_id: ID, colaborador_id: ID, nome: "BURLA" }],
  ["categories", { name: "BURLA" }],
  ["contacts", { name: "BURLA" }],
  ["companies", { name: "BURLA" }],
  ["company_members", { company_id: ID, user_id: ID, role: "owner" }],
  ["user_roles", { user_id: ID, role: "super_admin" }],
  ["profiles", { id: ID }],
];

describe("Menor privilégio: visitante não grava", () => {
  for (const [tabela, linha] of tabelas) {
    it(`nega inserir em ${tabela}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon()
        .from(tabela as never)
        .insert(linha as never);
      expect(error).toBeTruthy();
    });

    it(`nega apagar em ${tabela}`, async () => {
      if (!networkAvailable) return;
      const { data, error } = await anon()
        .from(tabela as never)
        .delete()
        .neq("id", ID)
        .select("id");
      if (error) expect(error).toBeTruthy();
      else expect(data?.length ?? 0).toBe(0);
    });
  }
});

describe("Menor privilégio: visitante não executa rotinas", () => {
  const rotinas: Array<[string, Record<string, unknown>]> = [
    ["dp_documento_aceitar", { _documento_id: ID }],
    ["dp_documento_registrar", { p_dados: { titulo: "BURLA" } }],
    ["dp_colaborador_salvar", { p_dados: { nome: "BURLA" }, p_id: null, p_company_id: ID }],
    ["dp_escala_gerar_mes", { p_competencia: "2099-01-01", p_unidade_id: ID, p_itens: [] }],
    ["fn_mfa_nudge_estado", {}],
  ];

  for (const [fn, args] of rotinas) {
    it(`nega ${fn}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    });
  }
});

describe("Menor privilégio: leitura pública preservada", () => {
  it("lê os planos públicos", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().from("plans").select("id").eq("is_public", true).limit(1);
    expect(error).toBeNull();
  });

  it("lê o catálogo de módulos ativos", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().from("modulos_catalogo").select("id").eq("ativo", true).limit(1);
    expect(error).toBeNull();
  });
});
