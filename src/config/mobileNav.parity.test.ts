import { describe, expect, it } from "vitest";
import { MODULE_NAV, type NavLeaf } from "./mobileNav";
import {
  DP_ADMIN_NAV,
  DP_PORTAL_NAV,
  surfaceRoutes,
  surfaceShortcuts,
} from "./dpNavigation";
import { resolveActiveRoute } from "@/lib/nav-active";

/**
 * Guarda de paridade: sidebar desktop e menu "Mais" mobile derivam da mesma
 * config (`dpNavigation.tsx`). O teste garante que o menu mobile continua
 * expondo todas as rotas navegáveis e que os grupos não têm duplicidades.
 */

function mobileRoutes(moduleKey: "dp" | "portal_colaborador"): string[] {
  const config = MODULE_NAV[moduleKey];
  const leaves: NavLeaf[] = config.moreGroups.flatMap((g) => [
    ...(g.items ?? []),
    ...(g.subgroups ?? []).flatMap((sg) => sg.items),
  ]);
  return [config.home.to, ...leaves.map((l) => l.to)];
}

describe("paridade sidebar DP x menu Mais (mobile)", () => {
  it("admin: menu Mais cobre todas as rotas navegáveis do DP", () => {
    const mobile = new Set(mobileRoutes("dp"));
    const missing = surfaceRoutes(DP_ADMIN_NAV).filter((r) => !mobile.has(r));
    expect(missing).toEqual([]);
  });

  it("portal: menu Mais cobre todas as rotas navegáveis do colaborador", () => {
    const mobile = new Set(mobileRoutes("portal_colaborador"));
    const missing = surfaceRoutes(DP_PORTAL_NAV).filter((r) => !mobile.has(r));
    expect(missing).toEqual([]);
  });

  it("não há rota repetida entre grupos", () => {
    for (const key of ["dp", "portal_colaborador"] as const) {
      const routes = mobileRoutes(key);
      const dupes = routes.filter((r, i) => routes.indexOf(r) !== i);
      expect(dupes, `rotas duplicadas em ${key}`).toEqual([]);
    }
  });

  it("atalhos da BottomNav apontam para rotas conhecidas", () => {
    const admin = new Set([
      ...surfaceRoutes(DP_ADMIN_NAV),
      ...DP_ADMIN_NAV.extraShortcuts.map((s) => s.to),
    ]);
    expect(surfaceShortcuts(DP_ADMIN_NAV).filter((s) => !admin.has(s.to))).toEqual([]);
    const portal = new Set(surfaceRoutes(DP_PORTAL_NAV));
    expect(surfaceShortcuts(DP_PORTAL_NAV).filter((s) => !portal.has(s.to))).toEqual([]);
  });

  it("apenas o item mais específico fica ativo", () => {
    const routes = surfaceRoutes(DP_ADMIN_NAV);
    expect(resolveActiveRoute("/dp/escalas/mes", routes)).toBe("/dp/escalas/mes");
    expect(resolveActiveRoute("/dp/colaboradores/12", routes)).toBe("/dp/colaboradores");

    expect(resolveActiveRoute("/dp", routes)).toBe("/dp");
  });
});
