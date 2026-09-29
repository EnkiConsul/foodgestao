import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  atLeast,
  resolvePermission,
  type CompanyRole,
  type PermissionLevel,
  type PermissionsMap,
  type ModulosMap,
} from "@/lib/permissions";

export interface EmpresaAssinaturaAcesso {
  companyId: string;
  nivel: PermissionLevel;
}

/**
 * Empresas em que o usuário conectado pode acessar planos, assinatura e faturas.
 * Dono da empresa contratante tem acesso total; demais usuários seguem a permissão
 * "Assinatura e Faturas" (conta.assinatura) concedida pelo dono na Gestão de Usuários.
 */
export function useAssinaturaAcesso() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["assinatura-acesso", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<EmpresaAssinaturaAcesso[]> => {
      const [donas, vinculos] = await Promise.all([
        supabase.from("companies").select("id").eq("user_id", user!.id).eq("is_active", true),
        supabase
          .from("company_members")
          .select("company_id, role, permissions, modulos, situacao")
          .eq("user_id", user!.id),
      ]);
      if (donas.error) throw donas.error;
      if (vinculos.error) throw vinculos.error;

      const mapa = new Map<string, PermissionLevel>();
      (donas.data ?? []).forEach((c) => mapa.set(c.id, "total"));
      (vinculos.data ?? []).forEach((m) => {
        if (mapa.get(m.company_id) === "total") return;
        const nivel = resolvePermission(
          m.role as CompanyRole,
          m.permissions as PermissionsMap | null,
          "conta.assinatura",
          m.modulos as Partial<ModulosMap> | null,
          m.situacao,
        );
        if (nivel !== "none") mapa.set(m.company_id, nivel);
      });

      return [...mapa.entries()].map(([companyId, nivel]) => ({ companyId, nivel }));
    },
  });

  const lista = query.data ?? [];
  const nivelDe = (companyId?: string | null): PermissionLevel =>
    (companyId && lista.find((e) => e.companyId === companyId)?.nivel) || "none";

  return {
    ...query,
    empresas: lista,
    idsVisiveis: lista.filter((e) => atLeast(e.nivel, "consulta")).map((e) => e.companyId),
    idsContratacao: lista.filter((e) => atLeast(e.nivel, "inclusao")).map((e) => e.companyId),
    nivelDe,
    podeVer: lista.some((e) => atLeast(e.nivel, "consulta")),
    podeContratar: lista.some((e) => atLeast(e.nivel, "inclusao")),
  };
}
