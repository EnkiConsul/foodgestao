import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  GRUPOS_PADRAO,
  mesclarPadrao,
  padraoParaColunasColaborador,
  type BeneficiosPadraoLinha,
  type BeneficiosPadraoPayload,
  type GrupoPadrao,
  type PadraoAlcance,
} from "@/lib/dp/beneficiosPadrao";

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
        .eq("company_id", selectedCompanyId!);
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
      /** Colaborador aberto na tela: mantém o que está no formulário. */
      ignorarColaboradorId?: string | null;
      /** Quais grupos replicar; os demais ficam como já estavam. */
      grupos?: readonly GrupoPadrao[];
    }): Promise<{ id: string; atualizados: number }> => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");

      const { data: userData } = await supabase.auth.getUser();
      let q = supabase
        .from("dp_beneficios_padroes")
        .select("id, payload")
        .eq("company_id", selectedCompanyId);
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

      // Empresa manda em todos; unidade manda nos cargos dela.
      if (input.limparEscoposMaisEspecificos) {
        let del = supabase
          .from("dp_beneficios_padroes")
          .delete()
          .eq("company_id", selectedCompanyId);
        if (input.unidade_id) {
          del = del.eq("unidade_id", input.unidade_id).not("cargo_id", "is", null);
        } else {
          del = del.not("unidade_id", "is", null);
        }
        const { error: erroDel } = await del;
        if (erroDel) throw erroDel;
        if (!input.unidade_id) {
          const { error: erroCargos } = await supabase
            .from("dp_beneficios_padroes")
            .delete()
            .eq("company_id", selectedCompanyId)
            .is("unidade_id", null)
            .not("cargo_id", "is", null);
          if (erroCargos) throw erroCargos;
        }
      }



      /**
       * Alcance "todos": propaga o padrão para os colaboradores ativos do
       * escopo (empresa, unidade ou cargo), exceto o que está aberto na tela.
       */
      async function aplicarAosColaboradores(): Promise<number> {
        if (input.alcance !== "todos") return 0;
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
        const ids = (colabs ?? [])
          .map((c: any) => c.id as string)
          .filter((id) => id !== input.ignorarColaboradorId);
        if (!ids.length) return 0;

        const { error: erroUpdate } = await supabase
          .from("dp_colaboradores")
          .update(padraoParaColunasColaborador(input.payload, grupos) as any)
          .in("id", ids);
        if (erroUpdate) throw erroUpdate;

        // Ficha de benefícios: espelha os itens marcados/desmarcados no padrão.
        const ficha = grupos.includes("beneficios")
          ? Object.entries(input.payload.beneficios ?? {})
          : [];
        if (ficha.length) {
          const { data: atuais, error: erroFicha } = await supabase
            .from("dp_colaborador_beneficios")
            .select("id, colaborador_id, beneficio_id, ativo")
            .eq("company_id", selectedCompanyId!)
            .in("colaborador_id", ids);
          if (erroFicha) throw erroFicha;
          const hoje = new Date().toISOString().slice(0, 10);
          for (const colaboradorId of ids) {
            for (const [beneficioId, marcadoRaw] of ficha) {
              const marcado = !!marcadoRaw;
              const atual = (atuais ?? []).find(
                (a: any) => a.colaborador_id === colaboradorId && a.beneficio_id === beneficioId,
              ) as any;
              if (!atual && !marcado) continue;
              if (atual && !!atual.ativo === marcado) continue;
              if (atual) {
                const { error } = await supabase
                  .from("dp_colaborador_beneficios")
                  .update({ ativo: marcado })
                  .eq("id", atual.id);
                if (error) throw error;
              } else {
                const { error } = await supabase.from("dp_colaborador_beneficios").insert({
                  company_id: selectedCompanyId,
                  colaborador_id: colaboradorId,
                  beneficio_id: beneficioId,
                  data_inicio: hoje,
                  ativo: true,
                } as any);
                if (error) throw error;
              }
            }
          }
        }
        return ids.length;
      }

      if (existente?.id) {
        const { error } = await supabase
          .from("dp_beneficios_padroes")
          .update({ payload: payloadFinal as any })
          .eq("id", existente.id);
        if (error) throw error;
        const atualizados = await aplicarAosColaboradores();
        return { id: existente.id as string, atualizados };
      }
      const { data, error } = await supabase
        .from("dp_beneficios_padroes")
        .insert({
          company_id: selectedCompanyId,
          unidade_id: input.unidade_id,
          cargo_id: input.cargo_id ?? null,
          payload: payloadFinal as any,
          created_by: userData.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const atualizados = await aplicarAosColaboradores();
      return { id: data.id as string, atualizados };
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
      const { error } = await supabase.from("dp_beneficios_padroes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

