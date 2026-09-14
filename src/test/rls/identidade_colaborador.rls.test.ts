/**
 * Fase 3 — identidade do colaborador.
 *
 * Visitante não resolve identidade nenhuma, e não existe rotina pública do
 * tipo "me diga qual é o colaborador deste usuário aqui".
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const OUTRO_USER = "00000000-0000-4000-8000-0000000000aa";

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

describe("Identidade do colaborador: visitante negado", () => {
  it("não resolve o colaborador da sessão", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().rpc("dp_meu_colaborador");
    expect(error).toBeTruthy();
  });

  it("não resolve o vínculo da sessão", async () => {
    if (!networkAvailable) return;
    const { error } = await anon().rpc("dp_meu_vinculo");
    expect(error).toBeTruthy();
  });

  it("não consulta o colaborador de um usuário arbitrário", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().rpc("dp_colaborador_of", { _user_id: OUTRO_USER });
    expect(error ?? data == null).toBeTruthy();
  });

  it("não consulta o colaborador ativo de um usuário arbitrário", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().rpc("dp_colaborador_ativo_of", { _user_id: OUTRO_USER });
    expect(error ?? data == null).toBeTruthy();
  });

  it("não lê a tabela de colaboradores", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from("dp_colaboradores").select("id").limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });

  it("não lê notificações de nenhuma empresa", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from("dp_notificacoes").select("id").limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
