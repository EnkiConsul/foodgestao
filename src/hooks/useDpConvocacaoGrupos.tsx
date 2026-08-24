import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import type { Database, Json } from "@/integrations/supabase/types";

export type ConvGrupo = Database["public"]["Tables"]["dp_convocacao_grupos"]["Row"];
export type ConvOcorrencia = Database["public"]["Tables"]["dp_convocacao_ocorrencias"]["Row"];

export interface GrupoComOcorrencias extends ConvGrupo {
  ocorrencias: ConvOcorrencia[];
  unidade_nome?: string | null;
}

/** Grupos de convocação da empresa (novo fluxo). */
export function useDpConvocacaoGrupos(status?: string[]) {
  const { selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: ["dp_convocacao_grupos", selectedCompanyId, status?.join(",") ?? "todos"],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<GrupoComOcorrencias[]> => {
      let q = supabase
        .from("dp_convocacao_grupos")
        .select("*, dp_unidades(nome), dp_convocacao_ocorrencias(*)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (status?.length) q = q.in("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((g: any) => ({
        ...g,
        unidade_nome: g.dp_unidades?.nome ?? null,
        // Necessidades retiradas do rascunho (canceladas) nunca voltam como ativas.
        ocorrencias: ((g.dp_convocacao_ocorrencias ?? []) as ConvOcorrencia[])
          .filter((o) => o.status !== "cancelada")
          .sort((a: ConvOcorrencia, b: ConvOcorrencia) =>
            a.data.localeCompare(b.data) || a.necessidade_entrada.localeCompare(b.necessidade_entrada),
          ),
      }));
    },
  });
}

export interface SalvarGrupoArgs {
  grupo_id: string;
  unidade_id: string;
  competencia: string;
  modalidade: "individual" | "aberta";
  titulo?: string | null;
  observacao?: string | null;
  /** Presente quando o grupo já existe no banco (edição do rascunho). */
  expected_updated_at?: string | null;
}

export interface SalvarOcorrenciaArgs {
  ocorrencia_id: string;
  grupo_id: string;
  cargo_id: string;
  data: string;
  necessidade_entrada: string;
  necessidade_saida: string;
  necessidade_termina_no_dia_seguinte: boolean;
  horario_modo: "horario_unico" | "jornada_individual";
  entrada?: string | null;
  saida?: string | null;
  intervalo_minutos?: number | null;
  termina_no_dia_seguinte?: boolean | null;
  carga_prevista_horas?: number | null;
  vagas: number;
  colaborador_alvo_id?: string | null;
  turno_referencia_id?: string | null;
  condicoes_comuns?: Json;
  /** Presente quando a ocorrência já existe no banco (controle otimista). */
  expected_updated_at?: string | null;
}

/**
 * Rascunho idempotente: o wizard gera os UUIDs no cliente e chama as RPCs
 * `SECURITY DEFINER`, que criam ou atualizam sem duplicar.
 */
export function useSalvarRascunhoConvocacao() {
  const qc = useQueryClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dp_convocacao_grupos"] });

  const salvarGrupo = useMutation({
    mutationFn: async (args: SalvarGrupoArgs) => {
      // Editando um rascunho existente: atualiza, nunca cria outro grupo.
      if (args.expected_updated_at) {
        const { data, error } = await supabase.rpc("dp_convocacao_atualizar_grupo", {
          p_grupo_id: args.grupo_id,
          p_expected_updated_at: args.expected_updated_at,
          p_competencia: args.competencia,
          p_modalidade: args.modalidade,
          p_titulo: args.titulo ?? undefined,
          p_observacao: args.observacao ?? undefined,
        });
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.rpc("dp_convocacao_criar_grupo", {
        p_grupo_id: args.grupo_id,
        p_unidade_id: args.unidade_id,
        p_competencia: args.competencia,
        p_modalidade: args.modalidade,
        p_titulo: args.titulo ?? undefined,
        p_observacao: args.observacao ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });


  const salvarOcorrencia = useMutation({
    mutationFn: async (args: SalvarOcorrenciaArgs) => {
      const comum = {
        p_ocorrencia_id: args.ocorrencia_id,
        p_grupo_id: args.grupo_id,
        p_cargo_id: args.cargo_id,
        p_data: args.data,
        p_necessidade_entrada: args.necessidade_entrada,
        p_necessidade_saida: args.necessidade_saida,
        p_necessidade_termina_no_dia_seguinte: args.necessidade_termina_no_dia_seguinte,
        p_horario_modo: args.horario_modo,
        p_entrada: args.entrada ?? undefined,
        p_saida: args.saida ?? undefined,
        p_intervalo_minutos: args.intervalo_minutos ?? undefined,
        p_termina_no_dia_seguinte: args.termina_no_dia_seguinte ?? undefined,
        p_carga_prevista_horas: args.carga_prevista_horas ?? undefined,
        p_vagas: args.vagas,
        p_colaborador_alvo_id: args.colaborador_alvo_id ?? undefined,
        p_turno_referencia_id: args.turno_referencia_id ?? undefined,
        p_condicoes_comuns: args.condicoes_comuns ?? undefined,
      };

      if (args.expected_updated_at) {
        const { data, error } = await supabase.rpc("dp_convocacao_atualizar_ocorrencia", {
          ...comum,
          p_expected_updated_at: args.expected_updated_at,
        });
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.rpc("dp_convocacao_criar_ocorrencia", comum);
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  return { salvarGrupo, salvarOcorrencia };
}

/** Configuração de convocações resolvida (empresa ou unidade). */
export function useDpConvocacaoConfig(unidadeId?: string | null) {
  const { selectedCompanyId } = useCompanyContext();

  return useQuery({
    queryKey: ["dp_convocacao_config", selectedCompanyId, unidadeId ?? null],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_convocacao_config_resolvida", {
        _company_id: selectedCompanyId!,
        _unidade_id: unidadeId ?? undefined,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) ?? null;
    },
  });
}

export interface SalvarConfigArgs {
  unidade_id?: string | null;
  expected_updated_at?: string | null;
  antecedencia_minima_dias?: number;
  prazo_resposta_dias_uteis?: number;
  permite_oferta_aberta?: boolean;
  exige_justificativa_excecao?: boolean;
  reabre_vaga_em_desistencia?: boolean;
  autonomia_colaborador_desistir?: boolean;
  aprovacao_modo?: string;
  sub_intermitente_por_intermitente?: boolean;
  sub_intermitente_por_freelancer?: boolean;
  sub_freelancer_por_freelancer?: boolean;
  sub_freelancer_por_intermitente?: boolean;
  sub_fixo_em_folga_dominical?: boolean;
}

export function useSalvarConvocacaoConfig() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();

  return useMutation({
    mutationFn: async (args: SalvarConfigArgs) => {
      if (!selectedCompanyId) throw new Error("Selecione uma empresa.");
      const { data, error } = await supabase.rpc("dp_convocacao_salvar_config", {
        p_company_id: selectedCompanyId,
        p_unidade_id: args.unidade_id ?? undefined,
        p_expected_updated_at: args.expected_updated_at ?? undefined,
        p_antecedencia_minima_dias: args.antecedencia_minima_dias,
        p_prazo_resposta_dias_uteis: args.prazo_resposta_dias_uteis,
        p_permite_oferta_aberta: args.permite_oferta_aberta,
        p_exige_justificativa_excecao: args.exige_justificativa_excecao,
        p_reabre_vaga_em_desistencia: args.reabre_vaga_em_desistencia,
        p_autonomia_colaborador_desistir: args.autonomia_colaborador_desistir,
        p_aprovacao_modo: args.aprovacao_modo,
        p_sub_intermitente_por_intermitente: args.sub_intermitente_por_intermitente,
        p_sub_intermitente_por_freelancer: args.sub_intermitente_por_freelancer,
        p_sub_freelancer_por_freelancer: args.sub_freelancer_por_freelancer,
        p_sub_freelancer_por_intermitente: args.sub_freelancer_por_intermitente,
        p_sub_fixo_em_folga_dominical: args.sub_fixo_em_folga_dominical,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_convocacao_config"] }),
  });
}
