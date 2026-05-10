import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCoupons() {
  return useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (coupon: any) => {
      if (coupon.id) {
        const { id, created_at, updated_at, times_redeemed, ...rest } = coupon;
        const { error } = await supabase.from("coupons").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coupons").insert(coupon);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast.success("Cupom salvo");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar cupom"),
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast.success("Cupom excluído");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });
}
