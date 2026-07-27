// ------------------------------------------------------------------
// Domínio: DP → Registro de ponto (Fase 7)
//
// Compara o que foi previsto (Fase 6) com o que foi efetivamente
// marcado pelo colaborador, produzindo horas trabalhadas, saldo,
// atraso e o status do dia. Funções puras.
// ------------------------------------------------------------------

import { paraMinutos } from "@/lib/dp/jornada-utils";
import type { HorarioPrevisto } from "@/lib/dp/horario-previsto";

export type PontoTipo = "entrada" | "intervalo_inicio" | "intervalo_fim" | "saida";
export type PontoOrigem = "portal" | "admin" | "importado";

export const ORDEM_MARCACOES: PontoTipo[] = ["entrada", "intervalo_inicio", "intervalo_fim", "saida"];

export const PONTO_TIPO_LABEL: Record<PontoTipo, string> = {
  entrada: "Entrada",
  intervalo_inicio: "Início do intervalo",
  intervalo_fim: "Volta do intervalo",
  saida: "Saída",
};

export const PONTO_ORIGEM_LABEL: Record<PontoOrigem, string> = {
  portal: "Portal do colaborador",
  admin: "Lançado pelo DP",
  importado: "Importado",
};

export interface Marcacao {
  tipo: PontoTipo;
  registrado_em: string;
  origem?: PontoOrigem;
  observacao?: string | null;
}

export type StatusDia =
  | "folga"
  | "sem_registro"
  | "em_andamento"
  | "incompleto"
  | "completo"
  | "falta";

export const STATUS_DIA_LABEL: Record<StatusDia, string> = {
  folga: "Folga",
  sem_registro: "Sem registro",
  em_andamento: "Em andamento",
  incompleto: "Marcações incompletas",
  completo: "Completo",
  falta: "Falta",
};

/** Hora local "HH:MM" de um timestamp ISO. */
export function horaDaMarcacao(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Próxima marcação esperada na sequência; null quando o dia já foi fechado. */
export function proximaMarcacao(marcacoes: Pick<Marcacao, "tipo">[]): PontoTipo | null {
  const feitas = new Set(marcacoes.map((m) => m.tipo));
  if (!feitas.has("entrada")) return "entrada";
  if (feitas.has("saida")) return null;
  if (!feitas.has("intervalo_inicio")) return "intervalo_inicio";
  if (!feitas.has("intervalo_fim")) return "intervalo_fim";
  return "saida";
}

const minutosEntre = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

export interface ResumoPontoDia {
  data: string;
  status: StatusDia;
  entrada: string | null;
  saida: string | null;
  intervaloMinutos: number;
  minutosTrabalhados: number;
  minutosPrevistos: number;
  saldoMinutos: number;
  atrasoMinutos: number;
  extraMinutos: number;
  faltamMarcacoes: PontoTipo[];
}

export interface ConsolidarDiaInput {
  data: string;
  previsto?: HorarioPrevisto | null;
  marcacoes: Marcacao[];
  /** Tolerância de atraso em minutos (padrão CLT: 5). */
  toleranciaMinutos?: number;
  /** O dia já terminou? Dias em curso não viram falta. */
  encerrado?: boolean;
}

/** Consolida um dia de ponto contra o horário previsto. */
export function consolidarDia(input: ConsolidarDiaInput): ResumoPontoDia {
  const tolerancia = input.toleranciaMinutos ?? 5;
  const previsto = input.previsto ?? null;
  const minutosPrevistos = previsto?.trabalha
    ? Math.round(Number(previsto.carga_prevista_horas || 0) * 60)
    : 0;

  const porTipo = new Map(input.marcacoes.map((m) => [m.tipo, m]));
  const entrada = porTipo.get("entrada") ?? null;
  const saida = porTipo.get("saida") ?? null;
  const iniInt = porTipo.get("intervalo_inicio") ?? null;
  const fimInt = porTipo.get("intervalo_fim") ?? null;

  const intervaloMinutos = iniInt && fimInt ? minutosEntre(iniInt.registrado_em, fimInt.registrado_em) : 0;
  const bruto = entrada && saida ? minutosEntre(entrada.registrado_em, saida.registrado_em) : 0;
  const minutosTrabalhados = Math.max(0, bruto - intervaloMinutos);

  const faltamMarcacoes = ORDEM_MARCACOES.filter((t) => !porTipo.has(t));

  let atrasoMinutos = 0;
  if (entrada && previsto?.trabalha && previsto.entrada) {
    const prev = paraMinutos(previsto.entrada);
    const real = paraMinutos(horaDaMarcacao(entrada.registrado_em));
    if (prev !== null && real !== null) atrasoMinutos = Math.max(0, real - prev - tolerancia);
  }

  let status: StatusDia;
  if (!previsto?.trabalha && !input.marcacoes.length) {
    status = previsto?.tipo === "folga" ? "folga" : "sem_registro";
  } else if (!input.marcacoes.length) {
    status = input.encerrado ? "falta" : "sem_registro";
  } else if (!saida) {
    status = input.encerrado ? "incompleto" : "em_andamento";
  } else if (iniInt && !fimInt) {
    status = "incompleto";
  } else {
    status = "completo";
  }

  const saldoMinutos = status === "completo" ? minutosTrabalhados - minutosPrevistos : 0;

  return {
    data: input.data,
    status,
    entrada: entrada ? horaDaMarcacao(entrada.registrado_em) : null,
    saida: saida ? horaDaMarcacao(saida.registrado_em) : null,
    intervaloMinutos,
    minutosTrabalhados,
    minutosPrevistos,
    saldoMinutos,
    atrasoMinutos,
    extraMinutos: Math.max(0, saldoMinutos),
    faltamMarcacoes,
  };
}

/** "+1h20" / "-45min" / "0min" */
export function formatarSaldo(minutos: number): string {
  if (!minutos) return "0min";
  const sinal = minutos > 0 ? "+" : "-";
  const abs = Math.abs(minutos);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (!h) return `${sinal}${m}min`;
  return m ? `${sinal}${h}h${String(m).padStart(2, "0")}` : `${sinal}${h}h`;
}

/** "7h30" a partir de minutos. */
export function formatarDuracao(minutos: number): string {
  const abs = Math.max(0, Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export interface TotaisPeriodo {
  dias: number;
  diasCompletos: number;
  faltas: number;
  minutosTrabalhados: number;
  minutosPrevistos: number;
  saldoMinutos: number;
  atrasoMinutos: number;
}

/** Espelho do período: totais e saldo acumulado. */
export function totalizarPeriodo(dias: ResumoPontoDia[]): TotaisPeriodo {
  return dias.reduce<TotaisPeriodo>(
    (acc, d) => ({
      dias: acc.dias + 1,
      diasCompletos: acc.diasCompletos + (d.status === "completo" ? 1 : 0),
      faltas: acc.faltas + (d.status === "falta" ? 1 : 0),
      minutosTrabalhados: acc.minutosTrabalhados + d.minutosTrabalhados,
      minutosPrevistos: acc.minutosPrevistos + d.minutosPrevistos,
      saldoMinutos: acc.saldoMinutos + d.saldoMinutos,
      atrasoMinutos: acc.atrasoMinutos + d.atrasoMinutos,
    }),
    {
      dias: 0,
      diasCompletos: 0,
      faltas: 0,
      minutosTrabalhados: 0,
      minutosPrevistos: 0,
      saldoMinutos: 0,
      atrasoMinutos: 0,
    },
  );
}
