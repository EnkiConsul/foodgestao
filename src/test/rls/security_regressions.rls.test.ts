/**
 * Regressões de segurança já corrigidas — devem permanecer fechadas.
 *
 * 1. `app_hidden_screens_public_select`: config de telas em desenvolvimento
 *    não pode ser lida (nem escrita) por visitantes anônimos.
 * 2. `dp_documentos_storage_member_read_bypass`: o bucket `dp-documentos`
 *    não pode ser listado/baixado sem autenticação e sem vínculo.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
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

const anon = () =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

describe("Regressão: app_hidden_screens_public_select", () => {
  it("bloqueia SELECT anônimo em app_hidden_screens", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().from("app_hidden_screens").select("enabled").limit(1);
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data?.length ?? 0).toBe(0);
    }
  });

  it("bloqueia UPSERT anônimo em app_hidden_screens", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .from("app_hidden_screens")
      .upsert({ singleton: true, enabled: false, routes: [] } as never, {
        onConflict: "singleton",
      })
      .select();
    expect(data == null || data.length === 0).toBe(true);
    expect(error).toBeTruthy();
  });
});

describe("Regressão: dp_documentos_storage_member_read_bypass", () => {
  it("bloqueia listagem anônima do bucket dp-documentos", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon().storage.from("dp-documentos").list();
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data?.length ?? 0).toBe(0);
    }
  });

  it("não expõe URL pública utilizável (bucket privado)", async () => {
    if (!networkAvailable) return;
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/public/dp-documentos/probe.pdf`,
      { headers: { apikey: ANON_KEY } },
    );
    expect(res.ok).toBe(false);
  });

  it("bloqueia signed URL anônima em dp-documentos", async () => {
    if (!networkAvailable) return;
    const { data, error } = await anon()
      .storage.from("dp-documentos")
      .createSignedUrl("probe/probe.pdf", 60);
    expect(data?.signedUrl).toBeFalsy();
    expect(error).toBeTruthy();
  });

  it(
    "bloqueia upload anônimo em dp-documentos",
    async () => {
      if (!networkAvailable) return;
      const { error } = await anon()
        .storage.from("dp-documentos")
        .upload(`probe/${Date.now()}.txt`, new Blob(["probe"]));
      expect(error).toBeTruthy();
    },
    20000,
  );

});
