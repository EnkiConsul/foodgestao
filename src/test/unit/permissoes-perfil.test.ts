import { describe, it, expect } from "vitest";
import { resolvePermission, canCreate, canDelete } from "@/lib/permissions";
import { itemDaRota } from "@/lib/permissionRoutes";

describe("permissões por perfil", () => {
  it("dono e administrador têm acesso total", () => {
    expect(resolvePermission("owner", {}, "dp.folgas")).toBe("total");
    expect(resolvePermission("admin", {}, "transactions")).toBe("total");
  });
  it("bloqueado perde tudo", () => {
    expect(resolvePermission("admin", {}, "transactions", undefined, "bloqueado")).toBe("none");
  });
  it("módulo desligado zera os itens", () => {
    expect(resolvePermission("member", { transactions: "total" }, "transactions", { financeiro: false })).toBe("none");
  });
  it("membro antigo sem matriz mantém o Financeiro", () => {
    expect(resolvePermission("member", {}, "transactions")).toBe("total");
    expect(resolvePermission("member", {}, "dp.folgas")).toBe("none");
  });
  it("níveis controlam incluir e excluir", () => {
    const lvl = resolvePermission("member", { "dp.folgas": "inclusao" }, "dp.folgas");
    expect(canCreate(lvl)).toBe(true);
    expect(canDelete(lvl)).toBe(false);
  });
  it("mapeia rotas para itens", () => {
    expect(itemDaRota("/lancamentos")).toBe("transactions");
    expect(itemDaRota("/relatorios/fluxo-caixa")).toBe("cash_flow");
    expect(itemDaRota("/dp/folgas/aprovar")).toBe("dp.folgas");
    expect(itemDaRota("/dp/meu/escala")).toBeNull();
    expect(itemDaRota("/hub")).toBeNull();
  });
});
