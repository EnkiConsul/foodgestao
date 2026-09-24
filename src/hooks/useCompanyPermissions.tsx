import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  CompanyRole,
  ModuleKey,
  ModuloKey,
  ModulosMap,
  PermissionLevel,
  PermissionsMap,
  resolvePermission,
  atLeast,
} from "@/lib/permissions";

interface MemberInfo {
  role: CompanyRole;
  permissions: PermissionsMap;
  modulos: Partial<ModulosMap>;
  ver_saldos: boolean;
  ver_salarios: boolean;
  situacao: string;
  perfil: string;
}

type Required = "view" | "edit" | PermissionLevel;

/** Permissões do usuário na empresa ativa (a mesma regra é conferida no banco). */
export function useCompanyPermissions() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const activeCompanyId = selectedCompanyId;
  const isPersonal = contextType === "pf" || !activeCompanyId;

  const { data: member } = useQuery<MemberInfo | null>({
    queryKey: ["company-member-self", user?.id, activeCompanyId],
    enabled: !!user && !!activeCompanyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("company_members")
        .select("role, permissions, modulos, ver_saldos, ver_salarios, situacao, perfil")
        .eq("user_id", user!.id)
        .eq("company_id", activeCompanyId!)
        .maybeSingle();
      if (!data) return null;
      return {
        role: data.role as CompanyRole,
        permissions: (data.permissions ?? {}) as PermissionsMap,
        modulos: (data.modulos ?? {}) as Partial<ModulosMap>,
        ver_saldos: data.ver_saldos !== false,
        ver_salarios: data.ver_salarios !== false,
        situacao: data.situacao ?? "ativo",
        perfil: data.perfil ?? "personalizado",
      };
    },
  });

  const isAdmin = member?.role === "owner" || member?.role === "admin";

  const level = (module: ModuleKey): PermissionLevel => {
    if (isPersonal) return "total";
    return resolvePermission(member?.role, member?.permissions, module, member?.modulos, member?.situacao);
  };

  const hasModulo = (m: ModuloKey) => {
    if (isPersonal || !member) return true;
    if (member.situacao !== "ativo") return false;
    if (isAdmin) return true;
    return member.modulos?.[m] !== false;
  };

  return {
    isPersonal,
    role: member?.role,
    perfil: member?.perfil,
    permissions: member?.permissions ?? {},
    hasModulo,
    verSaldos: isPersonal || isAdmin || member?.ver_saldos !== false,
    verSalarios: isPersonal || isAdmin || member?.ver_salarios !== false,
    can: (module: ModuleKey, required: Required = "view") => {
      const req: PermissionLevel = required === "view" ? "consulta" : required === "edit" ? "alteracao" : required;
      return atLeast(level(module), req);
    },
    level,
  };
}
