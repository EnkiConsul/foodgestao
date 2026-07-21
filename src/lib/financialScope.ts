// Helper centralizado para escopo de consultas financeiras (PF/PJ).
// PF → dados pertencem ao usuário (user_id + company_id IS NULL).
// PJ → dados pertencem à empresa (company_id); user_id é apenas autor.
//
// Uso:
//   const scope = assertFinancialScope({ context, userId, companyId });
//   const { data } = await applyFinancialScope(
//     supabase.from("transactions").select("*"),
//     scope,
//   );

export type ContextType = "pf" | "pj";

export type FinancialScope =
  | { context: "pf"; userId: string; companyId: null }
  | { context: "pj"; userId: string; companyId: string };

export class FinancialScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialScopeError";
  }
}

export function assertFinancialScope(params: {
  context: ContextType;
  userId: string | null | undefined;
  companyId?: string | null;
}): FinancialScope {
  if (!params.userId) {
    throw new FinancialScopeError("Usuário não autenticado");
  }
  if (params.context === "pf") {
    return { context: "pf", userId: params.userId, companyId: null };
  }
  if (!params.companyId) {
    throw new FinancialScopeError("Contexto PJ requer uma empresa selecionada");
  }
  return { context: "pj", userId: params.userId, companyId: params.companyId };
}

/**
 * Aplica os filtros de propriedade financeira em um query builder Supabase.
 * Não filtra por user_id em PJ — a RLS garante o isolamento entre empresas
 * e todos os membros autorizados devem ver a mesma base.
 */
export function applyFinancialScope<T extends {
  eq: (col: string, value: unknown) => T;
  is: (col: string, value: unknown) => T;
}>(query: T, scope: FinancialScope): T {
  if (scope.context === "pf") {
    return query
      .eq("context", "pf")
      .eq("user_id", scope.userId)
      .is("company_id", null);
  }
  return query
    .eq("context", "pj")
    .eq("company_id", scope.companyId);
}

/** true quando é seguro montar consultas financeiras para o contexto. */
export function isFinancialScopeReady(
  context: ContextType,
  userId: string | null | undefined,
  companyId: string | null | undefined,
): boolean {
  if (!userId) return false;
  if (context === "pf") return true;
  return !!companyId;
}
