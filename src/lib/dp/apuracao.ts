// ------------------------------------------------------------------
// Domínio: DP → Apuração do ponto para a folha (Fase 11)
//
// Converte o espelho consolidado (Fase 8/10) nas rubricas usadas
// pela folha: horas normais, extras 50%/100%, adicional noturno,
// faltas, DSR perdido e atrasos. Funções puras.
// ------------------------------------------------------------------

import { formatarDuracao, formatarSaldo, type ResumoPontoDia } from "@/lib/dp/ponto";

export interface ApuracaoOpcoes {
  /** Datas ISO (YYYY-MM-DD) consideradas feriado. */
  feriados?: string[];
  /** Valor da hora normal, para monetizar as rubricas. */
  valorHora?: number;
  /** Adicional noturno em % (padrão CLT: 20). */
  percentualNoturno?: number;
}

export interface ApuracaoRubricas {
  minutosNormais: number;
  minutosExtras50: number;
  minutosExtras100: number;
  minutosNoturnos: number;
  minutosFalta: number;
  minutosAtraso: number;
  diasFalta: number;
  dsrPerdidos: number;
  /** Presentes apenas quando `valorHora` é informado. */
  valores?: {
    normais: number;
    extras50: number;
    extras100: number;
    noturno: number;
    descontoFaltas: number;
    descontoDsr: number;
    liquido: number;
  };
}

const ehDomingo = (data: string) => new Date(`${data}T12:00:00`).getDay() === 0;

/** Segunda-feira (ISO) da semana de uma data — chave para o cálculo de DSR. */
export function semanaDe(data: string): string {
  const d = new Date(`${data}T12:00:00`);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Apura as rubricas de um colaborador no período.
 *
 * Regras aplicadas:
 * - trabalho em dia sem previsão, domingo ou feriado → extra 100%;
 * - excedente do previsto em dia útil → extra 50%;
 * - janela 22h–05h → adicional noturno;
 * - falta injustificada na semana → perde o DSR daquela semana.
 */
export function apurarColaborador(dias: ResumoPontoDia[], opcoes: ApuracaoOpcoes = {}): ApuracaoRubricas {
  const feriados = new Set(opcoes.feriados ?? []);
  const semanasComFalta = new Set<string>();

  const r: ApuracaoRubricas = {
    minutosNormais: 0,
    minutosExtras50: 0,
    minutosExtras100: 0,
    minutosNoturnos: 0,
    minutosFalta: 0,
    minutosAtraso: 0,
    diasFalta: 0,
    dsrPerdidos: 0,
  };

  for (const d of dias) {
    const especial = ehDomingo(d.data) || feriados.has(d.data);
    r.minutosNoturnos += d.minutosNoturnos;
    r.minutosAtraso += d.atrasoMinutos;

    if (d.status === "falta") {
      r.diasFalta += 1;
      r.minutosFalta += d.minutosPrevistos;
      semanasComFalta.add(semanaDe(d.data));
      continue;
    }

    if (!d.minutosTrabalhados) continue;

    if (!d.minutosPrevistos) {
      if (especial) r.minutosExtras100 += d.minutosTrabalhados;
      else r.minutosExtras50 += d.minutosTrabalhados;
      continue;
    }

    r.minutosNormais += Math.min(d.minutosTrabalhados, d.minutosPrevistos);
    const excedente = Math.max(0, d.minutosTrabalhados - d.minutosPrevistos);
    if (excedente) {
      if (especial) r.minutosExtras100 += excedente;
      else r.minutosExtras50 += excedente;
    }
  }

  r.dsrPerdidos = semanasComFalta.size;

  if (opcoes.valorHora) {
    const vh = opcoes.valorHora;
    const pctNoturno = (opcoes.percentualNoturno ?? 20) / 100;
    const h = (min: number) => min / 60;
    const normais = h(r.minutosNormais) * vh;
    const extras50 = h(r.minutosExtras50) * vh * 1.5;
    const extras100 = h(r.minutosExtras100) * vh * 2;
    const noturno = h(r.minutosNoturnos) * vh * pctNoturno;
    const descontoFaltas = h(r.minutosFalta) * vh;
    const jornadaMedia = dias.filter((d) => d.minutosPrevistos).reduce((a, d) => a + d.minutosPrevistos, 0);
    const diasPrevistos = dias.filter((d) => d.minutosPrevistos).length || 1;
    const descontoDsr = r.dsrPerdidos * h(jornadaMedia / diasPrevistos) * vh;
    r.valores = {
      normais,
      extras50,
      extras100,
      noturno,
      descontoFaltas,
      descontoDsr,
      liquido: normais + extras50 + extras100 + noturno - descontoFaltas - descontoDsr,
    };
  }

  return r;
}

export interface LinhaApuracao {
  colaborador_id: string;
  nome: string;
  rubricas: ApuracaoRubricas;
  saldoAcumuladoMinutos: number;
  fechado: boolean;
}

/** Soma as rubricas de várias linhas (totais do time). */
export function somarApuracoes(linhas: LinhaApuracao[]): ApuracaoRubricas {
  return linhas.reduce<ApuracaoRubricas>(
    (acc, l) => ({
      minutosNormais: acc.minutosNormais + l.rubricas.minutosNormais,
      minutosExtras50: acc.minutosExtras50 + l.rubricas.minutosExtras50,
      minutosExtras100: acc.minutosExtras100 + l.rubricas.minutosExtras100,
      minutosNoturnos: acc.minutosNoturnos + l.rubricas.minutosNoturnos,
      minutosFalta: acc.minutosFalta + l.rubricas.minutosFalta,
      minutosAtraso: acc.minutosAtraso + l.rubricas.minutosAtraso,
      diasFalta: acc.diasFalta + l.rubricas.diasFalta,
      dsrPerdidos: acc.dsrPerdidos + l.rubricas.dsrPerdidos,
    }),
    {
      minutosNormais: 0,
      minutosExtras50: 0,
      minutosExtras100: 0,
      minutosNoturnos: 0,
      minutosFalta: 0,
      minutosAtraso: 0,
      diasFalta: 0,
      dsrPerdidos: 0,
    },
  );
}

/** CSV da apuração (Excel pt-BR: separador ";"). */
export function apuracaoParaCsv(competencia: string, linhas: LinhaApuracao[]): string {
  const cab = [
    "Colaborador",
    "Competencia",
    "Horas normais",
    "Extras 50%",
    "Extras 100%",
    "Adicional noturno",
    "Faltas (dias)",
    "Horas de falta",
    "DSR perdidos",
    "Atrasos",
    "Banco de horas",
    "Status",
  ];
  const corpo = linhas.map((l) =>
    [
      l.nome,
      competencia,
      formatarDuracao(l.rubricas.minutosNormais),
      formatarDuracao(l.rubricas.minutosExtras50),
      formatarDuracao(l.rubricas.minutosExtras100),
      formatarDuracao(l.rubricas.minutosNoturnos),
      String(l.rubricas.diasFalta),
      formatarDuracao(l.rubricas.minutosFalta),
      String(l.rubricas.dsrPerdidos),
      formatarDuracao(l.rubricas.minutosAtraso),
      formatarSaldo(l.saldoAcumuladoMinutos),
      l.fechado ? "Fechado" : "Aberto",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";"),
  );
  return [cab.join(";"), ...corpo].join("\n");
}

// ------------------------------------------------------------------
// Fase 12 — Monetização e envio para a folha
// ------------------------------------------------------------------

/**
 * Valor da hora normal a partir do salário base e da carga semanal.
 * Divisor CLT: carga semanal x 5 (44h/sem → 220h/mês).
 */
export function valorHoraDe(salarioBase?: number | null, cargaSemanalHoras?: number | null): number | undefined {
  if (!salarioBase || salarioBase <= 0) return undefined;
  const carga = cargaSemanalHoras && cargaSemanalHoras > 0 ? cargaSemanalHoras : 44;
  return salarioBase / (carga * 5);
}

export interface LancamentoFolha {
  colaborador_id: string;
  valor_bruto: number;
  valor_liquido: number;
  descontos: {
    faltas: number;
    dsr: number;
    dependentes?: number;
    extras?: { descricao: string; natureza: "provento" | "desconto"; valor: number; tributavel?: boolean }[];
    proventos: { normais: number; extras50: number; extras100: number; noturno: number };
    horas: {
      normais: number;
      extras50: number;
      extras100: number;
      noturnos: number;
      falta: number;
      atraso: number;
      diasFalta: number;
      dsrPerdidos: number;
    };
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Converte a apuração monetizada em lançamento de folha (rascunho).
 *
 * `opts` traz os dados de remuneração cadastrados no colaborador:
 * dependentes de IRRF e adicional de insalubridade/periculosidade.
 */
export function apuracaoParaLancamento(
  linha: LinhaApuracao,
  opts?: { dependentes?: number | null; adicionalPercentual?: number | null },
): LancamentoFolha | null {
  const v = linha.rubricas.valores;
  if (!v) return null;

  const bruto = round2(v.normais + v.extras50 + v.extras100 + v.noturno);
  const descFaltas = round2(v.descontoFaltas);
  const descDsr = round2(v.descontoDsr);
  return {
    colaborador_id: linha.colaborador_id,
    valor_bruto: bruto,
    valor_liquido: round2(bruto - descFaltas - descDsr),
    descontos: {
      faltas: descFaltas,
      dsr: descDsr,
      proventos: {
        normais: round2(v.normais),
        extras50: round2(v.extras50),
        extras100: round2(v.extras100),
        noturno: round2(v.noturno),
      },
      horas: {
        normais: linha.rubricas.minutosNormais,
        extras50: linha.rubricas.minutosExtras50,
        extras100: linha.rubricas.minutosExtras100,
        noturnos: linha.rubricas.minutosNoturnos,
        falta: linha.rubricas.minutosFalta,
        atraso: linha.rubricas.minutosAtraso,
        diasFalta: linha.rubricas.diasFalta,
        dsrPerdidos: linha.rubricas.dsrPerdidos,
      },
    },
  };
}
