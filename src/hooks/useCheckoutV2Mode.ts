import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Modo do checkout ('legado' | 'v2'), decidido no servidor pela flag checkout_v2.
 * Erro de leitura NÃO abre a tela antiga: o erro sobe para a tela tratar
 * (falha fechada — ver Checkout.tsx, PlanosGate.tsx e AssinaturaGate.tsx).
 */
export function useCheckoutV2Mode() {
  return useQuery({
    queryKey: ["checkout-v2-mode"],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("checkout_v2_mode");
      if (error) throw error;
      return (data as string) === "v2" ? "v2" : "legado";
    },
  });
}
