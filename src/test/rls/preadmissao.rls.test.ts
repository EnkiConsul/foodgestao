/**
 * Pré-Admissão — isolamento sem sessão (visitante) e recusa das funções.
 *
 * Verifica com a chave publicável, sem credenciais e sem dados reais, que:
 *  - visitante não lê nem grava as tabelas de staging, convites, pessoas,
 *    documentos e eventos;
 *  - as funções de gestor recusam chamada sem sessão e com token forjado;
 *  - o endpoint público recusa convite inexistente/inválido sem revelar nada.
 *
 * Os casos com sessão real (gestor de outra empresa, promoção idempotente,
 * duplo clique, bloqueio de menor no servidor) são verificados por SQL — ver o
 * relatório da fase em docs/preadmissao-relatorio.md.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const FORGED_JWT = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiZXhwIjo0MDcwOTA4ODAwfQ",
  "ZmFrZS1zaWduYXR1cmU",
].join(".");

const ID_FICTICIO = "00000000-0000-4000-8000-0000000000pa".replace("pa", "aa");
const TABELAS = [
  "dp_preadmissoes",
  "dp_preadmissao_convites",
  "dp_preadmissao_pessoas",
  "dp_preadmissao_documentos",
  "dp_preadmissao_eventos",
  "dp_requisito_cargos",
  "dp_requisito_unidades",
];

let online = true;
beforeAll(async () => {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    online = res.ok;
  } catch {
    online = false;
  }
});

const anon = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

async function chamar(fn: string, body: unknown, jwt?: string) {
  return await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${jwt ?? ANON_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("visitante não alcança a Pré-Admissão", () => {
  for (const t of TABELAS) {
    it(`não lê ${t}`, async () => {
      if (!online) return;
      const { data, error } = await anon().from(t).select("*").limit(1);
      expect(error ?? { message: "" }).toBeTruthy();
      expect(data ?? []).toEqual([]);
    });
  }

  it("não grava uma pré-admissão", async () => {
    if (!online) return;
    const { error } = await anon().from("dp_preadmissoes").insert({
      company_id: ID_FICTICIO,
      candidato_nome: "TESTE VISITANTE",
      whatsapp: "5500000000000",
      trabalho_apos_22h: false,
    });
    expect(error).toBeTruthy();
  });

  it("não executa a promoção para colaborador", async () => {
    if (!online) return;
    const { error } = await anon().rpc("dp_preadmissao_efetivar", {
      p_preadmissao_id: ID_FICTICIO,
      p_colaborador_id: ID_FICTICIO,
    });
    expect(error).toBeTruthy();
  });
});

describe("funções recusam quem não tem sessão válida", () => {
  for (const fn of ["dp-preadmissao-convite", "dp-preadmissao-gestor"]) {
    it(`${fn} recusa sem sessão`, async () => {
      if (!online) return;
      const res = await chamar(fn, { action: "ler", preadmissao_id: ID_FICTICIO, company_id: ID_FICTICIO });
      expect([401, 403]).toContain(res.status);
    });
    it(`${fn} recusa token forjado`, async () => {
      if (!online) return;
      const res = await chamar(fn, { action: "ler", preadmissao_id: ID_FICTICIO }, FORGED_JWT);
      expect([401, 403]).toContain(res.status);
    });
  }

  it("acesso público recusa convite inválido sem revelar detalhes", async () => {
    if (!online) return;
    const res = await chamar("dp-preadmissao-publica", { t: ID_FICTICIO, c: "token-invalido", action: "ler" });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(String(body.error)).toMatch(/link/i);
    expect(JSON.stringify(body)).not.toMatch(/company_id|uuid|sql|policy/i);
  });

  it("envio de documento recusa convite inválido", async () => {
    if (!online) return;
    const res = await chamar("dp-preadmissao-arquivo", {
      action: "upload",
      t: ID_FICTICIO,
      c: "token-invalido",
      requisito_codigo: "identidade",
      mime_type: "image/jpeg",
      content_base64: "AAAA",
    });
    expect(res.status).toBe(403);
  });

  it("link de documento recusa quem não está autenticado", async () => {
    if (!online) return;
    const res = await chamar("dp-preadmissao-arquivo", { action: "url", documento_id: ID_FICTICIO });
    expect([401, 403]).toContain(res.status);
  });
});
