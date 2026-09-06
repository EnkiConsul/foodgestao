/**
 * Filtros e ordenação da lista de trocas de folga (visão do gestor).
 * Funções puras para permitir teste sem banco.
 */

export type TrocaPeriodo = "todos" | "mes_atual" | "proximo_mes" | "personalizado";
export type TrocaOrdem = "recentes" | "data_folga";

export type TrocaFiltros = {
  busca: string;
  status: string;
  unidadeId: string;
  cargoId: string;
  periodo: TrocaPeriodo;
  de: string;
  ate: string;
  pendentesGestor: boolean;
  ordem: TrocaOrdem;
};

export const FILTROS_TROCA_PADRAO: TrocaFiltros = {
  busca: "",
  status: "todos",
  unidadeId: "todas",
  cargoId: "todos",
  periodo: "todos",
  de: "",
  ate: "",
  pendentesGestor: false,
  ordem: "recentes",
};

/** Pessoa envolvida na troca, no formato mínimo usado pelos filtros. */
export type TrocaPessoa = {
  nome: string | null;
  matricula?: string | null;
  cargo_id?: string | null;
  unidade_id?: string | null;
} | null;

export type TrocaFiltravel = {
  status: string;
  created_at: string;
  data_original: string;
  data_proposta: string | null;
  solicitante: TrocaPessoa;
  destino: TrocaPessoa;
};

/** Remove acentos e caixa para comparar textos digitados. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Quantidade de filtros ativos (usado no contador do botão "Filtros"). */
export function contarFiltrosAtivos(f: TrocaFiltros): number {
  let n = 0;
  if (f.status !== "todos") n++;
  if (f.unidadeId !== "todas") n++;
  if (f.cargoId !== "todos") n++;
  if (f.periodo !== "todos") n++;
  if (f.pendentesGestor) n++;
  if (f.ordem !== "recentes") n++;
  return n;
}

/** Intervalo (ISO yyyy-MM-dd) do período escolhido; null = sem limite. */
export function intervaloPeriodo(
  f: Pick<TrocaFiltros, "periodo" | "de" | "ate">,
  hoje: Date = new Date(),
): { de: string | null; ate: string | null } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (f.periodo === "mes_atual") {
    const ini = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 1));
    const fim = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 1, 0));
    return { de: iso(ini), ate: iso(fim) };
  }
  if (f.periodo === "proximo_mes") {
    const ini = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 1, 1));
    const fim = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 2, 0));
    return { de: iso(ini), ate: iso(fim) };
  }
  if (f.periodo === "personalizado") {
    return { de: f.de || null, ate: f.ate || null };
  }
  return { de: null, ate: null };
}

function combinaBusca(r: TrocaFiltravel, termo: string): boolean {
  const alvo = [
    r.solicitante?.nome,
    r.solicitante?.matricula,
    r.destino?.nome,
    r.destino?.matricula,
  ]
    .filter(Boolean)
    .map((v) => normalizar(String(v)))
    .join(" ");
  return alvo.includes(termo);
}

function combinaPessoa(r: TrocaFiltravel, campo: "cargo_id" | "unidade_id", valor: string) {
  return r.solicitante?.[campo] === valor || r.destino?.[campo] === valor;
}

/** Aplica todos os filtros e a ordenação escolhida. */
export function filtrarTrocas<T extends TrocaFiltravel>(
  rows: T[],
  f: TrocaFiltros,
  hoje: Date = new Date(),
): T[] {
  const termo = normalizar(f.busca);
  const { de, ate } = intervaloPeriodo(f, hoje);

  const out = rows.filter((r) => {
    if (f.status !== "todos" && r.status !== f.status) return false;
    if (f.pendentesGestor && r.status !== "pendente_gestor") return false;
    if (f.unidadeId !== "todas" && !combinaPessoa(r, "unidade_id", f.unidadeId)) return false;
    if (f.cargoId !== "todos" && !combinaPessoa(r, "cargo_id", f.cargoId)) return false;
    if (termo && !combinaBusca(r, termo)) return false;
    if (de || ate) {
      const datas = [r.data_original, r.data_proposta].filter(Boolean) as string[];
      const dentro = datas.some((d) => (!de || d >= de) && (!ate || d <= ate));
      if (!dentro) return false;
    }
    return true;
  });

  const primeiraData = (r: TrocaFiltravel) =>
    [r.data_original, r.data_proposta].filter(Boolean).sort()[0] ?? "9999-12-31";

  return out.sort((a, b) =>
    f.ordem === "data_folga"
      ? primeiraData(a).localeCompare(primeiraData(b))
      : b.created_at.localeCompare(a.created_at),
  );
}
