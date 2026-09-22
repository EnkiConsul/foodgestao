import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ajustarColaboradoresEmLote } from "@/lib/dp/colaborador-oficial";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  GRUPOS_PADRAO,
  mesclarPadrao,
  idsAlvoPadrao,
  padraoParaColunasColaborador,
  type BeneficiosPadraoLinha,
  type BeneficiosPadraoPayload,
  type GrupoPadrao,
  type PadraoAlcance,
} from "@/lib/dp/beneficiosPadrao";
import {
  salvarBeneficioPadrao,
  definirBeneficiosColaboradorLote,
  excluirCadastroRemuneracao,
} from "@/lib/dp/remuneracao-oficial";

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
        .select("id, unidade_id, cargo_id, payload, updated_at")
        .eq("company_id", selectedCompanyId!)
        .is("removido_em", null);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        unidade_id: r.unidade_id,
        cargo_id: r.cargo_id,
        payload: (r.payload ?? {}) as BeneficiosPadraoPayload,
        updated_at: r.updated_at,
      }));
    },
  });
}

/**
 * Grava (ou substitui) o padrão do escopo informado:
 * unidade + cargo = padrão do cargo na unidade; só unidade = padrão da unidade;
 * nenhum dos dois = padrão da empresa.
 */
export function useSalvarDpBeneficiosPadrao() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  return useMutation({
    mutationFn: async (input: {
      unidade_id: string | null;
      cargo_id?: string | null;
      payload: BeneficiosPadraoPayload;
      /** Apaga os padrões mais específicos abrangidos por este escopo. */
      limparEscoposMaisEspecificos?: boolean;
      /** "novos" = só os próximos cadastros; "todos" = também quem já existe. */
      alcance?: PadraoAlcance;
      /** Ids escolhidos na mão quando o alcance é "selecionados". */
      colaboradorIds?: readonly string[] | null;
      /** Colaborador aberto na tela: mantém o que está no formulário. */
      ignorarColaboradorId?: string | null;
      /** Quais grupos replicar; os demais ficam como já estavam. */
      grupos?: readonly GrupoPadrao[];
    }): Promise<{ id: string; atualizados: number }> => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");

      let q = supabase
        .from("dp_beneficios_padroes")
        .select("id, payload")
        .eq("company_id", selectedCompanyId)
        .is("removido_em", null);
      q = input.unidade_id ? q.eq("unidade_id", input.unidade_id) : q.is("unidade_id", null);
      q = input.cargo_id ? q.eq("cargo_id", input.cargo_id) : q.is("cargo_id", null);
      const { data: existente, error: erroBusca } = await q.maybeSingle();
      if (erroBusca) throw erroBusca;

      const grupos = input.grupos?.length ? input.grupos : GRUPOS_PADRAO;
      // Só os grupos escolhidos são sobrescritos no padrão gravado.
      const payloadFinal = mesclarPadrao(
        (existente as any)?.payload as BeneficiosPadraoPayload | undefined,
        input.payload,
        grupos,
      );

      /**
       * Alcance "todos": propaga para os colaboradores ativos do escopo
       * (empresa, unidade ou cargo). Alcance "selecionados": só os ids
       * escolhidos na tela. Em ambos, o colaborador aberto fica de fora.
       */
      async function aplicarAosColaboradores(): Promise<number> {
        if (input.alcance !== "todos" && input.alcance !== "selecionados") return 0;
        let alvos = supabase
          .from("dp_colaboradores")
          .select("id")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true)
          .is("data_desligamento", null);
        if (input.unidade_id) alvos = alvos.eq("unidade_id", input.unidade_id);
        if (input.cargo_id) alvos = alvos.eq("cargo_id", input.cargo_id);
        const { data: colabs, error: erroAlvos } = await alvos;
        if (erroAlvos) throw erroAlvos;
        const ids = idsAlvoPadrao(
          (colabs ?? []).map((c: any) => c.id as string),
          input.alcance,
          input.colaboradorIds,
          input.ignorarColaboradorId,
        );
        if (!ids.length) return 0;

        await ajustarColaboradoresEmLote({
          companyId: selectedCompanyId,
          ids,
          dados: padraoParaColunasColaborador(input.payload, grupos),
        });

        // Ficha de benefícios: espelha os itens marcados/desmarcados no padrão.
        const ficha = grupos.includes("beneficios")
          ? Object.entries(input.payload.beneficios ?? {})
          : [];
        if (ficha.length) {
          const { data: atuais, error: erroFicha } = await supabase
            .from("dp_colaborador_beneficios")
            .select("id, colaborador_id, beneficio_id, ativo")
            .eq("company_id", selectedCompanyId!)
            .is("removido_em", null)
            .in("colaborador_id", ids);
          if (erroFicha) throw erroFicha;
          const hoje = new Date().toISOString().slice(0, 10);
          const itens: Record<string, unknown>[] = [];
          for (const colaboradorId of ids) {
            for (const [beneficioId, marcadoRaw] of ficha) {
              const marcado = !!marcadoRaw;
              const atual = (atuais ?? []).find(
                (a: any) => a.colaborador_id === colaboradorId && a.beneficio_id === beneficioId,
              ) as any;
              if (!atual && !marcado) continue;
              if (atual && !!atual.ativo === marcado) continue;
              if (atual) {
                itens.push({ id: atual.id, ativo: marcado });
              } else {
                itens.push({
                  colaborador_id: colaboradorId,
                  beneficio_id: beneficioId,
                  data_inicio: hoje,
                  ativo: true,
                });
              }
            }
          }
          await definirBeneficiosColaboradorLote(itens);
        }
        return ids.length;
      }

      const id = await salvarBeneficioPadrao({
        companyId: selectedCompanyId,
        payload: payloadFinal as unknown as Record<string, unknown>,
        unidadeId: input.unidade_id,
        cargoId: input.cargo_id ?? null,
        limparEscoposMaisEspecificos: input.limparEscoposMaisEspecificos ?? false,
      });
      const atualizados = await aplicarAosColaboradores();
      return { id, atualizados };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [KEY] });
      void qc.invalidateQueries({ queryKey: ["dp_colaboradores"] });
      void qc.invalidateQueries({ queryKey: ["dp_colaborador_beneficios"] });
    },
  });
}

export function useRemoverDpBeneficiosPadrao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await excluirCadastroRemuneracao("dp_beneficios_padroes", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

