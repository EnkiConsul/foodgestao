/**
 * Autorização da RPC dp_cancelar_troca.
 *
 * A rotina cancela uma troca aprovada e reverte as folgas envolvidas; só pode
 * ser executada por administrador/dono da empresa (ou super admin). Este teste
 * garante que um cliente anônimo não consegue executá-la.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

const ZERO = "00000000-0000-0000-0000-000000000000";

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

describe("dp_cancelar_troca — autorização", () => {
  it("anônimo não consegue cancelar troca", async () => {
    if (!networkAvailable) throw new Error('Backend de homologação indisponível; teste não executado.');
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anon.rpc("dp_cancelar_troca", {
      _troca_id: ZERO,
      _motivo: "tentativa não autorizada",
    });
    expect(error).not.toBeNull();
  });
});
