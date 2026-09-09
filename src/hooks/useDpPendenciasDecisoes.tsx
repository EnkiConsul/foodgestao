import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";

export type PendenciaDecisao = {
  id: string;
  pendencia_id: string;
  tipo?: string | null;
  colaborador_id?: string | null;
  competencia?: string | null;
  acao: "ignorar" | "adiar";
  justificativa?: string | null;
  adiada_ate?: string | null;
  created_at?: string;
};

/**
 * Decisões da EMPRESA sobre pendências (ignorar com justificativa ou adiar).
 * Valem para todos os gestores — diferente do adiamento pessoal antigo
 * (dp_user_prefs), que só escondia para o próprio usuário.
 */
export function useDpPendenciasDecisoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_pendencias_decisoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
    queryFn: async (): Promise<PendenciaDecisao[]> => {
      const { data, error } = await supabase
        .from("dp_pendencias_decisoes" as any)
        .select("id, pendencia_id, tipo, colaborador_id, competencia, acao, justificativa, adiada_ate, created_at")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []) as unknown as PendenciaDecisao[];
    },
  });

  const decisoes = query.data ?? [];

  /** IDs ignorados definitivamente (com justificativa). */
  const ignoradas = useMemo(
    () => new Set(decisoes.filter((d) => d.acao === "ignorar").map((d) => d.pendencia_id)),
    [decisoes],
  );

  /** Mapa id → data limite do adiamento (no formato que `filtrarAbertas` entende). */
  const adiadas = useMemo(() => {
    const out: Record<string, string> = {};
    for (const d of decisoes) {
      if (d.acao === "adiar" && d.adiada_ate) out[d.pendencia_id] = d.adiada_ate;
    }
    return out;
  }, [decisoes]);

  const decisaoDe = useMemo(() => {
    const m = new Map<string, PendenciaDecisao>();
    for (const d of decisoes) m.set(d.pendencia_id, d);
    return m;
  }, [decisoes]);

  const decidir = useMutation({
    mutationFn: async (args: {
      pendenciaId: string;
      tipo?: string | null;
      acao: "ignorar" | "adiar";
      justificativa?: string | null;
      adiadaAte?: string | null;
    }) => {
      if (args.acao === "ignorar" && !args.justificativa?.trim()) {
        throw new Error("Informe a justificativa para ignorar a pendência.");
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_pendencias_decisoes" as any).upsert(
        {
          company_id: selectedCompanyId!,
          pendencia_id: args.pendenciaId,
          tipo: args.tipo ?? null,
          acao: args.acao,
          justificativa: args.justificativa?.trim() || null,
          adiada_ate: args.acao === "adiar" ? args.adiadaAte : null,
          criado_por: auth.user?.id ?? null,
        } as any,
        { onConflict: "company_id,pendencia_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["dp_pendencias_decisoes"] });
      toast.success(args.acao === "ignorar" ? "Pendência ignorada para toda a empresa." : "Pendência adiada para toda a empresa.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível registrar a decisão."),
  });

  const remover = useMutation({
    mutationFn: async (pendenciaId: string) => {
      const { error } = await supabase
        .from("dp_pendencias_decisoes" as any)
        .delete()
        .eq("company_id", selectedCompanyId!)
        .eq("pendencia_id", pendenciaId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_pendencias_decisoes"] });
      toast.success("Decisão removida — a pendência voltou a aparecer.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível remover a decisão."),
  });

  return { decisoes, ignoradas, adiadas, decisaoDe, decidir, remover, isLoading: query.isLoading };
}
