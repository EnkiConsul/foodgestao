import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { carregarPisosPorCargo, referenciaSalarial } from "@/lib/dp/cargoSalariosQuery";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { apuracaoParaLancamento, type LinhaApuracao } from "@/lib/dp/apuracao";
import {
  remuneracaoPendente,
  valorHoraEfetivo,
  type FormaPagamento,
} from "@/lib/dp/remuneracao";

export interface BaseSalarial {
  salarioBase: number | null;
  cargaSemanalHoras: number | null;
  valorHora?: number;
  formaPagamento: FormaPagamento;
  dependentes: number;
  adicionalPercentual: number;
  /** Motivo do bloqueio quando a remuneração não está cadastrada. */
  pendencia: string | null;
}


/**
 * Fase 12 — Base salarial dos colaboradores e envio da apuração do ponto
 * para a folha (período + lançamentos em rascunho).
 */
export function useDpFolhaApuracao(competencia: string) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const competenciaDate = `${competencia}-01`;

  const basesQuery = useQuery({
    queryKey: ["dp_folha_base_salarial", selectedCompanyId, competencia],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [colabRes, configRes, pisos] = await Promise.all([
        supabase
          .from("dp_colaboradores")
          .select(
            "id, cargo_id, unidade_id, forma_pagamento, salario_base, valor_hora, dependentes_irrf, adicional_percentual, dp_cargos:cargo_id(salario_base)",
          )
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true),
        supabase
          .from("dp_colaborador_config_trabalho")
          .select("colaborador_id, carga_semanal_horas, vigencia_inicio")
          .eq("company_id", selectedCompanyId!)
          .order("vigencia_inicio", { ascending: false }),
        // O piso do cargo pode variar por unidade (convenção patronal da unidade).
        carregarPisosPorCargo(selectedCompanyId!),
      ]);
      if (colabRes.error) throw colabRes.error;
      if (configRes.error) throw configRes.error;

      const cargas = new Map<string, number | null>();
      for (const c of configRes.data ?? []) {
        if (!cargas.has(c.colaborador_id)) cargas.set(c.colaborador_id, c.carga_semanal_horas ?? null);
      }

      const bases = new Map<string, BaseSalarial>();
      for (const c of (colabRes.data ?? []) as any[]) {
        const cargaSemanalHoras = cargas.get(c.id) ?? null;
        const remuneracao = {
          forma_pagamento: (c.forma_pagamento ?? "mensalista") as FormaPagamento,
          salario_base: c.salario_base ?? null,
          valor_hora: c.valor_hora ?? null,
          salario_cargo: referenciaSalarial(pisos, c.cargo_id, c.unidade_id, competenciaDate),

        };
        bases.set(c.id, {
          salarioBase: remuneracao.salario_base ?? remuneracao.salario_cargo ?? null,
          cargaSemanalHoras,
          valorHora: valorHoraEfetivo(remuneracao, cargaSemanalHoras),
          formaPagamento: remuneracao.forma_pagamento,
          dependentes: Number(c.dependentes_irrf ?? 0),
          adicionalPercentual: Number(c.adicional_percentual ?? 0),
          pendencia: remuneracaoPendente(remuneracao),
        });
      }

      return bases;
    },
  });

  const periodoQuery = useQuery({
    queryKey: ["dp_folha_periodo", selectedCompanyId, competencia],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folha_periodos")
        .select("id, status, data_pagamento, dp_folha_lancamentos(count)")
        .eq("company_id", selectedCompanyId!)
        .eq("competencia", competenciaDate)
        .eq("tipo", "contracheque_mensal")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const lanc = (data as { dp_folha_lancamentos?: { count: number }[] }).dp_folha_lancamentos;
      return {
        id: data.id,
        status: data.status,
        data_pagamento: data.data_pagamento,
        totalLancamentos: lanc?.[0]?.count ?? 0,
      };
    },
  });

  const enviarParaFolha = useMutation({
    mutationFn: async (linhas: LinhaApuracao[]) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");

      const bases = basesQuery.data;
      const lancamentos = linhas
        .map((l) => {
          const base = bases?.get(l.colaborador_id);
          return apuracaoParaLancamento(l, {
            dependentes: base?.dependentes ?? 0,
            adicionalPercentual: base?.adicionalPercentual ?? 0,
          });
        })
        .filter((l): l is NonNullable<typeof l> => !!l);
      if (!lancamentos.length) {
        throw new Error(
          "Nenhum colaborador com remuneração cadastrada. Informe salário ou valor da hora no cadastro do colaborador.",
        );
      }


      let periodoId = periodoQuery.data?.id ?? null;
      let status = periodoQuery.data?.status ?? null;

      if (!periodoId) {
        const { data, error } = await supabase
          .from("dp_folha_periodos")
          .insert({
            company_id: selectedCompanyId,
            competencia: competenciaDate,
            tipo: "contracheque_mensal",
            status: "aberto",
          })
          .select("id, status")
          .single();
        if (error) throw error;
        periodoId = data.id;
        status = data.status;
      }

      if (status && status !== "aberto") {
        throw new Error("O período da folha já foi fechado. Reabra-o para reprocessar a apuração.");
      }

      const { error: errLanc } = await supabase.from("dp_folha_lancamentos").upsert(
        lancamentos.map((l) => ({
          company_id: selectedCompanyId,
          periodo_id: periodoId!,
          colaborador_id: l.colaborador_id,
          tipo: "contracheque_mensal" as const,
          valor_bruto: l.valor_bruto,
          valor_liquido: l.valor_liquido,
          descontos: l.descontos,
          status: "rascunho" as const,
          observacoes: `Gerado pela apuração do ponto (${competencia}).`,
        })),
        { onConflict: "periodo_id,colaborador_id,tipo" },
      );
      if (errLanc) throw errLanc;

      return lancamentos.length;
    },
    onSuccess: (total) => {
      toast.success(`${total} lançamento(s) de folha gerados em rascunho.`);
      qc.invalidateQueries({ queryKey: ["dp_folha_periodo"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível gerar os lançamentos da folha."),
  });

  const semSalario = useMemo(() => {
    const bases = basesQuery.data;
    if (!bases) return 0;
    return [...bases.values()].filter((b) => !!b.pendencia).length;
  }, [basesQuery.data]);


  return {
    bases: basesQuery.data ?? new Map<string, BaseSalarial>(),
    isLoading: basesQuery.isLoading,
    periodo: periodoQuery.data ?? null,
    semSalario,
    enviarParaFolha,
  };
}
