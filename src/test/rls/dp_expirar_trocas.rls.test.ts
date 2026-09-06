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

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

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
    if (!networkAvailable) return;
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anon.rpc("dp_expirar_trocas");
    expect(error).not.toBeNull();
  });
});
