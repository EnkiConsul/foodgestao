import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { normalizarDias, type DiaConfig } from "@/lib/dp/config-trabalho";
import type { HorarioSimples } from "@/lib/dp/turno-resolver";

export interface ModeloHorarioColaborador {
  /** Id da configuração de trabalho de origem. */
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  cargo: string | null;
  cargo_id: string | null;
  unidade_id: string | null;
  turno_padrao_id: string | null;
  folga_variavel: boolean;
  /** Horário base (turno padrão da vigência). */
  horario: HorarioSimples | null;
  /** Semana completa, já com as exceções de horário por dia. */
  dias: DiaConfig[];
  usado_em: string;
}

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Horários de trabalho vigentes dos colegas — fonte única tanto do diálogo
 * "Copiar de outro colaborador" quanto dos atalhos de horário do painel.
 *
 * Traz os horários próprios de cada dia (exceções), que antes eram perdidos
 * na cópia porque não vinham no select.
 */
export function useDpModelosHorario(unidadeId?: string | null, excluirColaboradorId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();

  const query = useQuery({
    queryKey: ["dp_modelos_horario", selectedCompanyId, unidadeId ?? null],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_colaborador_config_trabalho")
        .select(
          "id, colaborador_id, unidade_id, turno_padrao_id, folga_variavel, folga_fixa_dow, vigencia_inicio, vigencia_fim, updated_at," +
            " dias:dp_colaborador_config_dias(dow, trabalha, turno_id, entrada, saida, intervalo_minutos)," +
            " colaborador:dp_colaboradores(nome, cargo, cargo_id, ativo)," +
            " turno:dp_turnos!dp_colaborador_config_trabalho_turno_padrao_id_fkey(entrada, saida, intervalo_minutos)",
        )
        .eq("company_id", selectedCompanyId!)
        .order("vigencia_inicio", { ascending: false });
      if (unidadeId) q = q.eq("unidade_id", unidadeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const modelos = useMemo<ModeloHorarioColaborador[]>(() => {
    const vistos = new Set<string>();
    return (query.data ?? [])
      .filter((c) => !c.vigencia_fim || c.vigencia_fim >= hoje())
      .filter((c) => c.colaborador?.ativo !== false)
      .filter((c) => !excluirColaboradorId || c.colaborador_id !== excluirColaboradorId)
      .filter((c) => {
        if (vistos.has(c.colaborador_id)) return false;
        vistos.add(c.colaborador_id);
        return true;
      })
      .map((c) => ({
        id: c.id,
        colaborador_id: c.colaborador_id,
        colaborador_nome: c.colaborador?.nome ?? "Colaborador",
        cargo: c.colaborador?.cargo ?? null,
        cargo_id: c.colaborador?.cargo_id ?? null,
        unidade_id: c.unidade_id ?? null,
        turno_padrao_id: c.turno_padrao_id ?? null,
        folga_variavel: !!c.folga_variavel,
        horario: c.turno?.entrada && c.turno?.saida
          ? {
            entrada: String(c.turno.entrada).slice(0, 5),
            saida: String(c.turno.saida).slice(0, 5),
            intervalo_minutos: c.turno.intervalo_minutos ?? 0,
          }
          : null,
        dias: normalizarDias(
          (c.dias ?? []).map((d: any) => ({
            dow: d.dow,
            trabalha: d.trabalha,
            turno_id: d.turno_id ?? null,
            entrada: d.entrada ?? null,
            saida: d.saida ?? null,
            intervalo_minutos: d.intervalo_minutos ?? null,
          })),
          c.folga_fixa_dow ?? null,
        ),
        usado_em: c.updated_at ?? c.vigencia_inicio,
      }));
  }, [query.data, excluirColaboradorId]);

  return { modelos, isLoading: query.isLoading, refetch: query.refetch };
}
