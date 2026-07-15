import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  Icon: LucideIcon;
}

export function useModulosCatalogo() {
  return useQuery({
    queryKey: ["modulos-catalogo"],
    queryFn: async (): Promise<ModuloCatalogo[]> => {
      const { data, error } = await supabase
        .from("modulos_catalogo" as any)
        .select("id, slug, nome, descricao_curta, icone, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((m) => ({
        ...m,
        Icon: ICON_MAP[m.icone] ?? Package,
      }));
    },
    staleTime: 60 * 60 * 1000,
  });
}
