import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import {
  isValidLayout,
  sanitizeLayout,
  type DpMenuLayout,
  type DpMenuSurfaceKey,
} from "@/lib/dp/menuLayout";
import { DP_ADMIN_NAV, DP_PORTAL_NAV } from "@/config/dpNavigation";

const EXTRAS_KEY = "menu_layout";

function surfaceDef(surface: DpMenuSurfaceKey) {
  return surface === "portal" ? DP_PORTAL_NAV : DP_ADMIN_NAV;
}

/**
 * Ordem efetiva do menu do DP: preferência do usuário > padrão da empresa >
 * padrão de fábrica (`src/config/dpNavigation.tsx`).
 */
export function useDpMenuLayout(surface: DpMenuSurfaceKey = "dp") {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const { role } = useCompanyPermissions();
  const { prefs, save, saving } = useDpUserPrefs();
  const qc = useQueryClient();

  const canSetCompanyDefault = role === "admin" || role === "owner";

  const companyDefault = useQuery({
    queryKey: ["dp_menu_defaults", selectedCompanyId, surface],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<DpMenuLayout | null> => {
      const { data } = await supabase
        .from("dp_menu_defaults")
        .select("layout")
        .eq("company_id", selectedCompanyId!)
        .eq("surface", surface)
        .maybeSingle();
      const layout = data?.layout;
      return isValidLayout(layout) ? layout : null;
    },
  });

  const userLayout = useMemo<DpMenuLayout | null>(() => {
    const map = (prefs.extras as Record<string, unknown>)?.[EXTRAS_KEY];
    const value = map && typeof map === "object" ? (map as Record<string, unknown>)[surface] : null;
    return isValidLayout(value) ? value : null;
  }, [prefs.extras, surface]);

  const layout = userLayout ?? companyDefault.data ?? null;

  const salvar = (next: DpMenuLayout) => {
    const clean = sanitizeLayout(surfaceDef(surface), next);
    const extras = prefs.extras ?? {};
    const map = (extras[EXTRAS_KEY] as Record<string, unknown>) ?? {};
    save(
      { extras: { ...extras, [EXTRAS_KEY]: { ...map, [surface]: clean } } },
      {
        onSuccess: () => toast.success("Menu organizado"),
        onError: () => toast.error("Não foi possível salvar a ordem do menu"),
      },
    );
  };

  const restaurarPadrao = () => {
    const extras = prefs.extras ?? {};
    const map = { ...((extras[EXTRAS_KEY] as Record<string, unknown>) ?? {}) };
    delete map[surface];
    save(
      { extras: { ...extras, [EXTRAS_KEY]: map } },
      { onSuccess: () => toast.success("Menu restaurado ao padrão") },
    );
  };

  const definirPadraoDaEmpresa = useMutation({
    mutationFn: async (next: DpMenuLayout) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const clean = sanitizeLayout(surfaceDef(surface), next);
      const { error } = await supabase.from("dp_menu_defaults").upsert(
        {
          company_id: selectedCompanyId,
          surface,
          layout: clean as never,
          updated_by: user?.id ?? null,
        },
        { onConflict: "company_id,surface" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Padrão da empresa atualizado");
      qc.invalidateQueries({ queryKey: ["dp_menu_defaults", selectedCompanyId, surface] });
    },
    onError: () => toast.error("Não foi possível definir o padrão da empresa"),
  });

  return {
    layout,
    hasUserLayout: !!userLayout,
    companyDefault: companyDefault.data ?? null,
    canSetCompanyDefault,
    salvar,
    saving,
    restaurarPadrao,
    definirPadraoDaEmpresa: definirPadraoDaEmpresa.mutate,
    savingCompanyDefault: definirPadraoDaEmpresa.isPending,
  };
}
