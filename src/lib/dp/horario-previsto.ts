// ------------------------------------------------------------------
// Domínio: DP → Horário previsto (Fase 6)
//
// Fonte única da verdade do "o que era esperado" em cada dia de cada
// colaborador. Consolida, nesta ordem de precedência:
//   1. Convocação aceita (contrato intermitente)
//   2. Item da escala publicada (snapshot congelado)
//   3. Item da escala em rascunho (ainda pode mudar)
//   4. Padrão habitual da configuração de trabalho (CLT e afins)
//   5. Sem previsão
//
// É a base para a Operação do Dia e para o futuro ponto eletrônico.
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

import { dowDaData, type EscalaItem, type EscalaItemTipo } from "@/lib/dp/escala-mes";
import { turnoDoDia, type ConfigTrabalho, type TurnoResolvido } from "@/lib/dp/config-trabalho";
import { cargaLiquidaHoras, turnoViraODia } from "@/lib/dp/turno-utils";
import { contratoPolicy, type RegimeTrabalho } from "@/lib/dp/contrato-policy";
import { hhmm, paraMinutos } from "@/lib/dp/jornada-utils";

export type FontePrevisto =
  | "convocacao"
  | "escala_publicada"
  | "escala_rascunho"
  | "habitual"
  | "sem_previsao";

export const FONTE_LABEL: Record<FontePrevisto, string> = {
  convocacao: "Convocação aceita",
  escala_publicada: "Escala publicada",
  escala_rascunho: "Escala em rascunho",
  habitual: "Padrão habitual",
  sem_previsao: "Sem previsão",
};

/** Só a escala publicada e a convocação aceita são compromissos firmes. */
export function fonteConfirmada(fonte: FontePrevisto): boolean {
  return fonte === "convocacao" || fonte === "escala_publicada";
}

export interface HorarioPrevisto {
  colaborador_id: string;
  data: string;
  trabalha: boolean;
  tipo: EscalaItemTipo | null;
  turno_id: string | null;
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number;
  termina_no_dia_seguinte: boolean;
  carga_prevista_horas: number;
  fonte: FontePrevisto;
  confirmado: boolean;
  observacao?: string | null;
}

export interface ConvocacaoPrevista {
  colaborador_id: string;
  data: string;
  status: string;
  turno_id?: string | null;
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  termina_no_dia_seguinte?: boolean;
  carga_prevista_horas?: number;
  observacao?: string | null;
}

export interface ColaboradorPrevisto {
  id: string;
  regime?: RegimeTrabalho | string | null;
  config?: ConfigTrabalho | null;
}

function vazio(
  colaborador_id: string,
  data: string,
  fonte: FontePrevisto,
  tipo: EscalaItemTipo | null = null,
  observacao: string | null = null,
): HorarioPrevisto {
  return {
    colaborador_id,
    data,
    trabalha: false,
    tipo,
    turno_id: null,
    entrada: null,
    saida: null,
    intervalo_minutos: 0,
    termina_no_dia_seguinte: false,
    carga_prevista_horas: 0,
    fonte,
    confirmado: fonteConfirmada(fonte),
    observacao,
  };
}

function doItem(item: EscalaItem, fonte: FontePrevisto): HorarioPrevisto {
  const trabalha = item.tipo === "trabalho";
  return {
    colaborador_id: item.colaborador_id,
    data: item.data,
    trabalha,
    tipo: item.tipo,
    turno_id: item.turno_id,
    entrada: trabalha && item.entrada ? hhmm(item.entrada) : null,
    saida: trabalha && item.saida ? hhmm(item.saida) : null,
    intervalo_minutos: trabalha ? (item.intervalo_minutos ?? 0) : 0,
    termina_no_dia_seguinte: trabalha ? item.termina_no_dia_seguinte : false,
    carga_prevista_horas: trabalha ? Number(item.carga_prevista_horas ?? 0) : 0,
    fonte,
    confirmado: fonteConfirmada(fonte),
    observacao: item.observacao ?? null,
  };
}

function daConvocacao(c: ConvocacaoPrevista): HorarioPrevisto {
  const entrada = hhmm(c.entrada);
  const saida = hhmm(c.saida);
  const intervalo = Math.max(0, c.intervalo_minutos || 0);
  return {
    colaborador_id: c.colaborador_id,
    data: c.data,
    trabalha: true,
    tipo: "trabalho",
    turno_id: c.turno_id ?? null,
    entrada,
    saida,
    intervalo_minutos: intervalo,
    termina_no_dia_seguinte: c.termina_no_dia_seguinte ?? turnoViraODia(entrada, saida),
    carga_prevista_horas:
      Number(c.carga_prevista_horas ?? 0) ||
      cargaLiquidaHoras({ entrada, saida, intervalo_minutos: intervalo }),
    fonte: "convocacao",
    confirmado: true,
    observacao: c.observacao ?? null,
  };
}

export interface ResolverPrevistoInput {
  colaborador: ColaboradorPrevisto;
  data: string;
  /** Item salvo na escala do mês, se existir. */
  item?: EscalaItem | null;
  /** A escala que contém o item já foi publicada? */
  escalaPublicada?: boolean;
  /** Convocação do colaborador naquela data, em qualquer status. */
  convocacao?: ConvocacaoPrevista | null;
  /** Turnos vigentes, usados apenas no fallback habitual. */
  turnos?: TurnoResolvido[];
}

/** Resolve o horário previsto de um colaborador em um dia. */
export function resolverHorarioPrevisto(input: ResolverPrevistoInput): HorarioPrevisto {
  const { colaborador, data } = input;

  if (input.convocacao && input.convocacao.status === "aceita") {
    return daConvocacao(input.convocacao);
  }

  if (input.item) {
    return doItem(input.item, input.escalaPublicada ? "escala_publicada" : "escala_rascunho");
  }

  const regime = (colaborador.regime ?? null) as RegimeTrabalho | null;
  // Intermitente não tem padrão habitual: sem convocação aceita, não há previsão.
  if (regime && contratoPolicy(regime).horasPorConvocacao) {
    return vazio(colaborador.id, data, "sem_previsao");
  }

  const config = colaborador.config;
  if (!config) return vazio(colaborador.id, data, "sem_previsao");

  const dia = config.dias.find((d) => d.dow === dowDaData(data));
  if (!dia || !dia.trabalha) return vazio(colaborador.id, data, "habitual", "folga");

  // Horário próprio do dia (variação da semana, sem turno na loja) tem prioridade
  // sobre o turno padrão do colaborador.
  if (dia.entrada && dia.saida) {
    const ent = hhmm(dia.entrada);
    const sai = hhmm(dia.saida);
    const inter = Math.max(0, dia.intervalo_minutos ?? 0);
    return {
      colaborador_id: colaborador.id,
      data,
      trabalha: true,
      tipo: "trabalho",
      turno_id: dia.turno_id ?? null,
      entrada: ent,
      saida: sai,
      intervalo_minutos: inter,
      termina_no_dia_seguinte: turnoViraODia(ent, sai),
      carga_prevista_horas: cargaLiquidaHoras({ entrada: ent, saida: sai, intervalo_minutos: inter }),
      fonte: "habitual",
      confirmado: false,
      observacao: null,
    };
  }

  const turno = turnoDoDia(dia, config.turno_padrao_id, input.turnos ?? []);
  if (!turno) return vazio(colaborador.id, data, "sem_previsao");

  const entrada = hhmm(turno.entrada);
  const saida = hhmm(turno.saida);
  return {
    colaborador_id: colaborador.id,
    data,
    trabalha: true,
    tipo: "trabalho",
    turno_id: turno.id,
    entrada,
    saida,
    intervalo_minutos: Math.max(0, turno.intervalo_minutos || 0),
    termina_no_dia_seguinte: turnoViraODia(entrada, saida),
    carga_prevista_horas: cargaLiquidaHoras(turno),
    fonte: "habitual",
    confirmado: false,
    observacao: null,
  };
}

export interface ResolverPeriodoInput {
  datas: string[];
  colaboradores: ColaboradorPrevisto[];
  itens?: EscalaItem[];
  /** ids/competências publicadas — quando true, todos os itens vêm de escala publicada. */
  escalaPublicada?: boolean;
  convocacoes?: ConvocacaoPrevista[];
  turnos?: TurnoResolvido[];
}

const chave = (colaborador_id: string, data: string) => `${colaborador_id}|${data}`;

/** Resolve o horário previsto de vários colaboradores em um intervalo de datas. */
export function resolverPeriodo(input: ResolverPeriodoInput): HorarioPrevisto[] {
  const itens = new Map((input.itens ?? []).map((i) => [chave(i.colaborador_id, i.data), i]));
  const convocacoes = new Map(
    (input.convocacoes ?? []).map((c) => [chave(c.colaborador_id, c.data), c]),
  );

  const out: HorarioPrevisto[] = [];
  for (const colaborador of input.colaboradores) {
    for (const data of input.datas) {
      out.push(
        resolverHorarioPrevisto({
          colaborador,
          data,
          item: itens.get(chave(colaborador.id, data)) ?? null,
          escalaPublicada: input.escalaPublicada,
          convocacao: convocacoes.get(chave(colaborador.id, data)) ?? null,
          turnos: input.turnos,
        }),
      );
    }
  }
  return out;
}

/** Soma das horas previstas de trabalho. */
export function horasPrevistas(lista: Pick<HorarioPrevisto, "carga_prevista_horas">[]): number {
  const total = lista.reduce((s, p) => s + Number(p.carga_prevista_horas || 0), 0);
  return Math.round(total * 100) / 100;
}

/** Próximo compromisso de trabalho a partir de uma data (inclusive). */
export function proximoTurnoPrevisto(
  lista: HorarioPrevisto[],
  aPartirDe: string,
): HorarioPrevisto | null {
  return (
    lista
      .filter((p) => p.trabalha && p.data >= aPartirDe)
      .sort(
        (a, b) =>
          a.data.localeCompare(b.data) ||
          (paraMinutos(a.entrada) ?? 0) - (paraMinutos(b.entrada) ?? 0),
      )[0] ?? null
  );
}

/** Texto curto do previsto: "08:00 → 17:00 (+1)" ou o motivo da ausência. */
export function textoPrevisto(p: HorarioPrevisto): string {
  if (!p.trabalha) return p.tipo === "folga" ? "Folga" : "Sem previsão";
  const faixa = `${p.entrada ?? "--:--"} → ${p.saida ?? "--:--"}`;
  return p.termina_no_dia_seguinte ? `${faixa} (+1)` : faixa;
}
