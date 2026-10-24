import type { ResultadoDesligamento } from "./desligamento-motor.ts";

export type RegraDescansoAviso = {
  origem: "colaborador" | "cargo" | "unidade";
  modo: "semanas" | "por_mes";
  semanas: number;
  porMes: number;
  dias: number[];
};
export type DiagnosticoEscalaAviso = {
  apto: boolean;
  origem: RegraDescansoAviso["origem"];
  limiteSemBanco: string | null;
  descansos: string[];
  /** Kept for compatibility: later rests are cancelled on confirmation, never a pending item. */
  posteriores: string[];
  /** Months without any work in the notice: no Sunday/weekend rest is owed. */
  mesesIsentos: string[];
  pendencias: string[];
};
const dow = (data: string) => new Date(`${data}T00:00:00Z`).getUTCDay();
const br = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Termination check only guarantees the Sunday (or negotiated weekend day) rest of each
 * civil month that still has work. Weekly fixed rest and consecutive-day counts are
 * contractual and are not audited here. Rests taken earlier in the month (before the
 * communication) count via `descansosAnteriores`. A month with no work owes nothing,
 * and the check blocks only when an eligible weekend workday remains before the limit.
 */
export function diagnosticarEscalaAviso(
  base: ResultadoDesligamento, regra: RegraDescansoAviso, folgasAgendadas: string[],
  descansosConfirmados?: string[], descansosAnteriores: string[] = [],
): DiagnosticoEscalaAviso {
  const limite = base.ultimoComparecimento;
  const dias = regra.dias.length ? regra.dias : [0];
  const calendario = base.calendario.filter((d) => limite && d.data <= limite);
  const descansos = calendario.filter((d) => d.classificacao === "folga_regular" && dias.includes(dow(d.data)) && (!descansosConfirmados || descansosConfirmados.includes(d.data))).map((d) => d.data);
  const anteriores = descansosAnteriores.filter((d) => dias.includes(dow(d)));
  const posteriores = limite ? folgasAgendadas.filter((d) => d > limite).sort() : [];
  const meses = [...new Set(base.calendario.map((d) => d.data.slice(0, 7)))].sort();
  const mesesIsentos: string[] = [];
  const pendencias: string[] = [];
  const exigido = regra.modo === "por_mes" ? Math.max(0, regra.porMes) : 1;
  for (const mes of meses) {
    const trabalho = calendario.filter((d) => d.data.startsWith(mes) && d.classificacao === "trabalho_previsto");
    if (!trabalho.length) { mesesIsentos.push(mes); continue; }
    const qtd = new Set([...descansos, ...anteriores].filter((d) => d.startsWith(mes))).size;
    const elegiveis = trabalho.filter((d) => dias.includes(dow(d.data))).length;
    if (qtd < exigido && elegiveis > 0 && limite)
      pendencias.push(`É necessário remarcar a folga dominical para antes de ${br(limite)}.`);
  }
  return { apto: pendencias.length === 0, origem: regra.origem, limiteSemBanco: limite, descansos, posteriores, mesesIsentos, pendencias: [...new Set(pendencias)] };
}

/** Terminal contiguous working days only: never skip an unaffordable workday. */
export function concentrarBancoNoFinal(base: ResultadoDesligamento, saldo: number): string[] {
  const datas: string[] = [];
  for (const dia of [...base.calendario].reverse()) {
    if (dia.classificacao !== "trabalho_previsto") continue;
    if (dia.jornadaPrevista > saldo) break;
    saldo -= dia.jornadaPrevista;
    datas.push(dia.data);
  }
  return datas.sort();
}

export function mediaJornadaAviso(base: ResultadoDesligamento): number {
  const jornadas = base.calendario.map((d) => d.jornadaHabitual).filter((n) => n > 0);
  return jornadas.length ? Math.round(jornadas.reduce((a, b) => a + b, 0) / jornadas.length) : 0;
}