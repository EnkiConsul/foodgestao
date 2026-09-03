/**
 * Regressão de RLS para `credit_cards`.
 *
 * Depois do ajuste de escopo por empresa, um cartão empresarial só é visível
 * para membros daquela empresa. Aqui garantimos o piso: cliente anônimo não lê
 * nem escreve cartões. Cenários autenticados por empresa vivem em
 * `src/test/tenancy/`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

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

describe("RLS: credit_cards", () => {
  it("bloqueia SELECT anônimo", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from("credit_cards").select("id").limit(1);
    if (error) expect(error).toBeTruthy();
    else expect(data?.length ?? 0).toBe(0);
  });

  it("bloqueia INSERT anônimo", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("credit_cards")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        context: "pj",
        company_id: "00000000-0000-0000-0000-000000000000",
        brand: "visa",
        closing_day: 1,
        due_day: 10,
      })
      .select("id");
    expect(error || (data?.length ?? 0) === 0).toBeTruthy();
  });
});
