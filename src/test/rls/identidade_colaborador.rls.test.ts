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

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

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
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { error } = await anon().rpc("dp_meu_colaborador");
    expect(error).toBeTruthy();
  });

  it("não resolve o vínculo da sessão", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { error } = await anon().rpc("dp_meu_vinculo");
    expect(error).toBeTruthy();
  });

  it("não consulta o colaborador de um usuário arbitrário", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon().rpc("dp_colaborador_of", { _user_id: OUTRO_USER });
    expect(error ?? data == null).toBeTruthy();
  });

  it("não consulta o colaborador ativo de um usuário arbitrário", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon().rpc("dp_colaborador_ativo_of", { _user_id: OUTRO_USER });
    expect(error ?? data == null).toBeTruthy();
  });

  it("não lê a tabela de colaboradores", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon().from("dp_colaboradores").select("id").limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });

  it("não lê notificações de nenhuma empresa", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const { data, error } = await anon().from("dp_notificacoes").select("id").limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });
});
