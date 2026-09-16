// ------------------------------------------------------------------
// Domínio: DP → Base da escala do mês (integração com a jornada)
//
// Aqui vive a transformação usada pelo hook da escala: linhas do banco →
// configuração de trabalho de domínio → itens gerados → payload persistido.
// Existe como módulo puro para que o caminho inteiro seja testável sem React
// nem Supabase: era exatamente nesse trecho que os horários próprios do dia
// (entrada/saída/intervalo da ficha) se perdiam antes de chegar ao gerador.
//
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

import { normalizarDias, type ConfigTrabalho, type DiaConfig } from "@/lib/dp/config-trabalho";
import type { ColaboradorEscala, EscalaItem } from "@/lib/dp/escala-mes";

/** Linha de `dp_colaborador_config_dias` como vem da consulta da escala. */
export interface ConfigDiaRow {
  dow: number;
  trabalha: boolean;
  turno_id: string | null;
  setor_id?: string | null;
  entrada?: string | null;
  saida?: string | null;
  intervalo_minutos?: number | null;
}

/** Linha de `dp_colaborador_config_trabalho` com os dias aninhados. */
export interface ConfigTrabalhoRow {
  colaborador_id: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  turno_padrao_id: string | null;
  folga_variavel: boolean;
  folga_fixa_dow: number | null;
  dias?: ConfigDiaRow[] | null;
}

/** Linha de `dp_colaboradores` usada pela escala. */
export interface ColaboradorRow {
  id: string;
  nome: string;
  regime?: string | null;
  unidade_id?: string | null;
}

const hhmm = (v: string | null | undefined): string | null =>
  v ? String(v).slice(0, 5) : null;

/**
 * Dias da configuração no formato de domínio, preservando o horário próprio do
 * dia e o setor habitual. Perder esses campos aqui significa gerar a escala com
 * o horário do turno em lugar do horário combinado na ficha.
 */
export function mapearDiasConfig(rows: ConfigDiaRow[] | null | undefined): DiaConfig[] {
  return (rows ?? []).map((d) => ({
    dow: d.dow,
    trabalha: d.trabalha,
    turno_id: d.turno_id ?? null,
    entrada: hhmm(d.entrada),
    saida: hhmm(d.saida),
    intervalo_minutos: d.intervalo_minutos ?? null,
    setor_id: d.setor_id ?? null,
  }));
}

/** Configuração vigente na competência (a mais recente que cobre o intervalo). */
export function configVigente(
  configs: ConfigTrabalhoRow[],
  colaboradorId: string,
  inicio: string,
  fim: string,
): ConfigTrabalhoRow | null {
  return (
    configs.find(
      (cfg) =>
        cfg.colaborador_id === colaboradorId &&
        cfg.vigencia_inicio <= fim &&
        (!cfg.vigencia_fim || cfg.vigencia_fim >= inicio),
    ) ?? null
  );
}

export function configParaDominio(row: ConfigTrabalhoRow): ConfigTrabalho {
  return {
    turno_padrao_id: row.turno_padrao_id,
    folga_variavel: row.folga_variavel,
    folga_fixa_dow: row.folga_fixa_dow,
    dias: normalizarDias(
      mapearDiasConfig(row.dias),
      row.folga_variavel ? null : row.folga_fixa_dow,
    ),
  };
}

export interface MontarColaboradoresInput {
  colaboradores: ColaboradorRow[];
  configs: ConfigTrabalhoRow[];
  unidadeId?: string | null;
  inicio: string;
  fim: string;
}

/** Colaboradores da unidade com a configuração vigente já em formato de domínio. */
export function montarColaboradoresEscala(input: MontarColaboradoresInput): ColaboradorEscala[] {
  return input.colaboradores
    .filter((c) => !input.unidadeId || c.unidade_id === input.unidadeId)
    .map((c) => {
      const vigente = configVigente(input.configs, c.id, input.inicio, input.fim);
      return {
        id: c.id,
        nome: c.nome,
        regime: c.regime ?? null,
        config: vigente ? configParaDominio(vigente) : null,
      };
    });
}

export interface EscalaItemPersistivel {
  company_id: string;
  escala_id: string;
  colaborador_id: string;
  data: string;
  tipo: EscalaItem["tipo"];
  turno_id: string | null;
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number;
  termina_no_dia_seguinte: boolean;
  carga_prevista_horas: number;
  origem: EscalaItem["origem"];
  observacao: string | null;
  setor_id: string | null;
  setor_motivo: string | null;
}

/**
 * Payload gravado em `dp_escala_itens`. `turno_id` só carrega UUID de turno
 * cadastrado; dia com horário próprio e sem turno vai com null e mantém o
 * horário, a carga e a virada de dia.
 */
export function itemParaLinha(
  item: EscalaItem,
  companyId: string,
  escalaId: string,
  origem?: EscalaItem["origem"],
): EscalaItemPersistivel {
  return {
    company_id: companyId,
    escala_id: escalaId,
    colaborador_id: item.colaborador_id,
    data: item.data,
    tipo: item.tipo,
    turno_id: item.turno_id ?? null,
    entrada: item.entrada,
    saida: item.saida,
    intervalo_minutos: item.intervalo_minutos,
    termina_no_dia_seguinte: item.termina_no_dia_seguinte,
    carga_prevista_horas: item.carga_prevista_horas,
    origem: origem ?? item.origem,
    observacao: item.observacao ?? null,
    setor_id: item.setor_id ?? null,
    setor_motivo: item.setor_motivo ?? null,
  };
}
