// Fonte única de verdade para agrupamento, urgência e "adiadas" das pendências.
// Home (resumo agrupado), KPI e tela operacional usam exclusivamente estes helpers,
// evitando contagens divergentes (Fase 5, item 116).

export type PendenciaLike = {
  id: string;
  tipo: string;
  titulo: string;
  subtitulo: string;
  vencimento?: string | null;
  atrasoDias: number;
  url: string;
  colaboradorNome?: string | null;
  unidadeNome?: string | null;
  /**
   * Pede ação agora mesmo sem ter vencido: hoje só as férias em risco de pagar
   * em dobro (prazo legal a 30 dias ou menos).
   */
  urgente?: boolean | null;
};

export type PendenciaUrgencia = "atrasada" | "urgente" | "hoje" | "proxima";

export function urgenciaDe(p: Pick<PendenciaLike, "atrasoDias" | "urgente">): PendenciaUrgencia {
  if (p.atrasoDias > 0) return "atrasada";
  if (p.urgente) return "urgente";
  if (p.atrasoDias === 0) return "hoje";
  return "proxima";
}

export const URGENCIA_LABEL: Record<PendenciaUrgencia, string> = {
  atrasada: "Atrasada",
  urgente: "Urgente",
  hoje: "Vence hoje",
  proxima: "Próxima",
};

/** Peso de ordenação: atrasadas > urgentes > vence hoje > próximas. */
export function pesoUrgencia(p: Pick<PendenciaLike, "atrasoDias" | "urgente">): number {
  const u = urgenciaDe(p);
  if (u === "atrasada") return 3;
  if (u === "urgente") return 2;
  if (u === "hoje") return 1;
  return 0;
}

/** Comparador único: atrasadas primeiro, urgentes em seguida, depois por prazo. */
export function compararUrgencia(
  a: Pick<PendenciaLike, "atrasoDias" | "urgente" | "vencimento" | "colaboradorNome">,
  b: Pick<PendenciaLike, "atrasoDias" | "urgente" | "vencimento" | "colaboradorNome">,
): number {
  const pa = pesoUrgencia(a);
  const pb = pesoUrgencia(b);
  if (pa !== pb) return pb - pa;
  if (b.atrasoDias !== a.atrasoDias) return b.atrasoDias - a.atrasoDias;
  const av = a.vencimento ? new Date(a.vencimento).getTime() : Infinity;
  const bv = b.vencimento ? new Date(b.vencimento).getTime() : Infinity;
  if (av !== bv) return av - bv;
  return (a.colaboradorNome ?? "").localeCompare(b.colaboradorNome ?? "", "pt-BR");
}

/** Uma pendência está adiada quando existe data futura registrada nas preferências do usuário. */
export function isPendenciaAdiada(
  id: string,
  adiadas: Record<string, string> | null | undefined,
  agora: Date = new Date(),
): boolean {
  const until = adiadas?.[id];
  if (!until) return false;
  const d = new Date(until);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > agora.getTime();
}

/** Definição canônica de "pendência aberta": existe e não está temporariamente adiada. */
export function filtrarAbertas<T extends PendenciaLike>(
  itens: T[],
  adiadas: Record<string, string> | null | undefined,
  agora: Date = new Date(),
): T[] {
  return itens.filter((p) => !isPendenciaAdiada(p.id, adiadas, agora));
}

export function contarAbertas(
  itens: PendenciaLike[],
  adiadas: Record<string, string> | null | undefined,
  agora: Date = new Date(),
): number {
  return filtrarAbertas(itens, adiadas, agora).length;
}

export type GrupoPendencias<T extends PendenciaLike = PendenciaLike> = {
  tipo: string;
  itens: T[];
  total: number;
  atrasadas: number;
  /** Ainda no prazo, mas pedem ação agora (risco de dobra nas férias). */
  urgentes: number;
  hoje: number;
  proximas: number;
  /** Colaboradores distintos citados no grupo (quando o dado existe). */
  colaboradores: string[];
  unidades: string[];
  /** Maior atraso do grupo — usado para ordenar por urgência. */
  maiorAtraso: number;
};

/**
 * Agrupa por TIPO/ASSUNTO preservando cada item individualmente (item 96).
 * Grupos com pendências atrasadas vêm primeiro; empate resolve por quantidade e nome.
 */
export function agruparPorTipo<T extends PendenciaLike>(itens: T[]): GrupoPendencias<T>[] {
  const mapa = new Map<string, T[]>();
  for (const p of itens) {
    const tipo = p.tipo?.trim() || "Outros";
    if (!mapa.has(tipo)) mapa.set(tipo, []);
    mapa.get(tipo)!.push(p);
  }

  const grupos: GrupoPendencias<T>[] = [];
  for (const [tipo, lista] of mapa.entries()) {
    let atrasadas = 0;
    let urgentes = 0;
    let hoje = 0;
    let proximas = 0;
    let maiorAtraso = Number.NEGATIVE_INFINITY;
    const colaboradores = new Set<string>();
    const unidades = new Set<string>();
    for (const p of lista) {
      const u = urgenciaDe(p);
      if (u === "atrasada") atrasadas++;
      else if (u === "urgente") urgentes++;
      else if (u === "hoje") hoje++;
      else proximas++;
      if (p.atrasoDias > maiorAtraso) maiorAtraso = p.atrasoDias;
      if (p.colaboradorNome) colaboradores.add(p.colaboradorNome);
      if (p.unidadeNome) unidades.add(p.unidadeNome);
    }
    grupos.push({
      tipo,
      itens: [...lista].sort(compararUrgencia),
      total: lista.length,
      atrasadas,
      urgentes,
      hoje,
      proximas,
      colaboradores: Array.from(colaboradores).sort((a, b) => a.localeCompare(b, "pt-BR")),
      unidades: Array.from(unidades).sort((a, b) => a.localeCompare(b, "pt-BR")),
      maiorAtraso: maiorAtraso === Number.NEGATIVE_INFINITY ? 0 : maiorAtraso,
    });
  }

  // Mais antigas/atrasadas primeiro; grupos com urgência vêm logo depois.
  const rank = (g: GrupoPendencias<T>) => (g.atrasadas > 0 ? 2 : g.urgentes > 0 ? 1 : 0);
  return grupos.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(b) - rank(a);
    if (a.maiorAtraso !== b.maiorAtraso) return b.maiorAtraso - a.maiorAtraso;
    if (a.atrasadas !== b.atrasadas) return b.atrasadas - a.atrasadas;
    if (a.total !== b.total) return b.total - a.total;
    return a.tipo.localeCompare(b.tipo, "pt-BR");
  });
}

/** Dentro de um grupo, subdivide por colaborador para o detalhe (item 94). */
export type SubgrupoColaborador<T extends PendenciaLike = PendenciaLike> = {
  colaborador: string | null;
  itens: T[];
};

export function agruparPorColaborador<T extends PendenciaLike>(
  itens: T[],
  opts: { ordenarPorAtraso?: boolean } = {},
): SubgrupoColaborador<T>[] {
  const mapa = new Map<string, T[]>();
  const SEM = "\u0000sem";
  for (const p of itens) {
    const k = p.colaboradorNome?.trim() || SEM;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(p);
  }
  const grupos = Array.from(mapa.entries()).map(([k, lista]) => ({
    colaborador: k === SEM ? null : k,
    itens: [...lista].sort((a, b) => b.atrasoDias - a.atrasoDias),
  }));
  if (opts.ordenarPorAtraso) {
    // Mais antigas/atrasadas primeiro.
    return grupos.sort((a, b) => {
      const ma = Math.max(...a.itens.map((i) => i.atrasoDias));
      const mb = Math.max(...b.itens.map((i) => i.atrasoDias));
      if (ma !== mb) return mb - ma;
      if (a.colaborador === null) return 1;
      if (b.colaborador === null) return -1;
      return a.colaborador.localeCompare(b.colaborador, "pt-BR");
    });
  }
  return grupos.sort((a, b) => {
    if (a.colaborador === null) return 1;
    if (b.colaborador === null) return -1;
    return a.colaborador.localeCompare(b.colaborador, "pt-BR");
  });
}

/** Valores distintos para popular filtros (somente o que existe nos dados). */
export function opcoesFiltro(itens: PendenciaLike[]) {
  const tipos = new Set<string>();
  const colaboradores = new Set<string>();
  const unidades = new Set<string>();
  for (const p of itens) {
    if (p.tipo) tipos.add(p.tipo);
    if (p.colaboradorNome) colaboradores.add(p.colaboradorNome);
    if (p.unidadeNome) unidades.add(p.unidadeNome);
  }
  const ord = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { tipos: ord(tipos), colaboradores: ord(colaboradores), unidades: ord(unidades) };
}
