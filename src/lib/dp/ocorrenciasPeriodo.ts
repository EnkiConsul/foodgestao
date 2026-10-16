// Cálculo de períodos da tela de Ocorrências só com datas civis (ano/mês/dia),
// sem toISOString — o fuso do navegador nunca desloca o intervalo.

export type PeriodoOcorrencia = "hoje" | "semana" | "mes" | "todas" | "personalizado";
export interface Intervalo { inicio: string; fim: string }

const p2 = (n: number) => String(n).padStart(2, "0");
export const ymd = (a: number, m: number, d: number) => `${a}-${p2(m)}-${p2(d)}`;
export const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/** Normaliza (ano, mês + n). */
export function deslocarMes(a: number, m: number, n: number): { ano: number; mes: number } {
  const t = a * 12 + (m - 1) + n;
  return { ano: Math.floor(t / 12), mes: (t % 12 + 12) % 12 + 1 };
}

/** Soma dias a uma data civil yyyy-MM-dd. */
export function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Data de hoje no calendário de São Paulo, igual em qualquer fuso do navegador. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(agora);
}

/** Corte salvo válido (2 a 28); qualquer outro valor = mês civil (0). */
export function lerCorte(raw: string | null | undefined): number {
  const v = Number(raw);
  return Number.isInteger(v) && v >= 2 && v <= 28 ? v : 0;
}

export function mesCivil(a: number, m: number): Intervalo {
  return { inicio: ymd(a, m, 1), fim: ymd(a, m, ultimoDia(a, m)) };
}

/** Corte c: dia c do mês anterior até c-1 do mês de referência (inclusive). */
export function intervaloCorte(a: number, m: number, c: number): Intervalo {
  const ant = deslocarMes(a, m, -1);
  return { inicio: ymd(ant.ano, ant.mes, c), fim: ymd(a, m, c - 1) };
}

export function intervaloCompetencia(a: number, m: number, c: number): Intervalo {
  return c ? intervaloCorte(a, m, c) : mesCivil(a, m);
}

/** Mês de referência (yyyy-MM) a que uma data pertence, dado o corte. */
export function competenciaDe(iso: string, c: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!c || d < c) return ymd(a, m, 1).slice(0, 7);
  const r = deslocarMes(a, m, 1);
  return ymd(r.ano, r.mes, 1).slice(0, 7);
}

/** Intervalo da competência que contém hoje. */
export function intervaloAtual(c: number, hoje: string = hojeSaoPaulo()): Intervalo {
  const [a, m] = competenciaDe(hoje, c).split("-").map(Number);
  return intervaloCompetencia(a, m, c);
}

/** Se o intervalo é exatamente uma competência com corte c, devolve yyyy-MM. */
export function competenciaDoIntervalo(i: Intervalo, c: number): string | null {
  const [a, m] = i.fim.split("-").map(Number);
  const esperado = intervaloCompetencia(a, m, c);
  return esperado.inicio === i.inicio && esperado.fim === i.fim ? i.fim.slice(0, 7) : null;
}

export function intervaloDePeriodo(
  periodo: PeriodoOcorrencia,
  custom?: { inicio?: string | null; fim?: string | null },
  hoje: string = hojeSaoPaulo(),
): { inicio?: string; fim?: string } {
  if (periodo === "todas") return {};
  if (periodo === "personalizado") {
    return { inicio: custom?.inicio ?? undefined, fim: custom?.fim ?? custom?.inicio ?? undefined };
  }
  if (periodo === "hoje") return { inicio: hoje, fim: hoje };
  const [a, m, d] = hoje.split("-").map(Number);
  if (periodo === "semana") {
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    const inicio = somarDias(hoje, -dow);
    return { inicio, fim: somarDias(inicio, 6) };
  }
  return mesCivil(a, m);
}
