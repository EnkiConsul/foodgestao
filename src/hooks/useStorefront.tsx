import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { StorefrontConfig, StorefrontTheme } from "@/lib/orders/storefront";

const KEY = "orders-storefront";
const BUCKET = "ped-storefront";

/** Configuração da loja online da unidade (etapa do onboarding). */
export function useStorefront(unitId: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: [KEY, selectedCompanyId, unitId],
    enabled: !!unitId && !!selectedCompanyId,
    queryFn: async (): Promise<StorefrontConfig | null> => {
      const { data, error } = await supabase
        .from("ped_storefronts")
        .select("*")
        .eq("unit_id", unitId!)
        .maybeSingle();
      if (error) throw error;
      return (data as StorefrontConfig | null) ?? null;
    },
  });
}

/** Verifica se o slug está livre (usa RPC para não expor a tabela). */
export function useSlugAvailability(slug: string, unitId: string | null) {
  return useQuery({
    queryKey: [KEY, "slug", slug, unitId],
    enabled: slug.length >= 3 && !!unitId,
    staleTime: 15_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("storefront_slug_available", {
        p_slug: slug,
        p_unit_id: unitId!,
      });
      if (error) throw error;
      return Boolean(data);
    },
  });
}

export interface SaveStorefrontInput {
  unitId: string;
  slug: string;
  theme: StorefrontTheme;
  primary_color: string;
  headline: string | null;
  about: string | null;
  whatsapp_phone: string | null;
  online_cart_enabled: boolean;
  logo_url?: string | null;
  banner_url?: string | null;
  is_published?: boolean;
}

export function useSaveStorefront() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (input: SaveStorefrontInput) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { unitId, is_published, ...rest } = input;
      const payload = {
        company_id: selectedCompanyId,
        unit_id: unitId,
        ...rest,
        slug: input.slug.trim().toLowerCase(),
        ...(is_published === undefined
          ? {}
          : { is_published, published_at: is_published ? new Date().toISOString() : null }),
      };
      const { data, error } = await supabase
        .from("ped_storefronts")
        .upsert(payload, { onConflict: "unit_id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as StorefrontConfig;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["orders-units"] });
      toast.success(data.is_published ? "Loja online publicada." : "Configuração da loja salva.");
    },
    onError: (e: Error) => {
      const msg = /duplicate key|unique/i.test(e.message)
        ? "Este link já está em uso. Escolha outro."
        : e.message;
      toast.error(msg);
    },
  });
}

/** Upload de logo/banner no bucket privado da loja. */
export function useUploadStorefrontMedia() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();

  return useMutation({
    mutationFn: async ({
      unitId,
      kind,
      file,
    }: {
      unitId: string;
      kind: "logo" | "banner";
      file: File;
    }) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
        throw new Error("Envie uma imagem PNG, JPG ou WEBP.");
      }
      if (file.size > 3 * 1024 * 1024) throw new Error("A imagem deve ter até 3 MB.");

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${selectedCompanyId}/${unitId}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const column = kind === "logo" ? "logo_url" : "banner_url";
      const { data: current } = await supabase
        .from("ped_storefronts")
        .select(`id, ${column}`)
        .eq("unit_id", unitId)
        .maybeSingle();

      const previous = (current as Record<string, string | null> | null)?.[column] ?? null;

      const { error } = await supabase
        .from("ped_storefronts")
        .update({ [column]: path })
        .eq("unit_id", unitId);
      if (error) throw error;

      if (previous && previous !== path) {
        await supabase.storage.from(BUCKET).remove([previous]);
      }
      return path;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Imagem atualizada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveStorefrontMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ unitId, kind, path }: { unitId: string; kind: "logo" | "banner"; path: string | null }) => {
      const column = kind === "logo" ? "logo_url" : "banner_url";
      const { error } = await supabase
        .from("ped_storefronts")
        .update({ [column]: null })
        .eq("unit_id", unitId);
      if (error) throw error;
      if (path) await supabase.storage.from(BUCKET).remove([path]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Imagem removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Lê a imagem privada para preview no painel (URL assinada). */
export function useStorefrontMediaPreview(path: string | null) {
  return useQuery({
    queryKey: [KEY, "preview", path],
    enabled: !!path,
    staleTime: 45 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}
