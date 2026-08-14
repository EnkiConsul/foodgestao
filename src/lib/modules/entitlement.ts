// Contrato do motor genérico de direito de uso por módulo.
// A decisão definitiva é sempre do backend (`can_use_module`) — fail closed.
import type { AppModule, ModuleStatus } from "@/lib/modules";

export type PermissionLevel = "none" | "view" | "edit";

export const MODULE_TRIAL_DAYS = 7;

export interface ModuleEntitlement {
  allowed: boolean;
  reason: string;
  module: AppModule | null;
  operation: string;
  role: string | null;
  status: ModuleStatus;
  effective_status: ModuleStatus | "missing_dependency";
  level: PermissionLevel;
  read_only: boolean;
  usable: boolean;
  missing_dependency: AppModule | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  days_left: number | null;
  trial_used: boolean;
}

export const DENIED_MODULE_ENTITLEMENT: ModuleEntitlement = {
  allowed: false,
  reason: "loading",
  module: null,
  operation: "",
  role: null,
  status: "not_contracted",
  effective_status: "not_contracted",
  level: "none",
  read_only: true,
  usable: false,
  missing_dependency: null,
  trial_started_at: null,
  trial_ends_at: null,
  days_left: null,
  trial_used: false,
};

/** Mensagem amigável para o motivo devolvido pelo backend. */
export function moduleReasonLabel(reason: string): string {
  switch (reason) {
    case "ok": return "Acesso liberado";
    case "loading": return "Verificando acesso...";
    case "unauthenticated": return "Sessão expirada. Faça login novamente.";
    case "no_company": return "Selecione uma empresa.";
    case "not_member": return "Você não tem vínculo com esta empresa.";
    case "not_contracted": return "Módulo não contratado.";
    case "trial_expired": return "O teste gratuito deste módulo expirou.";
    case "suspended": return "Módulo suspenso.";
    case "canceled": return "Módulo cancelado.";
    case "missing_dependency": return "Um módulo pré-requisito não está ativo.";
    case "missing_permission": return "Você não tem permissão para esta ação.";
    default: return "Acesso indisponível.";
  }
}
