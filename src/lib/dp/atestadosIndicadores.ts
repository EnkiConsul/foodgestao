// Indicadores da tela de Atestados e Licenças, sempre na data civil de Brasília.
// Datas "AAAA-MM-DD" são somadas por calendário puro (UTC), sem depender do fuso do navegador.
import { hojeIsoLocal } from "./dataLocal";

/** Soma dias a uma data "AAAA-MM-DD" sem depender do fuso do navegador. */
export function somarDiasIso(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export type LinhaIndicador = { status: string; data_alvo: string; data_fim?: string | null };

/** Selo "Fora hoje": regra atual (não recusada/cancelada, início ≤ hoje < retorno). */
export function afastadoNoDia(r: LinhaIndicador, hoje: string): boolean {
  return r.status !== "recusada" && r.status !== "cancelada" && r.data_alvo <= hoje && (r.data_fim ?? r.data_alvo) > hoje;
}

/** KPIs: ativos = aprovada/pendente; retorno em (hoje, hoje+7]. */
export function calcularIndicadores<T extends LinhaIndicador>(linhas: T[], agora: Date = new Date()) {
  const hoje = hojeIsoLocal(agora);
  const em7 = somarDiasIso(hoje, 7);
  const ativos = linhas.filter((r) => r.status === "aprovada" || r.status === "pendente");
  return {
    hoje,
    em7,
    foraHoje: ativos.filter((r) => r.data_alvo <= hoje && (r.data_fim ?? r.data_alvo) > hoje),
    retornam: ativos.filter((r) => !!r.data_fim && r.data_fim > hoje && r.data_fim <= em7),
    pend: linhas.filter((r) => r.status === "pendente"),
  };
}
