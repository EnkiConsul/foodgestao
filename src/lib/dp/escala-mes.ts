// ------------------------------------------------------------------
// Domínio: DP → Escala do mês (Fase 3)
//
// A escala do mês nasce da configuração de trabalho do colaborador
// (Fase 2) e congela o horário do turno em cada dia (snapshot).
// Depois de publicada, alterações no cadastro de turnos não mudam
// retroativamente o que já foi combinado com a equipe.
//
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

import { formatarHoras, LIMITE_SEMANAL } from "@/lib/dp/jornada-utils";
import { cargaLiquidaHoras, turnoViraODia, type TurnoHorario } from "@/lib/dp/turno-utils";
import { turnoDoDia, type ConfigTrabalho, type TurnoResolvido } from "@/lib/dp/config-trabalho";

export type EscalaItemTipo = "trabalho" | "folga" | "ferias" | "afastamento" | "feriado";
export type EscalaItemOrigem = "gerado" | "manual" | "troca" | "convocacao";
export type EscalaStatus = "rascunho" | "publicada" | "arquivada";

export interface EscalaItem {
  colaborador_id: string;
  data: string;
  tipo: EscalaItemTipo;
  turno_id: string | null;
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number;
  termina_no_dia_seguinte: boolean;
  carga_prevista_horas: number;
  origem: EscalaItemOrigem;
  observacao?: string | null;
}

export const TIPO_LABEL: Record<EscalaItemTipo, string> = {
  trabalho: "Trabalho",
  folga: "Folga",
  ferias: "Férias",
  afastamento: "Afastamento",
  feriado: "Feriado",
};

export const STATUS_LABEL: Record<EscalaStatus, string> = {
  rascunho: "Rascunho",
  publicada: "Publicada",
  arquivada: "Arquivada",
};

/** Data ISO (YYYY-MM-DD) interpretada ao meio-dia para evitar deslocamento de fuso. */
export function parseData(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/** Todos os dias de uma competência "YYYY-MM". */
export function diasDaCompetencia(competencia: string): string[] {
  const [ano, mes] = competencia.split("-").map(Number);
  if (!ano || !mes) return [];
  const total = new Date(ano, mes, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${competencia}-${String(i + 1).padStart(2, "0")}`);
}

export function dowDaData(iso: string): number {
  return parseData(iso).getDay();
}

/** Número da semana ISO dentro do mês (1..6), usado para somar carga por semana. */
export function semanaDoMes(iso: string): number {
  const d = parseData(iso);
  const primeiro = new Date(d.getFullYear(), d.getMonth(), 1);
  // Semana começa na segunda-feira.
  const offset = (primeiro.getDay() + 6) % 7;
  return Math.floor((d.getDate() + offset - 1) / 7) + 1;
}

export interface AusenciaIntervalo {
  colaborador_id: string;
  inicio: string;
  fim: string;
  tipo: Extract<EscalaItemTipo, "ferias" | "afastamento">;
}

export interface ColaboradorEscala {
  id: string;
  nome: string;
  regime?: string | null;
  config: ConfigTrabalho | null;
}

export interface GerarEscalaMesInput {
  competencia: string;
  colaboradores: ColaboradorEscala[];
  turnos: TurnoResolvido[];
  ausencias?: AusenciaIntervalo[];
  feriados?: string[];
  /** Itens ajustados manualmente que devem ser preservados na regeneração. */
  preservar?: EscalaItem[];
}

function itemFolga(colaborador_id: string, data: string, tipo: EscalaItemTipo): EscalaItem {
  return {
    colaborador_id,
    data,
    tipo,
    turno_id: null,
    entrada: null,
    saida: null,
    intervalo_minutos: 0,
    termina_no_dia_seguinte: false,
    carga_prevista_horas: 0,
    origem: "gerado",
  };
}

export function itemDeTurno(
  colaborador_id: string,
  data: string,
  turno: TurnoResolvido,
  origem: EscalaItemOrigem = "gerado",
): EscalaItem {
  const horario: TurnoHorario = {
    entrada: turno.entrada,
    saida: turno.saida,
    intervalo_minutos: turno.intervalo_minutos,
  };
  return {
    colaborador_id,
    data,
    tipo: "trabalho",
    turno_id: turno.id,
    entrada: turno.entrada,
    saida: turno.saida,
    intervalo_minutos: turno.intervalo_minutos ?? 0,
    termina_no_dia_seguinte: turnoViraODia(turno.entrada, turno.saida),
    carga_prevista_horas: cargaLiquidaHoras(horario),
    origem,
  };
}

const dentro = (a: AusenciaIntervalo, data: string) => data >= a.inicio && data <= a.fim;

/**
 * Gera a proposta de escala do mês a partir da configuração de trabalho.
 * Colaboradores sem configuração vigente são ignorados (aparecem como pendência).
 */
export function gerarEscalaMes(input: GerarEscalaMesInput): EscalaItem[] {
  const dias = diasDaCompetencia(input.competencia);
  const feriados = new Set(input.feriados ?? []);
  const manuais = new Map(
    (input.preservar ?? [])
      .filter((i) => i.origem !== "gerado")
      .map((i) => [`${i.colaborador_id}|${i.data}`, i]),
  );

  const itens: EscalaItem[] = [];

  for (const colab of input.colaboradores) {
    if (!colab.config) continue;
    const ausencias = (input.ausencias ?? []).filter((a) => a.colaborador_id === colab.id);

    for (const data of dias) {
      const manual = manuais.get(`${colab.id}|${data}`);
      if (manual) {
        itens.push({ ...manual, data, colaborador_id: colab.id });
        continue;
      }

      const ausencia = ausencias.find((a) => dentro(a, data));
      if (ausencia) {
        itens.push(itemFolga(colab.id, data, ausencia.tipo));
        continue;
      }

      const dow = dowDaData(data);
      const dia = colab.config.dias.find((d) => d.dow === dow);
      if (!dia || !dia.trabalha) {
        itens.push(itemFolga(colab.id, data, feriados.has(data) ? "feriado" : "folga"));
        continue;
      }

      const turno = turnoDoDia(dia, colab.config.turno_padrao_id, input.turnos);
      if (!turno) {
        itens.push({ ...itemFolga(colab.id, data, "trabalho"), observacao: "Sem turno definido" });
        continue;
      }
      itens.push(itemDeTurno(colab.id, data, turno));
    }
  }

  return itens;
}

// ------------------------------------------------------------------
// Resumos e conferência
// ------------------------------------------------------------------

export interface ResumoColaborador {
  colaborador_id: string;
  diasTrabalho: number;
  diasFolga: number;
  cargaTotal: number;
  cargaPorSemana: Record<number, number>;
}

export function resumoPorColaborador(itens: EscalaItem[]): ResumoColaborador[] {
  const mapa = new Map<string, ResumoColaborador>();
  for (const item of itens) {
    let r = mapa.get(item.colaborador_id);
    if (!r) {
      r = { colaborador_id: item.colaborador_id, diasTrabalho: 0, diasFolga: 0, cargaTotal: 0, cargaPorSemana: {} };
      mapa.set(item.colaborador_id, r);
    }
    if (item.tipo === "trabalho") {
      r.diasTrabalho += 1;
      r.cargaTotal = Math.round((r.cargaTotal + item.carga_prevista_horas) * 100) / 100;
      const sem = semanaDoMes(item.data);
      r.cargaPorSemana[sem] = Math.round(((r.cargaPorSemana[sem] ?? 0) + item.carga_prevista_horas) * 100) / 100;
    } else {
      r.diasFolga += 1;
    }
  }
  return [...mapa.values()];
}

/** Quantos colaboradores trabalham em cada dia — base para conferir cobertura. */
export function coberturaPorDia(itens: EscalaItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of itens) {
    if (item.tipo !== "trabalho") continue;
    out[item.data] = (out[item.data] ?? 0) + 1;
  }
  return out;
}

export interface AlertaEscala {
  colaborador_id: string | null;
  data?: string;
  nivel: "erro" | "aviso";
  mensagem: string;
}

export interface ValidarEscalaOpts {
  colaboradores: ColaboradorEscala[];
  /** Cobertura mínima por dia da semana (0=domingo). */
  coberturaMinima?: Record<number, number>;
  /** Regimes que não têm validação celetista de carga/DSR. */
  validaCarga?: (regime?: string | null) => boolean;
}

/** Conferência da escala: carga semanal, folga semanal e cobertura mínima. */
export function validarEscalaMes(itens: EscalaItem[], opts: ValidarEscalaOpts): AlertaEscala[] {
  const alertas: AlertaEscala[] = [];
  const nome = new Map(opts.colaboradores.map((c) => [c.id, c.nome]));
  const valida = opts.validaCarga ?? (() => true);
  const regime = new Map(opts.colaboradores.map((c) => [c.id, c.regime ?? null]));

  for (const colab of opts.colaboradores) {
    if (!colab.config) {
      alertas.push({
        colaborador_id: colab.id,
        nivel: "aviso",
        mensagem: `${colab.nome} não tem configuração de trabalho vigente e ficou fora da escala.`,
      });
    }
  }

  for (const item of itens) {
    if (item.tipo === "trabalho" && !item.turno_id) {
      alertas.push({
        colaborador_id: item.colaborador_id,
        data: item.data,
        nivel: "erro",
        mensagem: `${nome.get(item.colaborador_id) ?? "Colaborador"} está sem turno em ${item.data}.`,
      });
    }
  }

  for (const r of resumoPorColaborador(itens)) {
    if (!valida(regime.get(r.colaborador_id))) continue;
    for (const [semana, carga] of Object.entries(r.cargaPorSemana)) {
      if (carga > LIMITE_SEMANAL) {
        alertas.push({
          colaborador_id: r.colaborador_id,
          nivel: "erro",
          mensagem: `${nome.get(r.colaborador_id) ?? "Colaborador"} tem ${formatarHoras(carga)} na semana ${semana} — acima do limite de ${LIMITE_SEMANAL}h.`,
        });
      }
    }
    if (r.diasFolga === 0 && r.diasTrabalho > 0) {
      alertas.push({
        colaborador_id: r.colaborador_id,
        nivel: "erro",
        mensagem: `${nome.get(r.colaborador_id) ?? "Colaborador"} está sem nenhuma folga no mês.`,
      });
    }
  }

  if (opts.coberturaMinima) {
    const cobertura = coberturaPorDia(itens);
    const dias = new Set(itens.map((i) => i.data));
    for (const data of [...dias].sort()) {
      const minimo = opts.coberturaMinima[dowDaData(data)];
      if (minimo == null) continue;
      const total = cobertura[data] ?? 0;
      if (total < minimo) {
        alertas.push({
          colaborador_id: null,
          data,
          nivel: "aviso",
          mensagem: `${data}: ${total} de ${minimo} pessoas escaladas.`,
        });
      }
    }
  }

  return alertas;
}

export function escalaTemErro(alertas: AlertaEscala[]): boolean {
  return alertas.some((a) => a.nivel === "erro");
}

/** Rótulo curto da célula da grade: "17:00" para trabalho, sigla para ausências. */
export function rotuloCelula(item: EscalaItem | undefined): string {
  if (!item) return "—";
  if (item.tipo === "trabalho") return item.entrada ? item.entrada.slice(0, 5) : "?";
  if (item.tipo === "folga") return "F";
  if (item.tipo === "ferias") return "FÉ";
  if (item.tipo === "feriado") return "FD";
  return "AF";
}
