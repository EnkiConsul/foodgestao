import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { CatalogState } from "@/lib/orders/catalog";
import { normalizeProductImage } from "@/lib/orders/productImage";
import { buildProductImagePath, validateProductImage } from "@/lib/orders/catalog";
import type { OrderChannel } from "@/lib/orders/units";

export const CATALOG_KEY = "orders-catalog";
export const PRODUCT_IMAGE_BUCKET = "ped-produtos";

export interface OrdersMenu {
  id: string;
  company_id: string;
  unit_id: string | null;
  name: string;
  description: string | null;
  channels: OrderChannel[];
  state: CatalogState;
  is_default: boolean;
  sort_order: number;
}

export interface OrdersMenuCategory {
  id: string;
  menu_id: string;
  name: string;
  description: string | null;
  state: CatalogState;
  sort_order: number;
}

export interface OrdersProduct {
  id: string;
  company_id: string;
  category_id: string;
  name: string;
  description: string | null;
  internal_code: string | null;
  image_path: string | null;
  base_price_cents: number;
  prep_time_minutes: number | null;
  allows_notes: boolean;
  track_stock: boolean;
  stock_quantity: number | null;
  state: CatalogState;
  paused_until: string | null;
  sort_order: number;
  archived_at: string | null;
}

export interface OrdersVariant {
  id: string;
  product_id: string;
  name: string;
  price_cents: number;
  is_default: boolean;
  state: CatalogState;
  sort_order: number;
}

export interface OrdersOptionGroup {
  id: string;
  product_id: string;
  name: string;
  is_required: boolean;
  min_choices: number;
  max_choices: number;
  state: CatalogState;
  sort_order: number;
}

export interface OrdersOption {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  max_quantity: number;
  state: CatalogState;
  sort_order: number;
}

export interface OrdersAvailability {
  id: string;
  product_id: string;
  unit_id: string | null;
  channels: OrderChannel[];
  weekday: number | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface OrdersUnitOverride {
  id: string;
  product_id: string;
  unit_id: string;
  price_cents: number | null;
  state: CatalogState | null;
  paused_until: string | null;
}

/** Cardápios da empresa selecionada. */
export function useOrdersMenus() {
  const { contextType, selectedCompanyId } = useCompanyContext();
  const enabled = contextType === "pj" && !!selectedCompanyId;

  return useQuery({
    queryKey: [CATALOG_KEY, "menus", selectedCompanyId],
    enabled,
    queryFn: async (): Promise<OrdersMenu[]> => {
      const { data, error } = await supabase
        .from("ped_menus")
        .select("id, company_id, unit_id, name, description, channels, state, is_default, sort_order")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrdersMenu[];
    },
  });
}

export function useOrdersCategories(menuId: string | null) {
  return useQuery({
    queryKey: [CATALOG_KEY, "categories", menuId],
    enabled: !!menuId,
    queryFn: async (): Promise<OrdersMenuCategory[]> => {
      const { data, error } = await supabase
        .from("ped_menu_categories")
        .select("id, menu_id, name, description, state, sort_order")
        .eq("menu_id", menuId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrdersMenuCategory[];
    },
  });
}

export function useOrdersProducts(menuId: string | null, categoryId?: string | null) {
  const { data: categories } = useOrdersCategories(menuId);
  const categoryIds = useMemo(() => (categories ?? []).map((c) => c.id), [categories]);
  const ids = categoryId ? [categoryId] : categoryIds;

  return useQuery({
    queryKey: [CATALOG_KEY, "products", menuId, categoryId ?? "all", ids.length],
    enabled: ids.length > 0,
    queryFn: async (): Promise<OrdersProduct[]> => {
      const { data, error } = await supabase
        .from("ped_products")
        .select("*")
        .in("category_id", ids)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrdersProduct[];
    },
  });
}

/** Detalhes de um produto: variações, grupos, complementos, disponibilidade e preços por unidade. */
export function useOrdersProductDetail(productId: string | null) {
  return useQuery({
    queryKey: [CATALOG_KEY, "product-detail", productId],
    enabled: !!productId,
    queryFn: async () => {
      const [variants, groups, availability, overrides] = await Promise.all([
        supabase
          .from("ped_product_variants")
          .select("id, product_id, name, price_cents, is_default, state, sort_order")
          .eq("product_id", productId!)
          .order("sort_order"),
        supabase
          .from("ped_option_groups")
          .select("id, product_id, name, is_required, min_choices, max_choices, state, sort_order")
          .eq("product_id", productId!)
          .order("sort_order"),
        supabase
          .from("ped_product_availability")
          .select("id, product_id, unit_id, channels, weekday, starts_at, ends_at")
          .eq("product_id", productId!),
        supabase
          .from("ped_product_unit_overrides")
          .select("id, product_id, unit_id, price_cents, state, paused_until")
          .eq("product_id", productId!),
      ]);
      if (variants.error) throw variants.error;
      if (groups.error) throw groups.error;
      if (availability.error) throw availability.error;
      if (overrides.error) throw overrides.error;

      const groupIds = (groups.data ?? []).map((g) => g.id);
      let options: OrdersOption[] = [];
      if (groupIds.length > 0) {
        const { data, error } = await supabase
          .from("ped_options")
          .select("id, group_id, name, description, price_cents, max_quantity, state, sort_order")
          .in("group_id", groupIds)
          .order("sort_order");
        if (error) throw error;
        options = (data ?? []) as OrdersOption[];
      }

      return {
        variants: (variants.data ?? []) as OrdersVariant[],
        groups: (groups.data ?? []) as OrdersOptionGroup[],
        options,
        availability: (availability.data ?? []) as OrdersAvailability[],
        overrides: (overrides.data ?? []) as OrdersUnitOverride[],
      };
    },
  });
}

function useInvalidateCatalog() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [CATALOG_KEY] });
}

function fail(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  toast.error(message);
  throw error;
}

// ------------------------------------------------------------ cardápios

export function useSaveMenu() {
  const invalidate = useInvalidateCatalog();
  const { selectedCompanyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (input: Partial<OrdersMenu> & { name: string }) => {
      const payload = {
        company_id: selectedCompanyId!,
        unit_id: input.unit_id ?? null,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        channels: input.channels ?? [],
        state: input.state ?? "draft",
        is_default: input.is_default ?? false,
      };
      if (input.id) {
        const { error } = await supabase.from("ped_menus").update(payload).eq("id", input.id);
        if (error) fail(error, "Não foi possível salvar o cardápio.");
        return input.id;
      }
      const { data, error } = await supabase.from("ped_menus").insert(payload).select("id").single();
      if (error) fail(error, "Não foi possível criar o cardápio.");
      return data!.id as string;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Cardápio salvo.");
    },
  });
}

export function useDuplicateMenuToUnit() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { menuId: string; targetUnitId: string | null; newName?: string }) => {
      const { data, error } = await supabase.rpc("ped_duplicate_menu_to_unit", {
        p_menu_id: input.menuId,
        p_target_unit_id: input.targetUnitId,
        p_new_name: input.newName ?? null,
      });
      if (error) fail(error, "Não foi possível duplicar o cardápio.");
      return data as string;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Cardápio duplicado como rascunho.");
    },
  });
}

// ------------------------------------------------------------ categorias

export function useSaveCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { id?: string; menu_id: string; name: string; description?: string | null; state?: CatalogState }) => {
      const payload = {
        menu_id: input.menu_id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        state: input.state ?? "active",
      };
      if (input.id) {
        const { error } = await supabase.from("ped_menu_categories").update(payload).eq("id", input.id);
        if (error) fail(error, "Não foi possível salvar a categoria.");
        return input.id;
      }
      const { data, error } = await supabase
        .from("ped_menu_categories")
        .insert({ ...payload, company_id: "00000000-0000-0000-0000-000000000000" })
        .select("id")
        .single();
      if (error) fail(error, "Não foi possível criar a categoria.");
      return data!.id as string;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Categoria salva.");
    },
  });
}

// -------------------------------------------------------------- produtos

export interface ProductInput {
  id?: string;
  category_id: string;
  name: string;
  description?: string | null;
  internal_code?: string | null;
  base_price_cents: number;
  prep_time_minutes?: number | null;
  allows_notes?: boolean;
  track_stock?: boolean;
  stock_quantity?: number | null;
  state?: CatalogState;
  paused_until?: string | null;
}

export function useSaveProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: ProductInput) => {
      const payload = {
        category_id: input.category_id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        internal_code: input.internal_code?.trim() || null,
        base_price_cents: Math.trunc(input.base_price_cents),
        prep_time_minutes: input.prep_time_minutes ?? null,
        allows_notes: input.allows_notes ?? true,
        track_stock: input.track_stock ?? false,
        stock_quantity: input.track_stock ? (input.stock_quantity ?? 0) : null,
        state: input.state ?? "draft",
        paused_until: input.paused_until ?? null,
      };
      if (input.id) {
        const { error } = await supabase.from("ped_products").update(payload).eq("id", input.id);
        if (error) fail(error, "Não foi possível salvar o produto.");
        return input.id;
      }
      const { data, error } = await supabase
        .from("ped_products")
        .insert({ ...payload, company_id: "00000000-0000-0000-0000-000000000000" })
        .select("id")
        .single();
      if (error) fail(error, "Não foi possível criar o produto.");
      return data!.id as string;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Produto salvo.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Não foi possível salvar o produto.";
      toast.error(msg);
    },
  });

}

export function useToggleProductPause() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { id: string; pause: boolean; until?: string | null }) => {
      const { error } = await supabase
        .from("ped_products")
        .update({
          state: input.pause ? "paused" : "active",
          paused_until: input.pause ? (input.until ?? null) : null,
        })
        .eq("id", input.id);
      if (error) fail(error, "Não foi possível alterar a pausa do produto.");
    },
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(v.pause ? "Produto pausado." : "Produto reativado.");
    },
  });
}

export function useArchiveProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ped_products").update({ state: "archived" }).eq("id", id);
      if (error) fail(error, "Não foi possível arquivar o produto.");
    },
    onSuccess: () => {
      invalidate();
      toast.success("Produto arquivado. O histórico de pedidos é preservado.");
    },
  });
}

export function useDuplicateProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { productId: string; targetCategoryId?: string | null; newName?: string }) => {
      const { data, error } = await supabase.rpc("ped_duplicate_product", {
        p_product_id: input.productId,
        p_target_category_id: input.targetCategoryId ?? null,
        p_new_name: input.newName ?? null,
      });
      if (error) fail(error, "Não foi possível duplicar o produto.");
      return data as string;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Produto duplicado como rascunho.");
    },
  });
}

export function useReorderCatalog() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { kind: "category" | "product" | "variant" | "group" | "option"; ids: string[] }) => {
      const { error } = await supabase.rpc("ped_reorder_catalog", { p_kind: input.kind, p_ids: input.ids });
      if (error) fail(error, "Não foi possível reordenar.");
    },
    onSuccess: () => invalidate(),
  });
}

// --------------------------------------------- variações / complementos

export function useSaveVariant() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { id?: string; product_id: string; name: string; price_cents: number; is_default?: boolean }) => {
      const payload = {
        product_id: input.product_id,
        name: input.name.trim(),
        price_cents: Math.trunc(input.price_cents),
        is_default: input.is_default ?? false,
      };
      if (input.id) {
        const { error } = await supabase.from("ped_product_variants").update(payload).eq("id", input.id);
        if (error) fail(error, "Não foi possível salvar a variação.");
        return;
      }
      const { error } = await supabase
        .from("ped_product_variants")
        .insert({ ...payload, company_id: "00000000-0000-0000-0000-000000000000" });
      if (error) fail(error, "Não foi possível criar a variação.");
    },
    onSuccess: () => invalidate(),
  });
}

export function useSaveOptionGroup() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      product_id: string;
      name: string;
      is_required: boolean;
      min_choices: number;
      max_choices: number;
    }) => {
      const payload = {
        product_id: input.product_id,
        name: input.name.trim(),
        is_required: input.is_required,
        min_choices: Math.trunc(input.min_choices),
        max_choices: Math.trunc(input.max_choices),
      };
      if (input.id) {
        const { error } = await supabase.from("ped_option_groups").update(payload).eq("id", input.id);
        if (error) fail(error, "Não foi possível salvar o grupo.");
        return;
      }
      const { error } = await supabase
        .from("ped_option_groups")
        .insert({ ...payload, company_id: "00000000-0000-0000-0000-000000000000" });
      if (error) fail(error, "Não foi possível criar o grupo.");
    },
    onSuccess: () => invalidate(),
  });
}

export function useSaveOption() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { id?: string; group_id: string; name: string; price_cents: number; max_quantity?: number }) => {
      const payload = {
        group_id: input.group_id,
        name: input.name.trim(),
        price_cents: Math.trunc(input.price_cents),
        max_quantity: input.max_quantity ?? 1,
      };
      if (input.id) {
        const { error } = await supabase.from("ped_options").update(payload).eq("id", input.id);
        if (error) fail(error, "Não foi possível salvar o complemento.");
        return;
      }
      const { error } = await supabase
        .from("ped_options")
        .insert({ ...payload, company_id: "00000000-0000-0000-0000-000000000000" });
      if (error) fail(error, "Não foi possível criar o complemento.");
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCatalogRow() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: {
      table: "ped_product_variants" | "ped_option_groups" | "ped_options" | "ped_product_availability" | "ped_product_unit_overrides" | "ped_menu_categories";
      id: string;
    }) => {
      const { error } = await supabase.from(input.table).delete().eq("id", input.id);
      if (error) fail(error, "Não foi possível excluir o registro.");
    },
    onSuccess: () => invalidate(),
  });
}

// ---------------------------------------------------- disponibilidade

export function useSaveAvailability() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: {
      product_id: string;
      unit_id: string | null;
      channels: OrderChannel[];
      weekday: number | null;
      starts_at: string | null;
      ends_at: string | null;
    }) => {
      const { error } = await supabase.from("ped_product_availability").insert({
        ...input,
        company_id: "00000000-0000-0000-0000-000000000000",
      });
      if (error) fail(error, "Não foi possível salvar a disponibilidade.");
    },
    onSuccess: () => {
      invalidate();
      toast.success("Disponibilidade salva.");
    },
  });
}

export function useSaveUnitOverride() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { product_id: string; unit_id: string; price_cents: number | null; state: CatalogState | null }) => {
      const { error } = await supabase.from("ped_product_unit_overrides").upsert(
        { ...input, company_id: "00000000-0000-0000-0000-000000000000" },
        { onConflict: "product_id,unit_id" },
      );
      if (error) fail(error, "Não foi possível salvar o preço da unidade.");
    },
    onSuccess: () => {
      invalidate();
      toast.success("Preço por unidade salvo.");
    },
  });
}

// ------------------------------------------------------------- imagens

export function useProductImageUrl(path: string | null, version?: string | null) {
  return useQuery({
    queryKey: [CATALOG_KEY, "image", path, version ?? null],
    enabled: !!path,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).createSignedUrl(path!, 3600);
      if (error) throw error;
      // cache-bust: garante que o browser recarregue a prévia após novo upload
      const stamp = version ? String(new Date(version).getTime() || version) : String(Date.now());
      const url = data.signedUrl;
      return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(stamp)}`;
    },
  });
}


export function useUploadProductImage() {
  const invalidate = useInvalidateCatalog();
  const { selectedCompanyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (input: { productId: string; file: File; previousPath?: string | null }) => {
      const problem = validateProductImage(input.file);
      if (problem) {
        toast.error(problem);
        throw new Error(problem);
      }
      const normalized = await normalizeProductImage(input.file);
      const path = buildProductImagePath(selectedCompanyId!, input.productId, normalized.name);
      const { error: upErr } = await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .upload(path, normalized, { contentType: normalized.type, upsert: false });
      if (upErr) fail(upErr, "Não foi possível enviar a imagem.");

      const { error } = await supabase.from("ped_products").update({ image_path: path }).eq("id", input.productId);
      if (error) {
        await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
        fail(error, "Não foi possível vincular a imagem ao produto.");
      }
      if (input.previousPath && input.previousPath !== path) {
        await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([input.previousPath]);
      }
      return path;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Imagem atualizada.");
    },
  });
}

export function useRemoveProductImage() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (input: { productId: string; path: string }) => {
      const { error } = await supabase.from("ped_products").update({ image_path: null }).eq("id", input.productId);
      if (error) fail(error, "Não foi possível remover a imagem.");
      await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([input.path]);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Imagem removida.");
    },
  });
}
