// ------------------------------------------------------------------
// Analytics — Pessoas 360° · período, comparação e interseção de datas
//
// Funções puras (sem React, sem banco). Todas as datas são ISO `yyyy-MM-dd`
// e todos os intervalos são INCLUSIVOS nas duas pontas.
// ------------------------------------------------------------------

export interface PeriodoAnalytics {
  inicio: string;
  fim: string;
}

const parse = (iso: string) => new Date(`${iso}T12:00:00`);

export const isoDe = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function somarDias(iso: string, dias: number): string {
  const d = parse(iso);
  d.setDate(d.getDate() + dias);
  return isoDe(d);
}

/** Quantidade de dias do intervalo, contando as duas pontas. */
export function diasDoPeriodo(p: PeriodoAnalytics): number {
  if (p.fim < p.inicio) return 0;
  const ms = parse(p.fim).getTime() - parse(p.inicio).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Últimos N meses fechados + mês corrente, do dia 1 ao último dia. */
export function periodoPorMeses(meses: number, hoje = new Date()): PeriodoAnalytics {
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (Math.max(1, meses) - 1), 1);
  return { inicio: isoDe(inicio), fim: isoDe(fim) };
}

/** Período imediatamente anterior, de igual duração. */
export function periodoAnterior(p: PeriodoAnalytics): PeriodoAnalytics {
  const dias = diasDoPeriodo(p);
  const fim = somarDias(p.inicio, -1);
  return { inicio: somarDias(fim, -(dias - 1)), fim };
}

/** Competências (yyyy-MM) tocadas pelo período. */
export function competenciasDoPeriodo(p: PeriodoAnalytics, limite = 36): string[] {
  const out: string[] = [];
  let ano = Number(p.inicio.slice(0, 4));
  let mes = Number(p.inicio.slice(5, 7));
  const ultima = p.fim.slice(0, 7);
  while (out.length < limite) {
    const comp = `${ano}-${String(mes).padStart(2, "0")}`;
    out.push(comp);
    if (comp >= ultima) break;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return out;
}

/** Primeiro e último dia de uma competência. */
export function limitesDaCompetencia(competencia: string): PeriodoAnalytics {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const ultimo = new Date(ano, mes, 0).getDate();
  return { inicio: `${competencia}-01`, fim: `${competencia}-${String(ultimo).padStart(2, "0")}` };
}

/** Todos os dias do período (limitado, para não estourar memória). */
export function diasDoIntervalo(p: PeriodoAnalytics, limite = 400): string[] {
  const out: string[] = [];
  let cur = p.inicio;
  while (cur <= p.fim && out.length < limite) {
    out.push(cur);
    cur = somarDias(cur, 1);
  }
  return out;
}

/**
 * Dias de um evento que caem dentro do período — só a interseção.
 * `fim` ausente equivale a evento de um único dia. `fim` é inclusivo.
 */
export function diasNaInterseccao(
  evento: { inicio: string | null | undefined; fim?: string | null },
  p: PeriodoAnalytics,
): number {
  if (!evento.inicio) return 0;
  const fimEvento = evento.fim && evento.fim >= evento.inicio ? evento.fim : evento.inicio;
  const ini = evento.inicio > p.inicio ? evento.inicio : p.inicio;
  const fim = fimEvento < p.fim ? fimEvento : p.fim;
  if (fim < ini) return 0;
  return diasDoPeriodo({ inicio: ini, fim });
}

/** O evento toca o período? */
export function tocaPeriodo(
  evento: { inicio: string | null | undefined; fim?: string | null },
  p: PeriodoAnalytics,
): boolean {
  return diasNaInterseccao(evento, p) > 0;
}

export type SentidoVariacao = "subiu" | "caiu" | "estavel";

export interface Variacao {
  atual: number;
  anterior: number;
  diferenca: number;
  sentido: SentidoVariacao;
}

export function variacao(atual: number, anterior: number): Variacao {
  const diferenca = Number((atual - anterior).toFixed(2));
  return {
    atual,
    anterior,
    diferenca,
    sentido: diferenca > 0 ? "subiu" : diferenca < 0 ? "caiu" : "estavel",
  };
}

const numero = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Texto da comparação com o período anterior. `pp` para percentuais. */
export function textoVariacao(v: Variacao, opts?: { unidade?: string; pp?: boolean }): string {
  if (v.sentido === "estavel") return "sem variação em relação ao período anterior";
  const seta = v.sentido === "subiu" ? "↑" : "↓";
  const abs = Math.abs(v.diferenca);
  const sufixo = opts?.pp ? " p.p." : opts?.unidade ? ` ${opts.unidade}` : "";
  return `${seta} ${numero(abs)}${sufixo} em relação ao período anterior`;
}
