// Conferência de cobertura de um lote de importação de documentos de DP:
// quais colaboradores esperados NÃO têm página vinculada no lote.

export interface CoverageColaborador {
  id: string;
  nome: string;
  matricula?: string | null;
  ativo?: boolean | null;
  unidade_id?: string | null;
  possui_folha_ponto?: boolean | null;
  data_admissao?: string | null;
  data_desligamento?: string | null;
  dp_unidades?: { nome?: string | null } | null;
}

export interface CoverageArgs {
  colaboradores: CoverageColaborador[];
  /** ids de colaboradores já vinculados a alguma página do lote */
  vinculados: Set<string>;
  /** "YYYY-MM" — competência predominante do lote */
  competencia: string | null;
  /** unidade detectada no lote (via CNPJ), quando houver */
  unidadeId?: string | null;
  tipo?: string | null;
}

export interface CoverageResult {
  esperados: CoverageColaborador[];
  faltantes: CoverageColaborador[];
  cobertos: number;
}

/** Primeiro e último dia da competência "YYYY-MM". */
export function competenciaRange(competencia: string): { inicio: string; fim: string } | null {
  const m = competencia.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    inicio: `${m[1]}-${m[2]}-01`,
    fim: `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Colaborador esteve ativo em algum momento da competência. */
export function ativoNaCompetencia(c: CoverageColaborador, competencia: string | null): boolean {
  if (!competencia) return c.ativo !== false;
  const range = competenciaRange(competencia);
  if (!range) return c.ativo !== false;
  const admissao = (c.data_admissao ?? "").slice(0, 10);
  const desligamento = (c.data_desligamento ?? "").slice(0, 10);
  if (admissao && admissao > range.fim) return false;
  if (desligamento && desligamento < range.inicio) return false;
  // sem datas cadastradas: usa o flag ativo
  if (!admissao && !desligamento) return c.ativo !== false;
  return true;
}

export function computeCoverage({
  colaboradores, vinculados, competencia, unidadeId, tipo,
}: CoverageArgs): CoverageResult {
  const esperados = colaboradores.filter((c) => {
    if (tipo === "ponto" && c.possui_folha_ponto === false) return false;
    if (unidadeId && c.unidade_id && c.unidade_id !== unidadeId) return false;
    return ativoNaCompetencia(c, competencia);
  });
  const faltantes = esperados
    .filter((c) => !vinculados.has(c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { esperados, faltantes, cobertos: esperados.length - faltantes.length };
}

/** Competência predominante entre os itens do lote. */
export function competenciaPredominante(
  values: Array<string | null | undefined>,
  fallbackRefDate?: string | null,
): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const m = String(v ?? "").match(/^(20\d{2})-(0[1-9]|1[0-2])/);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) if (c > bestCount) { best = k; bestCount = c; }
  if (best) return best;
  const fb = String(fallbackRefDate ?? "").match(/^(20\d{2})-(0[1-9]|1[0-2])/);
  return fb ? `${fb[1]}-${fb[2]}` : null;
}
