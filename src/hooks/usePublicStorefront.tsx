import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CartItem, PublicStorefront, PublicStorefrontResult } from "@/lib/orders/storefront";
import { cartToPayload } from "@/lib/orders/storefront";
import {
  fetchStorefront,
  readStorefrontSnapshot,
  storefrontQueryKey,
} from "@/lib/orders/storefrontPrefetch";

/**
 * Cardápio público da loja — não exige login (RPC SECURITY DEFINER).
 * Usa o snapshot local (pré-cache) como dado inicial e revalida em background,
 * então a página pinta imediatamente em visitas repetidas.
 */
export function usePublicStorefront(slug: string | undefined) {
  const snapshot = readStorefrontSnapshot(slug);

  return useQuery({
    queryKey: storefrontQueryKey(slug ?? ""),
    enabled: !!slug,
    staleTime: 60_000,
    retry: 1,
    initialData: snapshot?.data,
    initialDataUpdatedAt: snapshot?.savedAt,
    queryFn: (): Promise<PublicStorefrontResult> => fetchStorefront(slug!),
  });
}


export interface PlaceOrderInput {
  slug: string;
  items: CartItem[];
  orderType: string;
  customerName: string;
  customerPhone: string;
  notes?: string | null;
  zoneId?: string | null;
  address?: {
    street: string;
    number: string;
    complement?: string;
    district?: string;
    reference?: string;
  } | null;
  paymentOptionId?: string | null;
}

export interface PlacedOrder {
  success: true;
  order_id: string;
  display_number: number;
  status: string;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total_amount: number;
  message: string;
}

/** Cria o pedido diretamente na central de pedidos, com preços revalidados no servidor. */
export function usePlacePublicOrder() {
  return useMutation({
    mutationFn: async (input: PlaceOrderInput): Promise<PlacedOrder> => {
      const { data, error } = await supabase.rpc("storefront_public_create_order", {
        p_slug: input.slug,
        p_items: cartToPayload(input.items),
        p_order_type: input.orderType,
        p_customer_name: input.customerName.trim(),
        p_customer_phone: input.customerPhone,
        p_notes: input.notes?.trim() || null,
        p_zone_id: input.zoneId ?? null,
        p_address: input.address ?? null,
        p_payment_option_id: input.paymentOptionId ?? null,
      });
      if (error) throw new Error(error.message);
      return data as unknown as PlacedOrder;
    },
  });
}

export interface TrackedOrder {
  found: true;
  display_number: number;
  status: string;
  order_type: string;
  total_amount: number;
  placed_at: string | null;
  accepted_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  pickup_code: string | null;
  items: { name: string; quantity: number; total_price: number }[];
}

/** Acompanhamento do pedido pelo número + telefone informado. */
export function useTrackPublicOrder(
  slug: string | undefined,
  displayNumber: number | null,
  phone: string | null,
) {
  return useQuery({
    queryKey: ["storefront-track", slug, displayNumber, phone],
    enabled: !!slug && !!displayNumber && !!phone,
    refetchInterval: 30_000,
    queryFn: async (): Promise<TrackedOrder | { found: false }> => {
      const { data, error } = await supabase.rpc("storefront_public_track_order", {
        p_slug: slug!,
        p_display_number: displayNumber!,
        p_phone: phone!,
      });
      if (error) throw error;
      return (data ?? { found: false }) as TrackedOrder | { found: false };
    },
  });
}

/** Verifica se o cardápio público está acessível (usado pelo painel). */
export function isPublicStorefront(result: PublicStorefrontResult | undefined): result is PublicStorefront {
  return Boolean(result && (result as PublicStorefront).found);
}
