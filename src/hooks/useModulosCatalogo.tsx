import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DollarSign,
  FileCheck2,
  MessageCircleHeart,
  ShoppingCart,
  UserCog,
  BarChart3,
  Wallet,
  type LucideIcon,
  Package,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  DollarSign,
  FileCheck2,
  MessageCircleHeart,
  ShoppingCart,
  UserCog,
  BarChart3,
  Wallet,
};

export interface ModuloCatalogo {
  id: string;
  slug: string;
  nome: string;
  descricao_curta: string;
  icone: string;
  ordem: number;
  ativo: boolean;
  show_on_landing: boolean;
  show_on_hub: boolean;
  Icon: LucideIcon;
}

const SELECT_COLS =
  "id, slug, nome, descricao_curta, icone, ordem, ativo, show_on_landing, show_on_hub";

function mapRows(data: unknown): ModuloCatalogo[] {
  return ((data ?? []) as any[]).map((m) => ({
    ...m,
    Icon: ICON_MAP[m.icone] ?? Package,
  }));
}

/** Módulos ativos (onboarding e usos gerais). */
export function useModulosCatalogo() {
  return useQuery({
    queryKey: ["modulos-catalogo"],
    queryFn: async (): Promise<ModuloCatalogo[]> => {
      const { data, error } = await supabase
        .from("modulos_catalogo" as any)
        .select(SELECT_COLS)
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return mapRows(data);
    },
    staleTime: 60 * 60 * 1000,
  });
}

/** Catálogo completo (backoffice). */
export function useModulosCatalogoAdmin() {
  return useQuery({
    queryKey: ["modulos-catalogo-admin"],
    queryFn: async (): Promise<ModuloCatalogo[]> => {
      const { data, error } = await supabase
        .from("modulos_catalogo" as any)
        .select(SELECT_COLS)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return mapRows(data);
    },
  });
}

export type ModuloCatalogoFlags = Partial<
  Pick<ModuloCatalogo, "ativo" | "show_on_landing" | "show_on_hub">
>;

export function useUpdateModuloCatalogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ModuloCatalogoFlags }) => {
      const { error } = await supabase
        .from("modulos_catalogo" as any)
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Catálogo atualizado");
      qc.invalidateQueries({ queryKey: ["modulos-catalogo-admin"] });
      qc.invalidateQueries({ queryKey: ["modulos-catalogo"] });
    },
    onError: (e) =>
      toast.error("Falha ao atualizar módulo", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });
}
