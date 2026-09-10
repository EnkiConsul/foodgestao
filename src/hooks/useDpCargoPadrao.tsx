import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  padraoDoCargo,
  type CargoPadrao,
  type PadraoColaboradorFonte,
  type PadraoConfigFonte,
  type PadraoBeneficioFonte,
} from "@/lib/dp/cargoPadrao";
import type { DiaConfig } from "@/lib/dp/config-trabalho";

/**
 * Padrão praticado pelos colaboradores já cadastrados em um cargo: vínculo,
 * setor, jornada, forma de pagamento e benefícios. Serve para preencher a
 * mudança de condições com o que a empresa já faz nesse cargo.
 */
export function useDpCargoPadrao(
  cargoId?: string | null,
  unidadeId?: string | null,
  excluirId?: string | null,
) {
  const { selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: ["dp_cargo_padrao", selectedCompanyId, cargoId ?? "none", unidadeId ?? "todas", excluirId ?? "-"],
    enabled: !!selectedCompanyId && !!cargoId,
    staleTime: 60_000,
    queryFn: async (): Promise<CargoPadrao> => {
      const { data: colabs, error } = await supabase
        .from("dp_colaboradores")
        .select("id, cargo_id, unidade_id, setor_id, regime, forma_pagamento, data_desligamento")
        .eq("company_id", selectedCompanyId!)
        .eq("cargo_id", cargoId!)
        .is("data_desligamento", null);
      if (error) throw error;

      const colaboradores = (colabs ?? []) as PadraoColaboradorFonte[];
      const ids = colaboradores.map((c) => c.id).filter((id) => id !== excluirId);
      if (ids.length === 0) {
        return padraoDoCargo({ colaboradores }, { cargoId, unidadeId, excluirId });
      }

      const [{ data: cfgs }, { data: bens }] = await Promise.all([
        supabase
          .from("dp_colaborador_config_trabalho")
          .select(
            "colaborador_id, turno_padrao_id, carga_semanal_horas, folga_variavel, folga_fixa_dow, vigencia_fim, vigencia_inicio, dias:dp_colaborador_config_dias(dow, trabalha, turno_id, entrada, saida, intervalo_minutos, setor_id)",
          )
          .eq("company_id", selectedCompanyId!)
          .in("colaborador_id", ids)
          .order("vigencia_inicio", { ascending: false }),
        supabase
          .from("dp_colaborador_beneficios")
          .select("colaborador_id, beneficio_id, valor, ativo, data_fim")
          .eq("company_id", selectedCompanyId!)
          .in("colaborador_id", ids),
      ]);

      const configs: PadraoConfigFonte[] = (cfgs ?? []).map((c) => {
        const row = c as unknown as PadraoConfigFonte & { dias?: DiaConfig[] };
        return {
          colaborador_id: row.colaborador_id,
          turno_padrao_id: row.turno_padrao_id ?? null,
          carga_semanal_horas: row.carga_semanal_horas ?? null,
          folga_variavel: row.folga_variavel ?? null,
          folga_fixa_dow: row.folga_fixa_dow ?? null,
          vigencia_fim: row.vigencia_fim ?? null,
          dias: [...(row.dias ?? [])].sort((a, b) => a.dow - b.dow),
        };
      });

      return padraoDoCargo(
        { colaboradores, configs, beneficios: (bens ?? []) as PadraoBeneficioFonte[] },
        { cargoId, unidadeId, excluirId },
      );
    },
  });
}
