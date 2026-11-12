/**
 * Lote de documentos parcialmente salvo (contracheque, ponto, atestado…).
 *
 * Quando parte das páginas já virou documento e sobram páginas sem cadastro,
 * a conferência muda de fase: mostra o que já foi salvo, abre direto no que
 * falta e deixa concluir o lote ignorando as páginas que não serão salvas.
 * Regras puras — a gravação fica em `lote-parcial-acoes.ts`.
 */

export interface PaginaLote {
  id: string;
  status: string;
  matched_colaborador_id?: string | null;
}

export type StatusLote = "imported" | "partially_imported" | "ready";

const FALHA = ["failed", "dead"];

/** Página que ainda pede decisão: pendente (com ou sem vínculo) ou com falha. */
export function paginaAberta(p: PaginaLote): boolean {
  return p.status === "pending" || FALHA.includes(p.status);
}

/** Página aberta que não pode ser salva como está: sem colaborador ou com falha. */
export function paginaSemSaida(p: PaginaLote): boolean {
  return (p.status === "pending" && !p.matched_colaborador_id) || FALHA.includes(p.status);
}

export interface ResumoLoteParcial {
  total: number;
  salvas: number;
  ignoradas: number;
  /** Pendentes com colaborador: o botão de aprovar salva estas. */
  prontas: number;
  /** Sem colaborador ou com falha: só criar cadastro, escolher ou ignorar. */
  semSaida: number;
  abertas: number;
}

export function resumoLoteParcial(paginas: readonly PaginaLote[]): ResumoLoteParcial {
  let salvas = 0, ignoradas = 0, prontas = 0, semSaida = 0;
  for (const p of paginas) {
    if (p.status === "imported") salvas += 1;
    else if (p.status === "rejected") ignoradas += 1;
    else if (p.status === "pending" && p.matched_colaborador_id) prontas += 1;
    else if (paginaSemSaida(p)) semSaida += 1;
  }
  return { total: paginas.length, salvas, ignoradas, prontas, semSaida, abertas: prontas + semSaida };
}

/** Já salvou algo e ainda falta decidir: a tela entra na fase "parcial". */
export function loteParcial(r: ResumoLoteParcial): boolean {
  return r.salvas > 0 && r.abertas > 0;
}

/** Só sobraram páginas sem saída: o rodapé oferece concluir ignorando-as. */
export function podeConcluirIgnorando(r: ResumoLoteParcial): boolean {
  return r.prontas === 0 && r.semSaida > 0;
}

/** Mesma regra do servidor ao aprovar (dp-doc-bulk-approve). */
export function statusLoteAposDecisao(paginas: readonly PaginaLote[]): StatusLote {
  if (paginas.length === 0) return "ready";
  const done = paginas.every((p) => p.status === "imported" || p.status === "rejected");
  if (done) return "imported";
  return paginas.some((p) => p.status === "imported") ? "partially_imported" : "ready";
}

export type ModoExibicao = "pendentes" | "todas";

/** Abre só nas pendentes quando o lote já tem páginas salvas. */
export function modoExibicaoInicial(r: ResumoLoteParcial): ModoExibicao {
  return loteParcial(r) ? "pendentes" : "todas";
}

/** Índices (na lista completa) das páginas exibidas no modo escolhido. */
export function indicesVisiveis(paginas: readonly PaginaLote[], modo: ModoExibicao): number[] {
  const todos = paginas.map((_, i) => i);
  if (modo === "todas") return todos;
  const abertos = todos.filter((i) => paginaAberta(paginas[i]));
  return abertos.length > 0 ? abertos : todos;
}

/** Primeira página que pede decisão (sem saída antes das prontas); -1 se nenhuma. */
export function primeiraPendente(paginas: readonly PaginaLote[]): number {
  const semSaida = paginas.findIndex(paginaSemSaida);
  if (semSaida >= 0) return semSaida;
  return paginas.findIndex(paginaAberta);
}

/** Próxima página aberta depois de `idx` (dá a volta); -1 se nenhuma além dela. */
export function proximaPendente(paginas: readonly PaginaLote[], idx: number, ignorar: ReadonlySet<string> = new Set()): number {
  const n = paginas.length;
  for (let k = 1; k <= n; k += 1) {
    const j = (idx + k) % n;
    if (j === idx) break;
    if (paginaAberta(paginas[j]) && !ignorar.has(paginas[j].id)) return j;
  }
  return -1;
}

/** "44 páginas já foram salvas" / "1 página já foi salva". */
export function textoSalvas(n: number): string {
  return n === 1 ? "1 página já foi salva" : `${n} páginas já foram salvas`;
}

/** Resumo final do lote: "Lote concluído: 44 salvas e 2 ignoradas". */
export function textoConclusao(salvas: number, ignoradas: number): string {
  const partes = [`${salvas} ${salvas === 1 ? "salva" : "salvas"}`];
  if (ignoradas > 0) partes.push(`${ignoradas} ${ignoradas === 1 ? "ignorada" : "ignoradas"}`);
  return `Lote concluído: ${partes.join(" e ")}`;
}
