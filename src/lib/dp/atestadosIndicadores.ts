// Indicadores da tela de Atestados e Licenças, sempre na data civil de Brasília.
// Datas "AAAA-MM-DD" são somadas por calendário puro (UTC), sem depender do fuso do navegador.
// Convenção: data_fim é o ÚLTIMO dia de afastamento (inclusivo); o retorno é o dia seguinte.
import { hojeIsoLocal } from "./dataLocal";

/** Soma dias a uma data "AAAA-MM-DD" sem depender do fuso do navegador. */
export function somarDiasIso(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export type LinhaIndicador = { status: string; data_alvo: string; data_fim?: string | null };

/** Último dia afastado (inclusivo). */
export function ultimoDia(r: { data_alvo: string; data_fim?: string | null }): string {
  return r.data_fim ?? r.data_alvo;
}

/** Data de retorno ao trabalho: dia seguinte ao último dia afastado. */
export function dataRetorno(r: { data_alvo: string; data_fim?: string | null }): string {
  return somarDiasIso(ultimoDia(r), 1);
}

/** Quantidade de dias de afastamento (início e fim contam). */
export function diasAfastamento(inicio?: string | null, fim?: string | null): number {
  if (!inicio) return 0;
  const f = fim ?? inicio;
  const [a1, m1, d1] = inicio.split("-").map(Number);
  const [a2, m2, d2] = f.split("-").map(Number);
  return Math.max(1, Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000) + 1);
}

/** Selo "Fora hoje": não recusada/cancelada e início ≤ hoje ≤ último dia. */
export function afastadoNoDia(r: LinhaIndicador, hoje: string): boolean {
  return r.status !== "recusada" && r.status !== "cancelada" && r.data_alvo <= hoje && ultimoDia(r) >= hoje;
}

/** KPIs: ativos = aprovada/pendente; retorno em [hoje, hoje+7] (quem volta hoje conta). */
export function calcularIndicadores<T extends LinhaIndicador>(linhas: T[], agora: Date = new Date()) {
  const hoje = hojeIsoLocal(agora);
  const em7 = somarDiasIso(hoje, 7);
  const ativos = linhas.filter((r) => r.status === "aprovada" || r.status === "pendente");
  return {
    hoje,
    em7,
    foraHoje: ativos.filter((r) => r.data_alvo <= hoje && ultimoDia(r) >= hoje),
    retornam: ativos.filter((r) => { const v = dataRetorno(r); return v >= hoje && v <= em7; }),
    pend: linhas.filter((r) => r.status === "pendente"),
  };
}
