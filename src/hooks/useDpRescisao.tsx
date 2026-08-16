import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { carregarPisosPorCargo, referenciaSalarial } from "@/lib/dp/cargoSalariosQuery";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { lerDetalhe, lerExtras, valoresDoLancamento, type RubricaExtra } from "@/lib/dp/folha";
import { verbasDaRescisao } from "@/lib/dp/rescisao";
import type { MotivoDesligamento } from "@/lib/dp/desligamento";

export interface ColaboradorDesligado {
  id: string;
  nome: string;
  cargo: string | null;
  salarioBase: number | null;
  dataAdmissao: string | null;
  dataDesligamento: string;
  motivo: MotivoDesligamento;
  unidadeId: string | null;
}

/** Colaboradores com desligamento registrado, mais recentes primeiro (Fase 19). */
export function useDpColaboradoresDesligados() {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_colaboradores_desligados", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<ColaboradorDesligado[]> => {
      const [{ data, error }, pisos] = await Promise.all([
        supabase
          .from("dp_colaboradores")
          .select(
            "id, nome, data_admissao, data_desligamento, motivo_desligamento, unidade_id, cargo_id, dp_cargos:cargo_id(nome, salario_base)",
          )
          .eq("company_id", selectedCompanyId!)
          .not("data_desligamento", "is", null)
          .order("data_desligamento", { ascending: false }),
        // O piso do cargo pode variar por unidade (convenção patronal da unidade).
        carregarPisosPorCargo(selectedCompanyId!),
      ]);
      if (error) throw error;
      return (data ?? [])
        .filter((c) => !!c.data_desligamento)
        .map((c) => {
          const cargo = (c as { dp_cargos?: { nome: string; salario_base: number | null } | null }).dp_cargos;
          return {
            id: c.id,
            nome: c.nome,
            cargo: cargo?.nome ?? null,
            salarioBase: referenciaSalarial(
              pisos,
              (c as { cargo_id?: string | null }).cargo_id ?? null,
              c.unidade_id ?? null,
              cargo?.salario_base ?? null,
              (c.data_desligamento as string) ?? undefined,
            ),
            dataAdmissao: c.data_admissao ?? null,
            dataDesligamento: c.data_desligamento as string,
            motivo: (c.motivo_desligamento ?? "outro") as MotivoDesligamento,
            unidadeId: c.unidade_id ?? null,
          };
        });
    },
  });

  return { desligados: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

export interface RescisaoParams {
  diasFeriasVencidas: number;
  saldoFgts: number;
  descontarAvisoNaoCumprido: boolean;
  dependentes: number;
}

export const RESCISAO_PARAMS_PADRAO: RescisaoParams = {
  diasFeriasVencidas: 0,
  saldoFgts: 0,
  descontarAvisoNaoCumprido: false,
  dependentes: 0,
};

/** Calcula o TRCT de um colaborador desligado. */
export function calcularRescisao(colab: ColaboradorDesligado | null, params: RescisaoParams) {
  if (!colab || !colab.salarioBase || !colab.dataAdmissao) {
    return { rubricas: [] as RubricaExtra[], bruto: 0, liquido: 0, detalhe: lerDetalhe({}) };
  }
  const rubricas = verbasDaRescisao({
    salarioBase: colab.salarioBase,
    admissao: colab.dataAdmissao,
    desligamento: colab.dataDesligamento,
    motivo: colab.motivo,
    diasFeriasVencidas: params.diasFeriasVencidas,
    saldoFgts: params.saldoFgts,
    descontarAvisoNaoCumprido: params.descontarAvisoNaoCumprido,
  });
  const detalhe = { ...lerDetalhe({ dependentes: params.dependentes }), extras: lerExtras(rubricas) };
  return { rubricas, detalhe, ...valoresDoLancamento(detalhe) };
}

/** Gera o lançamento de rescisão em rascunho no período do mês do desligamento. */
export function useDpGerarRescisao() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ colab, params }: { colab: ColaboradorDesligado; params: RescisaoParams }) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const calc = calcularRescisao(colab, params);
      if (!calc.rubricas.length) {
        throw new Error("Cadastre o salário base do cargo e a data de admissão antes de calcular a rescisão.");
      }
      const competencia = `${colab.dataDesligamento.slice(0, 7)}-01`;

      const { data: existente, error: errSel } = await supabase
        .from("dp_folha_periodos")
        .select("id, status")
        .eq("company_id", selectedCompanyId)
        .eq("competencia", competencia)
        .eq("tipo", "rescisao")
        .maybeSingle();
      if (errSel) throw errSel;
      if (existente && existente.status !== "aberto") {
        throw new Error("O período de rescisões desta competência está fechado. Reabra-o para reprocessar.");
      }

      let periodoId = existente?.id;
      if (!periodoId) {
        const { data: novo, error: errIns } = await supabase
          .from("dp_folha_periodos")
          .insert({ company_id: selectedCompanyId, competencia, tipo: "rescisao", status: "aberto" })
          .select("id")
          .single();
        if (errIns) throw errIns;
        periodoId = novo.id;
      }

      const { error } = await supabase.from("dp_folha_lancamentos").upsert(
        {
          company_id: selectedCompanyId,
          periodo_id: periodoId,
          colaborador_id: colab.id,
          tipo: "rescisao" as const,
          valor_bruto: calc.bruto,
          valor_liquido: calc.liquido,
          descontos: JSON.parse(JSON.stringify(calc.detalhe)),
          status: "rascunho" as const,
          observacoes: `Rescisão em ${colab.dataDesligamento}.`,
        },
        { onConflict: "periodo_id,colaborador_id,tipo" },
      );
      if (error) throw error;
      return periodoId;
    },
    onSuccess: () => {
      toast.success("Rescisão gerada em rascunho na folha.");
      qc.invalidateQueries({ queryKey: ["dp_folha_periodos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível gerar a rescisão."),
  });
}
