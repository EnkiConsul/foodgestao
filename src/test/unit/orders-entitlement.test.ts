import { describe, expect, it } from "vitest";
import {
  ORDERS_PERMISSION_KEYS,
  ordersOperationRequiresEdit,
  isOrdersPermissionKey,
} from "@/lib/orders/permissions";
import {
  effectiveOrdersStatus,
  ordersTrialDaysLeft,
  resolveOrdersAccess,
  ORDERS_TRIAL_DAYS,
} from "@/lib/orders/entitlement";
import { getDefaultPermissions, resolvePermission } from "@/lib/permissions";

const NOW = new Date("2026-08-05T18:00:00Z");
const trialEnd = new Date(NOW.getTime() + ORDERS_TRIAL_DAYS * 86_400_000).toISOString();

describe("chaves canônicas de Pedidos", () => {
  it("tem 12 chaves únicas com prefixo orders.", () => {
    expect(ORDERS_PERMISSION_KEYS).toHaveLength(12);
    expect(new Set(ORDERS_PERMISSION_KEYS).size).toBe(12);
    ORDERS_PERMISSION_KEYS.forEach((k) => expect(k.startsWith("orders.")).toBe(true));
  });

  it("apenas dashboard e reports são operações de leitura", () => {
    expect(ordersOperationRequiresEdit("orders.dashboard")).toBe(false);
    expect(ordersOperationRequiresEdit("orders.reports")).toBe(false);
    expect(ordersOperationRequiresEdit("orders.accept")).toBe(true);
    expect(isOrdersPermissionKey("orders.foo")).toBe(false);
  });

  it("member sem chave recebe none (nunca edit)", () => {
    expect(resolvePermission("member", {}, "orders.accept")).toBe("none");
    expect(resolvePermission("member", {}, "transactions")).toBe("edit");
    expect(getDefaultPermissions("member")["orders.manage"]).toBe("none");
    expect(getDefaultPermissions("owner")["orders.manage"]).toBe("edit");
  });
});

describe("trial de 7 dias", () => {
  it("dura exatamente 7 dias e não sofre com fuso horário", () => {
    expect(ordersTrialDaysLeft(trialEnd, NOW)).toBe(ORDERS_TRIAL_DAYS);
    const sameInstantOtherOffset = "2026-08-12T15:00:00-03:00";
    expect(ordersTrialDaysLeft(sameInstantOtherOffset, NOW)).toBe(ORDERS_TRIAL_DAYS);
  });

  it("expira o trial quando a data final passa", () => {
    expect(effectiveOrdersStatus("trial", trialEnd, NOW)).toBe("trial");
    const after = new Date(new Date(trialEnd).getTime() + 1000);
    expect(effectiveOrdersStatus("trial", trialEnd, after)).toBe("trial_expirado");
    expect(ordersTrialDaysLeft(trialEnd, after)).toBe(0);
  });
});

describe("direito de uso (fail closed)", () => {
  it("trial ativo libera todas as operações para nível edit", () => {
    for (const op of ORDERS_PERMISSION_KEYS) {
      const r = resolveOrdersAccess({ operation: op, status: "trial", trialEndsAt: trialEnd, level: "edit", now: NOW });
      expect(r.allowed).toBe(true);
      expect(r.readOnly).toBe(false);
    }
  });

  it("módulo não contratado nega até leitura", () => {
    const r = resolveOrdersAccess({ operation: "orders.dashboard", status: "not_contracted", trialEndsAt: null, level: "edit", now: NOW });
    expect(r.allowed).toBe(false);
  });

  it("trial expirado entra em modo consulta e bloqueia novas operações", () => {
    const after = new Date(new Date(trialEnd).getTime() + 1000);
    const read = resolveOrdersAccess({ operation: "orders.dashboard", status: "trial", trialEndsAt: trialEnd, level: "edit", now: after });
    expect(read.allowed).toBe(true);
    expect(read.readOnly).toBe(true);
    const write = resolveOrdersAccess({ operation: "orders.accept", status: "trial", trialEndsAt: trialEnd, level: "edit", now: after });
    expect(write.allowed).toBe(false);
  });

  it("nível none nega e nível view nega escrita", () => {
    expect(resolveOrdersAccess({ operation: "orders.dashboard", status: "active", trialEndsAt: null, level: "none", now: NOW }).allowed).toBe(false);
    expect(resolveOrdersAccess({ operation: "orders.cancel", status: "active", trialEndsAt: null, level: "view", now: NOW }).allowed).toBe(false);
    expect(resolveOrdersAccess({ operation: "orders.reports", status: "active", trialEndsAt: null, level: "view", now: NOW }).allowed).toBe(true);
  });

  it("suspensão bloqueia escrita mas mantém consulta", () => {
    const r = resolveOrdersAccess({ operation: "orders.manage", status: "suspended", trialEndsAt: null, level: "edit", now: NOW });
    expect(r.allowed).toBe(false);
    const c = resolveOrdersAccess({ operation: "orders.reports", status: "suspended", trialEndsAt: null, level: "edit", now: NOW });
    expect(c.allowed).toBe(true);
  });
});
