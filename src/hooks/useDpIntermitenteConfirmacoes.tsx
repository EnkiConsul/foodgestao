import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import { reportError } from "@/lib/errorLog";
import { porIds, resolverPendencias } from "@/lib/dp/pendencias-resolver";

export type IntermitenteConfirmacao = {
  id: string;
  colaborador_id: string;
  competencia: string;
  trabalhou: boolean;
  observacao?: string | null;
};

/**
 * Resposta do gestor ao alerta do intermitente: houve trabalho na competência?
 * "Trabalhou" passa a cobrar ponto/contracheque; "Não trabalhou" encerra o alerta.
 */
export function useDpIntermitenteConfirmacoes() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_intermitente_confirmacoes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
    queryFn: async (): Promise<IntermitenteConfirmacao[]> => {
      const { data, error } = await supabase
        .from("dp_intermitente_competencia_confirmacoes" as any)
        .select("id, colaborador_id, competencia, trabalhou, observacao")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []) as unknown as IntermitenteConfirmacao[];
    },
  });

  const responder = useMutation({
    mutationFn: async (args: { colaboradorId: string; competencia: string; trabalhou: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_intermitente_competencia_confirmacoes" as any)
        .upsert(
          {
            company_id: selectedCompanyId!,
            colaborador_id: args.colaboradorId,
            competencia: args.competencia,
            trabalhou: args.trabalhou,
            respondido_por: auth.user?.id ?? null,
          } as any,
          { onConflict: "company_id,colaborador_id,competencia" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      const pendenciaId = `intermitente-${args.colaboradorId}-${args.competencia.slice(0, 4)}-${Number(args.competencia.slice(5, 7))}`;
      qc.setQueryData<IntermitenteConfirmacao[]>(
        ["dp_intermitente_confirmacoes", selectedCompanyId],
        (atuais) => {
          const semCompetenciaRespondida = (atuais ?? []).filter(
            (item) =>
              item.colaborador_id !== args.colaboradorId || item.competencia !== args.competencia,
          );
          return [
            ...semCompetenciaRespondida,
            {
              id: pendenciaId,
              colaborador_id: args.colaboradorId,
              competencia: args.competencia,
              trabalhou: args.trabalhou,
            },
          ];
        },
      );
      qc.invalidateQueries({ queryKey: ["dp_intermitente_confirmacoes"] });
      void resolverPendencias(qc, {
        companyId: selectedCompanyId,
        match: porIds([pendenciaId]),
      });
      qc.invalidateQueries({ queryKey: ["dp_doc_consistencia_janela"] });
      toast.success(
        args.trabalhou
          ? "Registrado: houve trabalho — os documentos do mês passam a ser cobrados."
          : "Registrado: não houve trabalho — nada será cobrado nessa competência.",
      );
    },
    onError: (e: unknown) => {
      void reportError({
        source: "database",
        surface: "Pendências de documentos",
        action: "confirmar trabalho de intermitente",
        error: e,
        userMessage: "Não foi possível registrar a resposta. Tente novamente.",
      });
      toast.error("Não foi possível registrar a resposta. Tente novamente.");
    },
  });

  /** Desfaz a resposta: a competência volta a ser cobrada normalmente. */
  const desfazer = useMutation({
    mutationFn: async (args: { colaboradorId: string; competencia: string }) => {
      const { error } = await supabase
        .from("dp_intermitente_competencia_confirmacoes" as any)
        .delete()
        .eq("company_id", selectedCompanyId!)
        .eq("colaborador_id", args.colaboradorId)
        .eq("competencia", args.competencia);
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      qc.setQueryData<IntermitenteConfirmacao[]>(
        ["dp_intermitente_confirmacoes", selectedCompanyId],
        (atuais) =>
          (atuais ?? []).filter(
            (i) => i.colaborador_id !== args.colaboradorId || i.competencia.slice(0, 7) !== args.competencia.slice(0, 7),
          ),
      );
      qc.invalidateQueries({ queryKey: ["dp_intermitente_confirmacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_doc_consistencia_janela"] });
      toast.success("Desfeito: o documento do mês volta a ser cobrado.");
    },
    onError: (e: unknown) => {
      void reportError({
        source: "database",
        surface: "Pendências de documentos",
        action: "desfazer dispensa de intermitente",
        error: e,
        userMessage: "Não foi possível desfazer. Tente novamente.",
      });
      toast.error("Não foi possível desfazer. Tente novamente.");
    },
  });

  return { confirmacoes: query.data ?? [], isLoading: query.isLoading, responder, desfazer };
}
