// ------------------------------------------------------------------
// Analytics — Pessoas 360° · Operação (pessoas, nunca horas)
//
// Metodologia do "habitual" é a MESMA da Rotina: mediana da quantidade de
// pessoas por dia da semana, janela de 8 semanas e a tolerância de `avaliarDia`.
// A única regra adicional é a amostra mínima: com menos de 3 dias equivalentes
// o dia fica como "Histórico insuficiente" e não é classificado.
// ------------------------------------------------------------------

import {
  SEMANAS_BASELINE,
  TOLERANCIA_PADRAO,
  avaliarDia,
  dowDaData,
  somarDias,
  type SituacaoDia,
} from "@/lib/dp/operacao-panorama";

export const MIN_AMOSTRAS_BASELINE = 3;

export interface Baseline {
  padrao: number;
  amostras: number;
}

function mediana(valores: number[]): number {
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 ? ord[meio] : Math.round((ord[meio - 1] + ord[meio]) / 2);
}

/**
 * Mediana por dia da semana com a contagem de amostras usadas.
 * Mesma janela e mesmo critério de descarte da Rotina (dias sem ninguém na
 * operação não entram — loja fechada ou sem dado).
 */
export function baselineComAmostras(
  historico: readonly { data: string; pessoas: number }[],
  opts: { limite: string; semanas?: number; minAmostras?: number },
): Map<number, Baseline> {
  const semanas = opts.semanas ?? SEMANAS_BASELINE;
  const min = opts.minAmostras ?? MIN_AMOSTRAS_BASELINE;
  const inicio = somarDias(opts.limite, -semanas * 7);

  const porDow = new Map<number, number[]>();
  for (const h of historico) {
    if (h.data >= opts.limite || h.data < inicio) continue;
    if (h.pessoas <= 0) continue;
    const dow = dowDaData(h.data);
    const lista = porDow.get(dow) ?? [];
    lista.push(h.pessoas);
    porDow.set(dow, lista);
  }

  const out = new Map<number, Baseline>();
  for (const [dow, valores] of porDow) {
    if (valores.length < min) continue;
    out.set(dow, { padrao: mediana(valores), amostras: valores.length });
  }
  return out;
}

export type SituacaoOperacao = SituacaoDia;

export const SITUACAO_LABEL: Record<SituacaoOperacao, string> = {
  ok: "Dentro do habitual",
  abaixo: "Abaixo do habitual",
  acima: "Acima do habitual",
  sem_padrao: "Histórico insuficiente",
};

export interface DiaOperacao {
  data: string;
  dow: number;
  /** Pessoas na operação do dia (previstos/confirmados, sem Ponto). */
  pessoas: number;
  habitual: number | null;
  amostras: number;
  diferenca: number;
  situacao: SituacaoOperacao;
}

export function classificarDias(
  dias: readonly { data: string; pessoas: number }[],
  baseline: Map<number, Baseline>,
  tolerancia = TOLERANCIA_PADRAO,
): DiaOperacao[] {
  return dias.map((d) => {
    const dow = dowDaData(d.data);
    const base = baseline.get(dow) ?? null;
    const aval = avaliarDia(d.pessoas, base?.padrao ?? null, tolerancia);
    return {
      data: d.data,
      dow,
      pessoas: d.pessoas,
      habitual: base?.padrao ?? null,
      amostras: base?.amostras ?? 0,
      diferenca: aval.diferenca,
      situacao: aval.situacao,
    };
  });
}

export interface SituacaoResumo {
  analisados: number;
  dentro: number;
  abaixo: number;
  acima: number;
  semHistorico: number;
}

export function resumoSituacao(dias: readonly DiaOperacao[]): SituacaoResumo {
  const conta = (s: SituacaoOperacao) => dias.filter((d) => d.situacao === s).length;
  const semHistorico = conta("sem_padrao");
  return {
    analisados: dias.length - semHistorico,
    dentro: conta("ok"),
    abaixo: conta("abaixo"),
    acima: conta("acima"),
    semHistorico,
  };
}

export interface LinhaOperacao {
  chave: string;
  label: string;
  diasAnalisados: number;
  diasAbaixo: number;
  percentualAbaixo: number;
  habitualMedio: number | null;
  equipeMedia: number | null;
  diferencaMedia: number | null;
}

/** Agrupa dias já classificados por qualquer dimensão (dia da semana, cargo, setor…). */
export function agruparOperacao(
  dias: readonly DiaOperacao[],
  chaveDe: (dia: DiaOperacao) => string,
  labelDe: (chave: string) => string,
): LinhaOperacao[] {
  const grupos = new Map<string, DiaOperacao[]>();
  dias.forEach((d) => {
    if (d.situacao === "sem_padrao") return;
    const k = chaveDe(d);
    const lista = grupos.get(k) ?? [];
    lista.push(d);
    grupos.set(k, lista);
  });

  const media = (v: number[]) =>
    v.length ? Number((v.reduce((s, n) => s + n, 0) / v.length).toFixed(1)) : null;

  return [...grupos.entries()]
    .map(([chave, lista]) => {
      const abaixo = lista.filter((d) => d.situacao === "abaixo").length;
      return {
        chave,
        label: labelDe(chave),
        diasAnalisados: lista.length,
        diasAbaixo: abaixo,
        percentualAbaixo: lista.length ? Math.round((abaixo / lista.length) * 100) : 0,
        habitualMedio: media(lista.map((d) => d.habitual ?? 0)),
        equipeMedia: media(lista.map((d) => d.pessoas)),
        diferencaMedia: media(lista.map((d) => d.diferenca)),
      };
    })
    .sort((a, b) => b.percentualAbaixo - a.percentualAbaixo || b.diasAbaixo - a.diasAbaixo);
}

export const DOW_LABEL = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export const DOW_PLURAL = [
  "domingos",
  "segundas",
  "terças",
  "quartas",
  "quintas",
  "sextas",
  "sábados",
];

// ------------------------------------------------------------------
// Mão de obra extra
// ------------------------------------------------------------------

/**
 * Só `teste` e `folguista` são mão de obra extra. `registro_manual` aponta para
 * um colaborador do próprio quadro — contá-lo aqui duplicaria a pessoa.
 */
export const TIPOS_MAO_DE_OBRA_EXTRA = ["teste", "folguista"] as const;

export interface ExtraAnalytics {
  id: string;
  tipo: string;
  colaborador_id: string | null;
  unidade_id: string | null;
  cargo_id: string | null;
  data_inicio: string;
  data_fim: string;
}

export const ehMaoDeObraExtra = (r: { tipo: string; colaborador_id?: string | null }) =>
  (TIPOS_MAO_DE_OBRA_EXTRA as readonly string[]).includes(r.tipo) && !r.colaborador_id;

export interface ResumoExtras {
  utilizacoes: number;
  diasComExtra: number;
  mediaPorDiaComUso: number | null;
  porDiaSemana: number[];
  /** Dias com uso agrupados por unidade. */
  porUnidade: { unidade_id: string | null; dias: number; utilizacoes: number }[];
}

export function resumoExtras(
  lista: readonly ExtraAnalytics[],
  periodo: { inicio: string; fim: string },
): ResumoExtras {
  const extras = lista.filter(ehMaoDeObraExtra);
  const porDia = new Map<string, number>();
  const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
  const unidades = new Map<string, { dias: Set<string>; utilizacoes: number }>();

  let utilizacoes = 0;
  for (const e of extras) {
    let cur = e.data_inicio < periodo.inicio ? periodo.inicio : e.data_inicio;
    const fim = e.data_fim > periodo.fim ? periodo.fim : e.data_fim;
    if (fim < cur) continue;
    utilizacoes += 1;
    const chaveUn = e.unidade_id ?? "";
    const un = unidades.get(chaveUn) ?? { dias: new Set<string>(), utilizacoes: 0 };
    un.utilizacoes += 1;
    while (cur <= fim) {
      porDia.set(cur, (porDia.get(cur) ?? 0) + 1);
      porDiaSemana[dowDaData(cur)] += 1;
      un.dias.add(cur);
      cur = somarDias(cur, 1);
    }
    unidades.set(chaveUn, un);
  }

  const totalPessoasDia = [...porDia.values()].reduce((s, n) => s + n, 0);
  return {
    utilizacoes,
    diasComExtra: porDia.size,
    mediaPorDiaComUso: porDia.size ? Number((totalPessoasDia / porDia.size).toFixed(1)) : null,
    porDiaSemana,
    porUnidade: [...unidades.entries()]
      .map(([k, v]) => ({ unidade_id: k || null, dias: v.dias.size, utilizacoes: v.utilizacoes }))
      .sort((a, b) => b.dias - a.dias),
  };
}
