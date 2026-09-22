/**
 * Fase 4 — Concorrência de férias.
 *
 * Verificação por leitura do catálogo do banco (fonte autoritativa) mais os
 * casos de visitante sem sessão pela API pública:
 *  - férias e períodos aquisitivos não aceitam gravação direta do aplicativo;
 *  - a regra de exclusão impede duas férias ativas sobrepostas do mesmo colaborador;
 *  - a conferência central existe em uma única versão (com modo de pedido);
 *  - as rotinas internas de fila, regras e cobertura ficam fora da API.
 *
 * Os casos com sessão (duas aprovações simultâneas, saldo, cobertura mínima,
 * duplo clique, outra empresa) são verificados no banco com sessão simulada em
 * transação desfeita — ver o relatório da fase.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const ID = "00000000-0000-4000-8000-0000000000cf";

const DB_AVAILABLE = (() => {
  if (!process.env.PGHOST && !process.env.PGDATABASE) return false;
  try {
    execFileSync("psql", ["-At", "-c", "select 1"], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
})();

function q(sql: string): string[] {
  const out = execFileSync("psql", ["-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.trim().length ? out.trim().split("\n") : [];
}

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

describe("Férias: visitante não grava nem lê", () => {
  for (const tabela of ["dp_ferias_gozos", "dp_ferias_periodos"]) {
    it(`não lê ${tabela}`, async () => {
      if (!networkAvailable) return;
      const { data, error } = await anon().from(tabela as never).select("id").limit(1);
      expect(error ?? (data ?? []).length === 0).toBeTruthy();
    });

    it(`não grava em ${tabela}`, async () => {
      if (!networkAvailable) return;
      const { error } = await anon()
        .from(tabela as never)
        .insert({ id: ID } as never);
      expect(error).toBeTruthy();
    });
  }
});

describe.skipIf(!DB_AVAILABLE)("Férias: gravação direta fechada no banco", () => {
  const privilegios = (tabela: string) =>
    q(`
      select coalesce(a.grantee::regrole::text,'-') || '|' || a.privilege_type
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join aclexplode(c.relacl) a on true
       where n.nspname = 'public' and c.relname = '${tabela}'
    `);

  for (const tabela of ["dp_ferias_gozos", "dp_ferias_periodos"]) {
    it(`${tabela}: usuário autenticado só lê`, () => {
      const linhas = privilegios(tabela).filter((l) => l.startsWith("authenticated|"));
      expect(linhas).toContain("authenticated|SELECT");
      for (const proibido of ["INSERT", "UPDATE", "DELETE"]) {
        expect(linhas).not.toContain(`authenticated|${proibido}`);
      }
    });

    it(`${tabela}: visitante sem nenhum privilégio`, () => {
      expect(privilegios(tabela).filter((l) => l.startsWith("anon|"))).toHaveLength(0);
    });
  }

  it("férias sobrepostas do mesmo colaborador são impossíveis", () => {
    const [def] = q(`
      select pg_get_constraintdef(c.oid)
        from pg_constraint c join pg_class t on t.oid = c.conrelid
       where t.relname = 'dp_ferias_gozos'
         and c.conname = 'dp_ferias_gozos_sem_sobreposicao'
    `);
    expect(def).toBeTruthy();
    expect(def).toContain("colaborador_id WITH =");
    expect(def).toContain("&&");
    expect(def).toContain("cancelado");
  });

  it("a conferência central existe em uma única versão, com modo de pedido", () => {
    const assinaturas = q(`
      select p.oid::regprocedure::text
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'dp_ferias_validar_programacao'
    `);
    expect(assinaturas).toHaveLength(1);
    expect(assinaturas[0]).toContain("text)");
  });

  it("rotinas internas de férias ficam fora da API", () => {
    const expostas = q(`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private'
         and p.proname in ('dp_ferias_fila','dp_ferias_regras_check','dp_ferias_cobertura_descoberta')
         and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    `);
    expect(expostas).toHaveLength(0);
  });
});
