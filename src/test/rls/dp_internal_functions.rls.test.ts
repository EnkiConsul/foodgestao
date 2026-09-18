/**
 * P0.4 — rotinas internas do módulo Pessoas 360° fechadas.
 *
 * Estratégia: a verificação é feita SOMENTE por leitura do catálogo do banco
 * (pg_proc / aclexplode / pg_trigger) via `psql`. Nenhuma rotina de negócio é
 * chamada — em especial as globais (`dp_escala_auto_gerar_todas`,
 * `dp_folga_autoatribuir_todas`), que gravariam dados reais caso houvesse
 * regressão de permissão. O catálogo é a fonte autoritativa do grant, então a
 * prova é mais forte que um HTTP 4xx (que pode ser 429/500 e não comprova nada).
 *
 * Quando não há banco disponível os casos são marcados como SKIPPED pelo
 * Vitest (nunca "passed" silenciosamente).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { validateCatalogEnvironment } from "../../../scripts/test-target-safety.mjs";

const DB_AVAILABLE = (() => {
  if (!process.env.PGHOST && !process.env.PGDATABASE) return false;
  validateCatalogEnvironment(process.env);
  try {
    execFileSync("psql", ["-At", "-c", "select 1"], { timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
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

/** Grants efetivos da rotina, por papel. */
function grants(proname: string): Record<string, string[]> {
  const rows = q(`
    select p.proname || '|' || coalesce(a.grantee::regrole::text,'-') || '|' || coalesce(a.privilege_type,'-')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      left join aclexplode(p.proacl) a on true
     where n.nspname = 'public' and p.proname = '${proname}'
  `);
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    const [, grantee, priv] = r.split("|");
    (map[grantee] ??= []).push(priv);
  }
  return map;
}

/** Rotinas internas fechadas nesta fase (inclui as 2 usadas como trigger). */
const ROTINAS_INTERNAS = [
  "dp_bulk_increment_processed",
  "dp_escala_auto_gerar",
  "dp_escala_auto_gerar_todas",
  "dp_folga_autoatribuir_todas",
  "dp_folga_autoatribuir_competencia",
  "dp_folga_autoatribuir_manual",
  "dp_folga_autoatribuicao_previa",
  "dp_escala_item_validar_setor",
  "dp_folgas_validar_unificado",
] as const;

/** RPCs app-facing preservadas (autorização de admin/dono é feita no banco). */
const ROTINAS_APP = ["dp_folga_autoatribuicao_plano", "dp_folga_autoatribuir_aplicar"] as const;

const d = describe.skipIf(!DB_AVAILABLE);

d("P0.4: rotinas internas de Pessoas fechadas para anon/authenticated/PUBLIC", () => {
  for (const nome of ROTINAS_INTERNAS) {
    it(`${nome}: sem EXECUTE para anon, authenticated e PUBLIC; service_role preservado`, () => {
      const g = grants(nome);
      expect(Object.keys(g)).not.toHaveLength(0); // a rotina precisa existir
      expect(g.anon ?? []).not.toContain("EXECUTE");
      expect(g.authenticated ?? []).not.toContain("EXECUTE");
      expect(g["-"] ?? []).not.toContain("EXECUTE"); // PUBLIC
      expect(g.public ?? []).not.toContain("EXECUTE");
      expect(g.service_role ?? []).toContain("EXECUTE");
    });
  }
});

d("P0.4: rotinas internas seguem SECURITY DEFINER com search_path explícito", () => {
  for (const nome of ROTINAS_INTERNAS) {
    it(`${nome}: definer + search_path`, () => {
      const [row] = q(`
        select p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig,','),'')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='${nome}' limit 1
      `);
      expect(row).toBeDefined();
      const [secdef, config] = row.split("|");
      expect(secdef).toBe("true");
      expect(config).toMatch(/search_path=/);
    });
  }
});

d("P0.4: gatilhos que dependem das rotinas internas continuam ativos", () => {
  it("dp_escala_item_validar_setor e dp_folgas_validar_unificado seguem ligados a gatilhos habilitados", () => {
    const rows = q(`
      select p.proname || '|' || t.tgname || '|' || t.tgenabled::text
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
       where not t.tgisinternal
         and p.proname in ('dp_escala_item_validar_setor','dp_folgas_validar_unificado')
    `);
    const fns = new Set(rows.map((r) => r.split("|")[0]));
    expect(fns.has("dp_escala_item_validar_setor")).toBe(true);
    expect(fns.has("dp_folgas_validar_unificado")).toBe(true);
    for (const r of rows) expect(r.split("|")[2]).toBe("O"); // O = habilitado
  });
});

d("P0.4: cadeia interna preservada (globais chamam as rotinas por empresa/competência)", () => {
  it("dp_escala_auto_gerar_todas chama dp_escala_auto_gerar", () => {
    const [row] = q(
      `select (prosrc ~ 'dp_escala_auto_gerar\\(')::text from pg_proc where proname='dp_escala_auto_gerar_todas' limit 1`,
    );
    expect(row).toBe("true");
  });
  it("dp_folga_autoatribuir_todas chama dp_folga_autoatribuir_competencia", () => {
    const [row] = q(
      `select (prosrc ~ 'dp_folga_autoatribuir_competencia')::text from pg_proc where proname='dp_folga_autoatribuir_todas' limit 1`,
    );
    expect(row).toBe("true");
  });
});

d("P0.4: RPCs app-facing preservadas para usuário logado", () => {
  for (const nome of ROTINAS_APP) {
    it(`${nome}: EXECUTE mantido para authenticated e service_role, negado para anon`, () => {
      const g = grants(nome);
      expect(g.authenticated ?? []).toContain("EXECUTE");
      expect(g.service_role ?? []).toContain("EXECUTE");
      expect(g.anon ?? []).not.toContain("EXECUTE");
    });
    it(`${nome}: exige admin/dono da empresa dentro do banco`, () => {
      const [row] = q(
        `select (prosrc ~ 'is_company_admin_or_owner|FORBIDDEN|has_role')::text from pg_proc where proname='${nome}' limit 1`,
      );
      expect(row).toBe("true");
    });
  }
});

d("P0.4: política de titularidade de companies com WITH CHECK restritivo", () => {
  it("a policy de UPDATE exige dono atual, próprio dono ou super admin no WITH CHECK", () => {
    const [row] = q(
      `select coalesce(with_check,'') from pg_policies where tablename='companies' and cmd='UPDATE' limit 1`,
    );
    expect(row).toBeDefined();
    expect(row).toMatch(/company_owner_snapshot/);
    expect(row).toMatch(/is_super_admin/);
  });
});
