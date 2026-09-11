import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpFeriasConfig } from "@/hooks/useDpFeriasConfig";
import { isSocio } from "@/lib/dp/contrato-policy";
import {
  montarProgramacao,
  type MontarProgramacaoOpts,
  type ProgramacaoDados,
} from "@/lib/dp/ferias-programacao";

const TIPOS_AFASTAMENTO = ["atestado", "licenca_maternidade", "licenca_paternidade"] as const;

export type FiltroProgramacao = { unidadeId: string | null; incluirDesligados: boolean };

/**
 * Dados do relatório de programação de férias da empresa, no formato
 * sintético da contabilidade (uma linha por período aquisitivo).
 */
export function useDpFeriasProgramacao(filtro: FiltroProgramacao) {
  const { selectedCompanyId } = useCompanyContext();
  const { data: feriasConfig } = useDpFeriasConfig();

  const query = useQuery({
    queryKey: ["dp_ferias_programacao", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [empresa, colaboradores, periodos, gozos, afastamentos] = await Promise.all([
        supabase
          .from("companies")
          .select("name, trade_name, cnpj")
          .eq("id", selectedCompanyId!)
          .single(),
        supabase
          .from("dp_colaboradores")
          .select("id, nome, matricula, data_admissao, unidade_id, ativo, vinculo_label")
          .eq("company_id", selectedCompanyId!)
          .order("nome"),
        supabase
          .from("dp_ferias_periodos")
          .select(
            "id, colaborador_id, inicio_aquisitivo, fim_aquisitivo, limite_concessivo, dias_direito, dias_gozados, dias_saldo, dias_vendidos, faltas_injustificadas, status, controle_externo",
          )
          .eq("company_id", selectedCompanyId!),
        supabase
          .from("dp_ferias_gozos")
          .select("colaborador_id, periodo_id, data_inicio, dias, dias_abono, adiantar_13, status")
          .eq("company_id", selectedCompanyId!)
          .neq("status", "cancelado"),
        supabase
          .from("dp_solicitacoes")
          .select("colaborador_id, data_alvo, data_fim, tipo, status")
          .eq("company_id", selectedCompanyId!)
          .in("tipo", [...TIPOS_AFASTAMENTO])
          .eq("status", "aprovado"),
      ]);
      const err = [empresa, colaboradores, periodos, gozos, afastamentos].find((r) => r.error);
      if (err?.error) throw err.error;

      return {
        razaoSocial: (empresa.data?.trade_name || empresa.data?.name || "Empresa").toUpperCase(),
        cnpj: empresa.data?.cnpj ?? null,
        colaboradores: (colaboradores.data ?? []).map((c) => ({
          id: c.id,
          nome: c.nome,
          matricula: c.matricula,
          data_admissao: c.data_admissao,
          unidade_id: c.unidade_id,
          socio: isSocio(c.vinculo_label),
          desligado: c.ativo === false,
        })),
        periodos: periodos.data ?? [],
        gozos: gozos.data ?? [],
        afastamentos: (afastamentos.data ?? [])
          .filter((a) => !!a.data_alvo && !!a.data_fim)
          .map((a) => ({
            colaborador_id: a.colaborador_id,
            data_inicio: a.data_alvo!,
            data_fim: a.data_fim!,
          })),
      };
    },
  });

  const dados = query.data;

  const relatorio: ProgramacaoDados | null = useMemo(() => {
    if (!dados) return null;
    const opts: MontarProgramacaoOpts = {
      colaboradores: dados.colaboradores,
      periodos: dados.periodos,
      gozos: dados.gozos,
      afastamentos: dados.afastamentos,
      dataBase: new Date().toLocaleDateString("en-CA"), // ISO local, sem fuso
      emitidoEm: new Date(),
      razaoSocial: dados.razaoSocial,
      cnpj: dados.cnpj,
      politica: feriasConfig?.sinalizacaoCicloEncerrado ?? "a_conceder",
      unidadeId: filtro.unidadeId,
      incluirDesligados: filtro.incluirDesligados,
    };
    return montarProgramacao(opts);
  }, [dados, feriasConfig, filtro.unidadeId, filtro.incluirDesligados]);

  return { relatorio, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}
