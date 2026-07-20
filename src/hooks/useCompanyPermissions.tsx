import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  CompanyRole,
  ModuleKey,
  PermissionsMap,
  resolvePermission,
  canEdit,
  canView,
} from "@/lib/permissions";

interface MemberInfo {
  role: CompanyRole;
  permissions: PermissionsMap;
}

/**
 * Returns the current user's permissions for the active company context.
 * For Personal (PF) context, the user always has full edit access (it's their own data).
 */
export function useCompanyPermissions() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const activeCompanyId = selectedCompanyId;
  const isPersonal = contextType === "pf" || !activeCompanyId;

  const { data: member } = useQuery<MemberInfo | null>({
    queryKey: ["company-member-self", user?.id, activeCompanyId],
    enabled: !!user && !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_members")
        .select("role, permissions")
        .eq("user_id", user!.id)
        .eq("company_id", activeCompanyId!)
        .maybeSingle();
      if (!data) return null;
      return {
        role: data.role as CompanyRole,
        permissions: (data.permissions ?? {}) as PermissionsMap,
      };
    },
  });

  const level = (module: ModuleKey) => {
    if (isPersonal) return "edit" as const;
    return resolvePermission(member?.role, member?.permissions, module);
  };

  return {
    isPersonal,
    role: member?.role,
    permissions: member?.permissions ?? {},
    can: (module: ModuleKey, required: "view" | "edit" = "view") => {
      const l = level(module);
      return required === "edit" ? canEdit(l) : canView(l);
    },
    level,
  };
}
