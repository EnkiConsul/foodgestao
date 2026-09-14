/**
 * Fase 8 — política de acesso ao Portal do Colaborador.
 *
 * Verifica, sem credenciais (só chave publicável), que a decisão central e as
 * operações do portal ficam fechadas para quem não tem sessão — inclusive o
 * caminho "API direta", que é a forma de tentar contornar o modo somente
 * documentos sem passar pela tela.
 *
 * Os casos com estado real (ativo, desligado há 1/29/30/31 dias, bloqueado,
 * documentos próprios x de terceiros) são verificados no banco —
 * ver supabase/tests/dp_portal_acesso.test.sql.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const UUID = "00000000-0000-4000-8000-0000000000d8";

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

describe("Fase 8 — acesso ao portal (visitante)", () => {
  it("decisão de acesso não responde a visitante", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().rpc("dp_meu_acesso_portal");
    const vazio = !data || (Array.isArray(data) && data.length === 0);
    expect(!!error || vazio).toBe(true);
  });

  it("decisão interna não é executável por visitante", async () => {
    if (!networkAvailable) return;
    for (const fn of ["dp_portal_decisao", "dp_pode_agir", "dp_pode_ver_documentos"]) {
      const { error } = await anon().rpc(fn as never, { _user_id: UUID } as never);
      expect(error).toBeTruthy();
    }
  });

  it("operações do portal recusam chamada direta sem sessão", async () => {
    if (!networkAvailable) return;
    const rpcs: [string, Record<string, unknown>][] = [
      ["dp_folga_solicitar", { _data: "2026-12-01" }],
      ["dp_ferias_solicitar", { _inicio: "2026-12-01", _dias: 10 }],
      ["dp_troca_propor", { _troca_id: UUID }],
      ["dp_convocacao_responder_oferta", { _convocacao_id: UUID }],
      ["dp_solicitacao_cancelar", { _solicitacao_id: UUID }],
    ];
    for (const [fn, args] of rpcs) {
      const { error } = await anon().rpc(fn as never, args as never);
      expect(error).toBeTruthy();
    }
  });

  it("visitante não lê documentos nem colaboradores", async () => {
    if (!networkAvailable) return;
    for (const t of ["dp_documentos", "dp_colaboradores", "auth_user_security_state"]) {
      const { data, error } = await anon().from(t).select("id").limit(1);
      expect(!!error || (data ?? []).length === 0).toBe(true);
    }
  });
});
