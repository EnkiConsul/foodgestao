// Espelho (somente para UI) das regras de direito de uso do módulo Pedidos.
// A decisão definitiva é sempre do backend (`can_use_orders_module`).
import type { ModuleStatus } from "@/lib/modules";
import {
  ordersOperationRequiresEdit,
  type OrdersPermissionKey,
} from "@/lib/orders/permissions";

export type PermissionLevel = "none" | "view" | "edit";

export const ORDERS_TRIAL_DAYS = 7;

export interface OrdersEntitlement {
  allowed: boolean;
  reason: string;
  operation: string;
  role: string | null;
  status: ModuleStatus;
  effective_status: ModuleStatus;
  level: PermissionLevel;
  read_only: boolean;
  usable: boolean;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  days_left: number | null;
  trial_used: boolean;
}

export const DENIED_ENTITLEMENT: OrdersEntitlement = {
  allowed: false,
  reason: "loading",
  operation: "orders.dashboard",
  role: null,
  status: "not_contracted",
  effective_status: "not_contracted",
  level: "none",
  read_only: true,
  usable: false,
  trial_started_at: null,
  trial_ends_at: null,
  days_left: null,
  trial_used: false,
};

/** Reproduz a expiração de trial no cliente (o backend refaz o cálculo). */
export function effectiveOrdersStatus(
  status: ModuleStatus,
  trialEndsAt: string | null,
  now: Date = new Date(),
): ModuleStatus {
  if (status === "trial" && trialEndsAt && new Date(trialEndsAt).getTime() <= now.getTime()) {
    return "trial_expirado";
  }
  return status;
}

/** Dias corridos restantes (arredondado para cima), nunca negativo. */
export function ordersTrialDaysLeft(
  trialEndsAt: string | null,
  now: Date = new Date(),
): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Modo consulta: módulo já contratado antes, mas sem direito de escrita. */
export function isOrdersReadOnlyMode(status: ModuleStatus): boolean {
  return status === "trial_expirado" || status === "suspended" || status === "canceled";
}

/**
 * Decide o acesso a uma operação. Fail closed: qualquer dado ausente nega.
 */
export function resolveOrdersAccess(input: {
  operation: OrdersPermissionKey;
  status: ModuleStatus;
  trialEndsAt: string | null;
  level: PermissionLevel;
  now?: Date;
}): { allowed: boolean; readOnly: boolean; effectiveStatus: ModuleStatus } {
  const effectiveStatus = effectiveOrdersStatus(input.status, input.trialEndsAt, input.now);
  const usable = effectiveStatus === "active" || effectiveStatus === "trial";
  const needsEdit = ordersOperationRequiresEdit(input.operation);
  const readOnly = !usable || input.level !== "edit";

  if (!usable) {
    return {
      allowed:
        isOrdersReadOnlyMode(effectiveStatus) &&
        !needsEdit &&
        (input.level === "view" || input.level === "edit"),
      readOnly: true,
      effectiveStatus,
    };
  }
  return {
    allowed: needsEdit ? input.level === "edit" : input.level !== "none",
    readOnly,
    effectiveStatus,
  };
}
