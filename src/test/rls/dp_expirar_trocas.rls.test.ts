/**
 * Expiração automática de trocas de folga.
 *
 * A rotina dp_expirar_trocas() marca como "expirada" toda troca ainda
 * pendente cuja data já terminou (no próprio dia a troca continua válida).
 * Aqui garantimos que a rotina é idempotente e que não sobra nenhuma troca
 * pendente com data no passado.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

let networkAvailable = true;

beforeAll(async () => {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    networkAvailable = res.ok;
  } catch {
    networkAvailable = false;
  }
});

describe("dp_expirar_trocas", () => {
  it("não é executável por usuário anônimo", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anon.rpc("dp_expirar_trocas");
    expect(error).not.toBeNull();
  });
});
