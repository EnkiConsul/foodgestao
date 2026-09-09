import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import {
  competenciaEfeito,
  optanteNaCompetencia,
  situacaoAtual,
  validarSolicitacaoPortal,
  type AdiantamentoSolicitacao,
  type AdiantamentoTipoSolicitacao,
} from "@/lib/dp/adiantamento-opcao";

function hojeISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Solicitações datadas de adiantamento (ativar/cancelar). Fonte única para
 * saber se a competência estava com adiantamento ativo — substitui a chave
 * liga/desliga do cadastro (que fica só como cache sincronizado por trigger).
 */
export function useDpAdiantamentoSolicitacoes(colaboradorId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dp_adiantamento_solicitacoes", selectedCompanyId, colaboradorId ?? "todos"],
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
    queryFn: async (): Promise<AdiantamentoSolicitacao[]> => {
      let q = supabase
        .from("dp_adiantamento_solicitacoes" as any)
        .select("id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, observacao, created_at")
        .eq("company_id", selectedCompanyId!)
        .order("data_solicitacao", { ascending: true })
        .order("created_at", { ascending: true });
      if (colaboradorId) q = q.eq("colaborador_id", colaboradorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AdiantamentoSolicitacao[];
    },
  });

  const registrar = useMutation({
    mutationFn: async (args: {
      colaboradorId: string;
      tipo: AdiantamentoTipoSolicitacao;
      dataSolicitacao: string;
      diaPagamento?: number | null;
      origem: "gestor" | "portal";
      observacao?: string | null;
    }) => {
      if (args.origem === "portal") {
        const erro = validarSolicitacaoPortal(args.dataSolicitacao, args.diaPagamento, hojeISO());
        if (erro) throw new Error(erro);
      }
      const efeito = competenciaEfeito(args.dataSolicitacao, args.diaPagamento);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_adiantamento_solicitacoes" as any).insert({
        company_id: selectedCompanyId!,
        colaborador_id: args.colaboradorId,
        tipo: args.tipo,
        data_solicitacao: args.dataSolicitacao,
        competencia_efeito: efeito,
        origem: args.origem,
        observacao: args.observacao ?? null,
        criado_por: auth.user?.id ?? null,
      } as any);
      if (error) throw error;

      if (args.origem === "portal") {
        // Ciência ao gestor — sem aprovação, a solicitação já vale.
        try {
          await supabase.from("dp_notificacoes").insert({
            company_id: selectedCompanyId!,
            colaborador_id: args.colaboradorId,
            tipo: "solicitacao_nova",
            titulo: args.tipo === "ativar" ? "Pedido de adiantamento salarial" : "Cancelamento de adiantamento",
            descricao: `Solicitado pelo portal em ${args.dataSolicitacao.slice(8, 10)}/${args.dataSolicitacao.slice(5, 7)}/${args.dataSolicitacao.slice(0, 4)} — vale a partir de ${efeito}.`,
            ref_table: "dp_adiantamento_solicitacoes",
            para_admins: true,
          } as any);
        } catch (e) {
          console.warn("notificacao/adiantamento:", e);
        }
      }
      return efeito;
    },
    onSuccess: (efeito, args) => {
      qc.invalidateQueries({ queryKey: ["dp_adiantamento_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
      qc.invalidateQueries({ queryKey: ["dp_doc_consistencia_janela"] });
      const rotulo = args.tipo === "ativar" ? "Adiantamento ativado" : "Adiantamento cancelado";
      toast.success(`${rotulo} — vale a partir de ${efeito}.`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível registrar a solicitação."),
  });

  return {
    solicitacoes: query.data ?? [],
    isLoading: query.isLoading,
    registrar,
    optanteNaCompetencia: (
      solicitacoes: AdiantamentoSolicitacao[],
      competencia: string,
      fallback?: boolean | null,
    ) => optanteNaCompetencia(solicitacoes, competencia, fallback),
    situacaoAtual: (solicitacoes: AdiantamentoSolicitacao[], fallback?: boolean | null) =>
      situacaoAtual(solicitacoes, hojeISO(), fallback),
    hojeISO,
  };
}
