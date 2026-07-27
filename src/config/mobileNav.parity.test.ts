import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_NAV, type NavLeaf } from "./mobileNav";

/**
 * Guarda de paridade: toda rota presente na sidebar desktop do DP precisa
 * existir também no menu "Mais" do mobile (MODULE_NAV.dp / .portal_colaborador).
 */

const sidebarSource = readFileSync(
  path.resolve(__dirname, "../components/dp/DpSidebar.tsx"),
  "utf-8",
);

function sidebarRoutes(constName: string): string[] {
  const start = sidebarSource.indexOf(`const ${constName}: Item[] = [`);
  expect(start, `${constName} não encontrado em DpSidebar.tsx`).toBeGreaterThan(-1);
  const nextConst = sidebarSource.indexOf("\nconst ", start + 1);
  const block = sidebarSource.slice(start, nextConst === -1 ? undefined : nextConst);
  return [...block.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
}

function mobileRoutes(moduleKey: "dp" | "portal_colaborador"): string[] {
  const config = MODULE_NAV[moduleKey];
  const leaves: NavLeaf[] = config.moreGroups.flatMap((g) => [
    ...(g.items ?? []),
    ...(g.subgroups ?? []).flatMap((sg) => sg.items),
  ]);
  return [
    config.home.to,
    ...leaves.map((l) => l.to),
    ...config.shortcutOptions.map((s) => s.to),
  ];
}

describe("paridade sidebar DP x menu Mais (mobile)", () => {
  it("admin: nenhuma rota da sidebar fica de fora do menu Mais", () => {
    const mobile = new Set(mobileRoutes("dp"));
    const missing = sidebarRoutes("ADMIN_ITEMS").filter((r) => !mobile.has(r));
    expect(missing).toEqual([]);
  });

  it("portal do colaborador: nenhuma rota da sidebar fica de fora do menu Mais", () => {
    const mobile = new Set(mobileRoutes("portal_colaborador"));
    const missing = sidebarRoutes("PORTAL_ITEMS").filter((r) => !mobile.has(r));
    expect(missing).toEqual([]);
  });
});
