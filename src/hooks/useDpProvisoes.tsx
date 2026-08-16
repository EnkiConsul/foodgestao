import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { carregarPisosPorCargo, referenciaSalarial } from "@/lib/dp/cargoSalariosQuery";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { lerDetalhe, lerExtras, valoresDoLancamento, type RubricaExtra } from "@/lib/dp/folha";
import {
  avosDoDecimoTerceiro,
  diasDeGozo,
  rubricasDeFerias,
  rubricasDoDecimoTerceiro,
} from "@/lib/dp/provisoes";

/** Detalhe zerado usado por lançamentos que só têm rubricas (férias/13º). */
const detalheComRubricas = (extras: RubricaExtra[], dependentes: number) => ({
  ...lerDetalhe({ dependentes }),
  extras: lerExtras(extras),
});

export interface BaseColaborador {
  id: string;
  nome: string;
  salarioBase: number | null;
  dataAdmissao: string | null;
  dependentes: number;
}

/** Colaboradores ativos com salário base do cargo (Fase 18). */
export function useDpBasesColaboradores() {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_bases_colaboradores", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<BaseColaborador[]> => {
      const [{ data, error }, pisos] = await Promise.all([
        supabase
          .from("dp_colaboradores")
          .select("id, nome, data_admissao, cargo_id, unidade_id, dp_cargos:cargo_id(salario_base)")
          .eq("company_id", selectedCompanyId!)
          .eq("ativo", true),
        // O piso do cargo pode variar por unidade (convenção patronal da unidade).
        carregarPisosPorCargo(selectedCompanyId!),
      ]);
      if (error) throw error;
      return (data ?? [])
        .map((c) => ({
          id: c.id,
          nome: c.nome,
          salarioBase: referenciaSalarial(
            pisos,
            c.cargo_id,
            (c as { unidade_id?: string | null }).unidade_id ?? null,
          ),

          dataAdmissao: c.data_admissao ?? null,
          dependentes: 0,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });

  return { colaboradores: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/** Encontra (ou cria) um período de folha aberto para o tipo/competência. */
async function garantirPeriodo(
  companyId: string,
  competencia: string,
  tipo: "ferias" | "decimo_terceiro",
): Promise<string> {
  const { data, error } = await supabase
    .from("dp_folha_periodos")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("competencia", competencia)
    .eq("tipo", tipo)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    if (data.status !== "aberto") {
      throw new Error("Já existe um período fechado para esta competência. Reabra-o para reprocessar.");
    }
    return data.id;
  }
  const { data: novo, error: errIns } = await supabase
    .from("dp_folha_periodos")
    .insert({ company_id: companyId, competencia, tipo, status: "aberto" })
    .select("id")
    .single();
  if (errIns) throw errIns;
  return novo.id;
}

/**
 * Fase 18 — recibos de férias da competência a partir dos gozos
 * aprovados no mês (dias, abono e adiantamento do 13º).
 */
export function useDpFolhaFerias(competencia: string) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const competenciaDate = `${competencia}-01`;
  const { colaboradores } = useDpBasesColaboradores();

  const gozosQuery = useQuery({
    queryKey: ["dp_folha_ferias_gozos", selectedCompanyId, competencia],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const fim = new Date(Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7)), 0)
        .toISOString()
        .slice(0, 10);
      const { data, error } = await supabase
        .from("dp_ferias_gozos")
        .select("id, colaborador_id, data_inicio, data_fim, dias_abono, adiantar_13, status")
        .eq("company_id", selectedCompanyId!)
        .gte("data_inicio", competenciaDate)
        .lte("data_inicio", fim)
        .in("status", ["aprovado", "em_gozo", "concluido"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const previa = (gozosQuery.data ?? []).map((g) => {
    const colab = colaboradores.find((c) => c.id === g.colaborador_id);
    const rubricas = rubricasDeFerias({
      salarioBase: colab?.salarioBase ?? 0,
      diasGozo: diasDeGozo(g.data_inicio, g.data_fim),
      diasAbono: g.dias_abono ?? 0,
      adiantar13: g.adiantar_13 ?? false,
    });
    const detalhe = detalheComRubricas(rubricas, colab?.dependentes ?? 0);
    return {
      gozoId: g.id,
      colaboradorId: g.colaborador_id,
      nome: colab?.nome ?? "Colaborador",
      semSalario: !colab?.salarioBase,
      rubricas,
      ...valoresDoLancamento(detalhe),
      detalhe,
    };
  });

  const gerar = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const validos = previa.filter((p) => p.rubricas.length > 0);
      if (!validos.length) throw new Error("Nenhuma férias com salário base cadastrado nesta competência.");

      const periodoId = await garantirPeriodo(selectedCompanyId, competenciaDate, "ferias");
      const { error } = await supabase.from("dp_folha_lancamentos").upsert(
        validos.map((p) => ({
          company_id: selectedCompanyId,
          periodo_id: periodoId,
          colaborador_id: p.colaboradorId,
          tipo: "ferias" as const,
          valor_bruto: p.bruto,
          valor_liquido: p.liquido,
          descontos: JSON.parse(JSON.stringify(p.detalhe)),
          status: "rascunho" as const,
          observacoes: `Recibo de férias gerado em ${competencia}.`,
        })),
        { onConflict: "periodo_id,colaborador_id,tipo" },
      );
      if (error) throw error;
      return validos.length;
    },
    onSuccess: (total) => {
      toast.success(`${total} recibo(s) de férias gerados em rascunho.`);
      qc.invalidateQueries({ queryKey: ["dp_folha_periodos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível gerar os recibos de férias."),
  });

  return { previa, isLoading: gozosQuery.isLoading, error: gozosQuery.error, gerar };
}

/** Fase 18 — 13º salário em duas parcelas. */
export function useDpFolhaDecimoTerceiro(ano: number, parcela: 1 | 2) {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const competenciaDate = parcela === 1 ? `${ano}-11-01` : `${ano}-12-01`;
  const { colaboradores, isLoading } = useDpBasesColaboradores();

  const adiantamentosQuery = useQuery({
    queryKey: ["dp_folha_13_adiantamentos", selectedCompanyId, ano],
    enabled: !!selectedCompanyId && parcela === 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folha_lancamentos")
        .select("colaborador_id, valor_bruto, dp_folha_periodos!inner(competencia, tipo)")
        .eq("company_id", selectedCompanyId!)
        .eq("tipo", "decimo_terceiro")
        .eq("dp_folha_periodos.competencia", `${ano}-11-01`);
      if (error) throw error;
      const mapa = new Map<string, number>();
      for (const l of data ?? []) mapa.set(l.colaborador_id, Number(l.valor_bruto ?? 0));
      return mapa;
    },
  });

  const previa = colaboradores.map((c) => {
    const avos = avosDoDecimoTerceiro(ano, c.dataAdmissao);
    const rubricas = rubricasDoDecimoTerceiro({
      salarioBase: c.salarioBase ?? 0,
      avos,
      parcela,
      adiantamento: adiantamentosQuery.data?.get(c.id) ?? 0,
    });
    const detalhe = detalheComRubricas(rubricas, c.dependentes);
    return {
      colaboradorId: c.id,
      nome: c.nome,
      avos,
      semSalario: !c.salarioBase,
      rubricas,
      ...valoresDoLancamento(detalhe),
      detalhe,
    };
  });

  const gerar = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const validos = previa.filter((p) => p.rubricas.length > 0);
      if (!validos.length) throw new Error("Nenhum colaborador elegível ao 13º com salário base cadastrado.");

      const periodoId = await garantirPeriodo(selectedCompanyId, competenciaDate, "decimo_terceiro");
      const { error } = await supabase.from("dp_folha_lancamentos").upsert(
        validos.map((p) => ({
          company_id: selectedCompanyId,
          periodo_id: periodoId,
          colaborador_id: p.colaboradorId,
          tipo: "decimo_terceiro" as const,
          valor_bruto: p.bruto,
          valor_liquido: p.liquido,
          descontos: JSON.parse(JSON.stringify(p.detalhe)),
          status: "rascunho" as const,
          observacoes: `13º salário ${ano} — ${parcela}ª parcela.`,
        })),
        { onConflict: "periodo_id,colaborador_id,tipo" },
      );
      if (error) throw error;
      return validos.length;
    },
    onSuccess: (total) => {
      toast.success(`${total} lançamento(s) de 13º gerados em rascunho.`);
      qc.invalidateQueries({ queryKey: ["dp_folha_periodos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível gerar o 13º salário."),
  });

  return { previa, isLoading: isLoading || adiantamentosQuery.isLoading, gerar };
}
