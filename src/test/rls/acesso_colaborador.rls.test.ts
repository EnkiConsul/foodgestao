/**
 * Fase 7 — fluxo único de acesso do colaborador.
 *
 * Verifica, sem credenciais (só chave publicável), que:
 *  - as quatro ações oficiais recusam chamada sem sessão e com token forjado;
 *  - o endpoint público de criação da própria senha só conclui com link válido;
 *  - o fluxo legado de convite não existe mais (nenhum caminho paralelo);
 *  - visitante não lê nem grava as tabelas de acesso/segurança nem os links;
 *  - nenhuma resposta devolve senha ao gestor.
 *
 * Os casos com sessão real (liberar, redefinir, bloquear, reativar, link
 * expirado, link já usado, duas tentativas simultâneas, colaborador de outra
 * empresa, conflito de conta, bloqueado sem portal) são verificados no banco —
 * ver supabase/tests/dp_acesso_colaborador.test.sql e o relatório da fase.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const ID = "00000000-0000-4000-8000-0000000000ac";

const FORGED_JWT = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiZXhwIjo0MDcwOTA4ODAwfQ",
  "ZmFrZS1zaWduYXR1cmU",
].join(".");

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

async function chamar(fn: string, body: unknown, authorization?: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

const NEGADO = [400, 401, 403, 404];

describe("Acesso do colaborador: ações do gestor exigem sessão válida", () => {
  const acoes: Array<[string, Record<string, unknown>]> = [
    ["dp-criar-acesso-colaborador", { colaborador_id: ID }],
    ["dp-reset-password", { colaborador_id: ID }],
    ["dp-bloquear-acesso-colaborador", { colaborador_id: ID, bloquear: true }],
    ["dp-bloquear-acesso-colaborador", { colaborador_id: ID, bloquear: false }],
  ];

  for (const [fn, body] of acoes) {
    it(`${fn} (${JSON.stringify(body)}) recusa sem sessão e com token forjado`, async () => {
      if (!networkAvailable) return;
      const sem = await chamar(fn, body);
      expect(NEGADO, `${fn} respondeu ${sem.status}`).toContain(sem.status);
      const forjado = await chamar(fn, body, `Bearer ${FORGED_JWT}`);
      expect(NEGADO).toContain(forjado.status);
    }, 30_000);
  }

  it("nenhuma recusa devolve senha, token ou link", async () => {
    if (!networkAvailable) return;
    for (const [fn, body] of acoes) {
      const { text } = await chamar(fn, body, `Bearer ${FORGED_JWT}`);
      const lower = text.toLowerCase();
      for (const vazamento of ["password", "senha:", "activation_url", "reset_url", "codigo"]) {
        expect(lower, `${fn} vazou "${vazamento}"`).not.toContain(vazamento);
      }
    }
  }, 60_000);
});

describe("Acesso do colaborador: criação da própria senha", () => {
  it("recusa sem link de uso único válido", async () => {
    if (!networkAvailable) return;
    const r = await chamar("dp-alterar-senha-colaborador", {
      cpf: "00000000000",
      token_id: ID,
      codigo: "AAAAAAAAAAAA",
      purpose: "activation",
      nova_senha: "Abcdef1!xyz",
    });
    expect(NEGADO).toContain(r.status);
  }, 30_000);

  it("recusa finalidade inválida", async () => {
    if (!networkAvailable) return;
    const r = await chamar("dp-alterar-senha-colaborador", {
      cpf: "00000000000",
      token_id: ID,
      codigo: "AAAAAAAAAAAA",
      purpose: "qualquer",
      nova_senha: "Abcdef1!xyz",
    });
    expect(NEGADO).toContain(r.status);
  }, 30_000);
});

describe("Acesso do colaborador: fluxo legado desativado", () => {
  it("dp-invite-colaborador não existe mais", async () => {
    if (!networkAvailable) return;
    const r = await chamar("dp-invite-colaborador", { colaborador_id: ID, email: "x@y.com" });
    expect([404, 401, 403]).toContain(r.status);
  }, 30_000);
});

describe("Acesso do colaborador: visitante negado nas tabelas", () => {
  const tabelas = ["auth_user_security_state", "dp_portal_access_tokens", "auth_login_identifiers"];

  for (const t of tabelas) {
    it(`não lê ${t}`, async () => {
      if (!networkAvailable) return;
      const { data, error } = await anon().from(t as never).select("*").limit(1);
      expect(error || (data ?? []).length === 0).toBeTruthy();
    });

    it(`não grava em ${t}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon()
        .from(t as never)
        .insert({ user_id: ID } as never);
      expect(error).toBeTruthy();
    });
  }

  it("não consulta a situação de acesso de terceiros", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().rpc("dp_portal_acesso_status" as never, {
      p_colaborador_id: ID,
    } as never);
    expect(error).toBeTruthy();
  });
});
