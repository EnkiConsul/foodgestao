import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";

export interface StorefrontCatalogProduct {
  id: string;
  name: string;
  base_price_cents: number;
  image_path: string | null;
  available: boolean;
}

export interface StorefrontCatalogCategory {
  id: string;
  name: string;
  products: StorefrontCatalogProduct[];
}

export interface StorefrontCatalogPreview {
  menuName: string | null;
  categories: StorefrontCatalogCategory[];
  totalProducts: number;
}

/**
 * Prévia do que a loja pública vai exibir: mesma escolha de cardápio da RPC
 * `storefront_public_get` (cardápio da unidade > padrão > ordem, priorizando o
 * cardápio que tem itens) e mesmas regras de disponibilidade.
 */
export function useStorefrontCatalogPreview(unitId: string | undefined) {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const enabled = contextType === "pj" && !!selectedCompanyId && !!unitId;

  return useQuery({
    queryKey: ["storefront-catalog-preview", selectedCompanyId, unitId],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<StorefrontCatalogPreview> => {
      const { data: menus, error: menusError } = await supabase
        .from("ped_menus")
        .select("id, name, unit_id, is_default, sort_order, created_at, state, archived_at")
        .eq("state", "active")
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (menusError) throw menusError;

      const candidates = (menus ?? []).filter((m) => m.unit_id === unitId || m.unit_id === null);
      if (candidates.length === 0) return { menuName: null, categories: [], totalProducts: 0 };

      const { data: cats, error: catsError } = await supabase
        .from("ped_menu_categories")
        .select("id, menu_id, name, sort_order, state, archived_at")
        .in(
          "menu_id",
          candidates.map((m) => m.id),
        )
        .eq("state", "active")
        .is("archived_at", null)
        .order("sort_order", { ascending: true });
      if (catsError) throw catsError;

      const categories = cats ?? [];
      let products: {
        id: string;
        name: string;
        category_id: string;
        base_price_cents: number;
        image_path: string | null;
        state: string;
        paused_until: string | null;
        sort_order: number;
      }[] = [];

      if (categories.length > 0) {
        const { data: prods, error: prodsError } = await supabase
          .from("ped_products")
          .select("id, name, category_id, base_price_cents, image_path, state, paused_until, sort_order, archived_at")
          .in(
            "category_id",
            categories.map((c) => c.id),
          )
          .is("archived_at", null)
          .neq("state", "archived")
          .order("sort_order", { ascending: true });
        if (prodsError) throw prodsError;
        products = (prods ?? []) as typeof products;
      }

      const countByMenu = new Map<string, number>();
      for (const p of products) {
        const cat = categories.find((c) => c.id === p.category_id);
        if (!cat) continue;
        countByMenu.set(cat.menu_id, (countByMenu.get(cat.menu_id) ?? 0) + 1);
      }

      const chosen =
        [...candidates].sort((a, b) => {
          const ha = (countByMenu.get(a.id) ?? 0) > 0 ? 1 : 0;
          const hb = (countByMenu.get(b.id) ?? 0) > 0 ? 1 : 0;
          if (ha !== hb) return hb - ha;
          const ua = a.unit_id === unitId ? 1 : 0;
          const ub = b.unit_id === unitId ? 1 : 0;
          if (ua !== ub) return ub - ua;
          if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        })[0] ?? candidates[0];

      const now = Date.now();
      const result = categories
        .filter((c) => c.menu_id === chosen.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          products: products
            .filter((p) => p.category_id === c.id)
            .map((p) => ({
              id: p.id,
              name: p.name,
              base_price_cents: p.base_price_cents,
              image_path: p.image_path,
              available:
                p.state === "active" && (!p.paused_until || new Date(p.paused_until).getTime() < now),
            })),
        }))
        .filter((c) => c.products.length > 0);

      return {
        menuName: chosen.name,
        categories: result,
        totalProducts: result.reduce((sum, c) => sum + c.products.length, 0),
      };
    },
  });
}
