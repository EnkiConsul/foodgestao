import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  superAdmin: false,
  ownedCompanies: [] as { id: string }[],
  adminMemberships: [] as { role: string }[],
  isColaborador: false,
};

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const api: Record<string, unknown> = {};
    const self = () => api as never;
    Object.assign(api, {
      select: self,
      eq: self,
      in: self,
      limit: () =>
        Promise.resolve({
          data: table === "companies" ? state.ownedCompanies : state.adminMemberships,
          error: null,
        }),
      maybeSingle: () =>
        Promise.resolve({ data: state.superAdmin ? { role: "super_admin" } : null, error: null }),
    });
    return api;
  };
  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: () => Promise.resolve({ data: state.isColaborador, error: null }),
    },
  };
});

import { resolveLandingTarget, landingPathFor, PORTAL_PATH } from "@/lib/auth/landing";

beforeEach(() => {
  state.superAdmin = false;
  state.ownedCompanies = [];
  state.adminMemberships = [];
  state.isColaborador = false;
});

describe("resolveLandingTarget", () => {
  it("colaborador puro vai para o portal", async () => {
    state.isColaborador = true;
    const t = await resolveLandingTarget("u1");
    expect(t.kind).toBe("portal");
    expect(t.path).toBe(PORTAL_PATH);
  });

  it("dono da empresa vai para a área da empresa", async () => {
    state.ownedCompanies = [{ id: "c1" }];
    expect((await resolveLandingTarget("u1")).kind).toBe("empresa");
  });

  it("administrador da empresa vai para a área da empresa", async () => {
    state.adminMemberships = [{ role: "admin" }];
    expect((await resolveLandingTarget("u1")).kind).toBe("empresa");
  });

  it("super admin que também é colaborador vai para a área da empresa", async () => {
    state.superAdmin = true;
    state.isColaborador = true;
    expect((await resolveLandingTarget("u1")).kind).toBe("empresa");
  });

  it("sem vínculo nenhum cai na área da empresa (fluxo de cadastro)", async () => {
    expect((await resolveLandingTarget("u1")).kind).toBe("empresa");
  });
});

describe("landingPathFor", () => {
  const portal = { kind: "portal" as const, path: PORTAL_PATH, isAdminOrOwner: false, isColaborador: true };
  const empresa = { kind: "empresa" as const, path: "/hub", isAdminOrOwner: true, isColaborador: false };

  it("ignora redirect para área de empresa quando é colaborador", () => {
    expect(landingPathFor(portal, "/lancamentos")).toBe(PORTAL_PATH);
  });

  it("preserva redirect interno do portal", () => {
    expect(landingPathFor(portal, "/dp/meu/calendario")).toBe("/dp/meu/calendario");
  });

  it("preserva redirect para quem é da empresa", () => {
    expect(landingPathFor(empresa, "/lancamentos")).toBe("/lancamentos");
  });
});
