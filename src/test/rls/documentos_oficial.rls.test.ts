/**
 * Fase 7 — documentos e arquivos do colaborador.
 *
 * Visitante (sem sessão) não executa as rotinas oficiais e não lê nem grava
 * nas tabelas de documentos. Os casos com sessão (empresa, arquivo de outra
 * pasta, comprovante com data futura, substituição com assinatura, exclusão
 * lógica) são verificados no banco com sessão simulada — ver o relatório.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const ID = "00000000-0000-4000-8000-0000000000e7";

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
    "registrar documento",
    "dp_documento_registrar",
    { p_dados: { company_id: ID, titulo: "TESTE", file_path: `${ID}/x.pdf` } },
  ],
  ["revisar documento", "dp_documento_revisar", { p_documento_id: ID, p_status: "aprovado", p_motivo: null }],
  [
    "substituir documento",
    "dp_documento_substituir",
    { p_documento_id: ID, p_arquivo: { file_path: `${ID}/y.pdf` }, p_patch: {}, p_motivo: "teste" },
  ],
  ["excluir documento", "dp_documento_excluir", { p_documento_id: ID, p_motivo: "teste" }],
  [
    "anexar comprovante",
    "dp_comprovante_anexar",
    { p_documento_id: ID, p_arquivo: { file_path: `${ID}/c.pdf` }, p_pago_em: null },
  ],
  ["remover comprovante", "dp_comprovante_remover", { p_documento_id: ID }],
  ["reassociar comprovante", "dp_comprovante_reassociar", { p_origem_id: ID, p_destino_id: ID }],
  [
    "salvar item do checklist",
    "dp_colaborador_documento_salvar",
    { p_id: null, p_dados: { colaborador_id: ID, status: "enviado" } },
  ],
  ["excluir item do checklist", "dp_colaborador_documento_excluir", { p_id: ID, p_motivo: "teste" }],
  [
    "salvar exigência de documento",
    "dp_documento_requisito_salvar",
    { p_id: null, p_dados: { nome: "TESTE" }, p_company_id: ID },
  ],
  ["excluir exigência de documento", "dp_documento_requisito_excluir", { p_id: ID }],
  [
    "registrar evento de documento",
    "dp_documento_evento_registrar",
    { p_dados: { company_id: ID, documento_id: ID, origem: "doc", acao: "excluido" } },
  ],
];

describe("Documentos: visitante negado nas rotinas", () => {
  for (const [nome, fn, args] of rotinas) {
    it(`nega ${nome}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    });
  }
});

describe("Documentos: visitante negado nas tabelas", () => {
  const tabelas = [
    "dp_documentos",
    "dp_colaborador_documentos",
    "dp_documento_requisitos",
    "dp_documento_eventos",
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

  it("não cria documento direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_documentos")
      .insert({ company_id: ID, titulo: "BURLA", file_path: `${ID}/b.pdf` } as never);
    expect(error).toBeTruthy();
  });

  it("não cria item de checklist direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_colaborador_documentos")
      .insert({ company_id: ID, colaborador_id: ID } as never);
    expect(error).toBeTruthy();
  });

  it("não grava evento de documento direto na tabela", async () => {
    if (!networkAvailable) return;
    const { error } = await anon()
      .from("dp_documento_eventos")
      .insert({ company_id: ID, documento_id: ID, origem: "doc", acao: "excluido" } as never);
    expect(error).toBeTruthy();
  });

  it("não altera documento direto na tabela", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("dp_documentos")
      .update({ titulo: "BURLA" } as never)
      .neq("titulo", "BURLA")
      .select("id");
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
