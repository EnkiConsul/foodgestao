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
  posteriores: string[];
  pendencias: string[];
};
const dow = (data: string) => new Date(`${data}T00:00:00Z`).getUTCDay();

/** Only confirmed calendar rests count. Bank days and Art. 488 never fulfil the unit rule. */
export function diagnosticarEscalaAviso(base: ResultadoDesligamento, regra: RegraDescansoAviso, folgasAgendadas: string[]): DiagnosticoEscalaAviso {
  const limite = base.ultimoComparecimento;
  const dias = regra.dias.length ? regra.dias : [0];
  const calendario = base.calendario.filter((d) => limite && d.data <= limite);
  const descansos = calendario.filter((d) => d.classificacao === "folga_regular" && d.jornadaHabitual === 0 && dias.includes(dow(d.data))).map((d) => d.data);
  const posteriores = limite ? folgasAgendadas.filter((d) => d > limite && dias.includes(dow(d))).sort() : [];
  const pendencias: string[] = [];
  if (posteriores.length) pendencias.push("Há descanso dominical ou negociado marcado depois do limite de trabalho sem banco. Revise a data no calendário; ele não cobre os descansos deste aviso.");
  if (regra.modo === "por_mes") {
    for (const mes of new Set(calendario.map((d) => d.data.slice(0, 7)))) {
      const oportunidades = calendario.filter((d) => d.data.startsWith(mes) && dias.includes(dow(d.data))).length;
      const minimo = Math.min(oportunidades, Math.max(0, regra.porMes));
      const qtd = descansos.filter((d) => d.startsWith(mes)).length;
      if (qtd < minimo) pendencias.push(`Regra de ${regra.origem}: ${minimo} descanso(s) no período de ${mes.split("-").reverse().join("/")}; ${qtd} definido(s). Confira também os descansos anteriores à comunicação.`);
    }
  } else {
    const oportunidades = calendario.filter((d) => dias.includes(dow(d.data)));
    // Rolling windows detect spacing, not just a monthly total. A partial window requires review of history.
    const intervalo = Math.max(1, regra.semanas);
    let falta = false;
    for (let i = 0; i + intervalo <= oportunidades.length; i++) {
      if (!oportunidades.slice(i, i + intervalo).some((d) => descansos.includes(d.data))) falta = true;
    }
    if (falta) pendencias.push(`Regra de ${regra.origem}: falta descanso a cada ${intervalo} semana(s) dentro do aviso. Defina as folgas antes de compensar.`);
    if (oportunidades.length && oportunidades.length < intervalo && !descansos.length)
      pendencias.push("Período parcial: confira no calendário o último descanso anterior à comunicação para validar a periodicidade da regra.");
  }
  let seguidos = 0;
  for (const dia of calendario) {
    seguidos = dia.jornadaHabitual > 0 ? seguidos + 1 : 0;
    if (seguidos > 6) { pendencias.push("Há mais de 6 dias consecutivos sem descanso definido. Revise as folgas semanais no calendário antes de compensar."); break; }
  }
  return { apto: pendencias.length === 0, origem: regra.origem, limiteSemBanco: limite, descansos, posteriores, pendencias };
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