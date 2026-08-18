import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { BeneficiosPadraoLinha, BeneficiosPadraoPayload } from "@/lib/dp/beneficiosPadrao";

const KEY = "dp_beneficios_padroes";

/** Padrões de benefícios da empresa (geral + por unidade). */
export function useDpBeneficiosPadroes() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: [KEY, selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<BeneficiosPadraoLinha[]> => {
      const { data, error } = await supabase
        .from("dp_beneficios_padroes")
        .select("id, unidade_id, payload, updated_at")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        unidade_id: r.unidade_id,
        payload: (r.payload ?? {}) as BeneficiosPadraoPayload,
        updated_at: r.updated_at,
      }));
    },
  });
}

/** Grava (ou substitui) o padrão da unidade — unidade_id null = padrão da empresa. */
export function useSalvarDpBeneficiosPadrao() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: { unidade_id: string | null; payload: BeneficiosPadraoPayload }) => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { data: userData } = await supabase.auth.getUser();
      let q = supabase
        .from("dp_beneficios_padroes")
        .select("id")
        .eq("company_id", selectedCompanyId);
      q = input.unidade_id ? q.eq("unidade_id", input.unidade_id) : q.is("unidade_id", null);
      const { data: existente, error: erroBusca } = await q.maybeSingle();
      if (erroBusca) throw erroBusca;

      if (existente?.id) {
        const { error } = await supabase
          .from("dp_beneficios_padroes")
          .update({ payload: input.payload as any })
          .eq("id", existente.id);
        if (error) throw error;
        return existente.id as string;
      }
      const { data, error } = await supabase
        .from("dp_beneficios_padroes")
        .insert({
          company_id: selectedCompanyId,
          unidade_id: input.unidade_id,
          payload: input.payload as any,
          created_by: userData.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useRemoverDpBeneficiosPadrao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_beneficios_padroes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
