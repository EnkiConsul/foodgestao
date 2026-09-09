import { supabase } from "@/integrations/supabase/client";

/**
 * Grava um registro de auditoria. Nunca lança: auditoria não pode quebrar a
 * ação do usuário. A maior parte das áreas do sistema é auditada por gatilhos
 * no banco; este helper cobre eventos que não são mudança de linha (entrada no
 * sistema, troca de senha, exportações, aprovações em lote).
 */
export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
  companyId?: string | null,
): Promise<void> {
  try {
    await supabase.rpc("insert_audit_log", {
      _action: action,
      _entity_type: entityType,
      _entity_id: entityId ?? null,
      _details: (details ?? null) as never,
      _company_id: companyId ?? null,
    });
  } catch {
    // silencioso por design
  }
}

/** Ações de acesso ao sistema (exibidas na aba "Acessos" da Auditoria). */
export const ACCESS_ACTIONS = [
  "user_signed_in",
  "user_signed_out",
  "user_session_resumed",
  "user_password_changed",
] as const;
