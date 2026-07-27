// Conferência de cobertura de um lote de importação de documentos de DP:
// quais colaboradores esperados NÃO têm página vinculada no lote.

export interface CoverageColaborador {
  id: string;
  nome: string;
  matricula?: string | null;
  ativo?: boolean | null;
  unidade_id?: string | null;
  possui_folha_ponto?: boolean | null;
  optante_adiantamento?: boolean | null;
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
  /** unidades identificadas no lote (CNPJ, colaboradores vinculados ou vínculo manual) */
  unidadeIds?: string[] | null;
  tipo?: string | null;
}

export interface CoverageResult {
  esperados: CoverageColaborador[];
  faltantes: CoverageColaborador[];
  cobertos: number;
  /** true quando nenhuma unidade pôde ser identificada para o lote */
  unidadeIndefinida: boolean;
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

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D+/g, "");

export interface ResolveUnidadeArgs {
  rows: Array<{ detected_cnpj?: string | null; matched_colaborador_id?: string | null }>;
  colaboradores: CoverageColaborador[];
  unidades: Array<{ id: string; cnpj?: string | null }>;
  /** vínculo manual salvo no lote (tem prioridade absoluta) */
  manualUnidadeId?: string | null;
}

/**
 * Unidades do lote: vínculo manual > CNPJ detectado > unidade dos colaboradores
 * já reconhecidos nas páginas.
 */
export function resolveUnidadesLote({
  rows, colaboradores, unidades, manualUnidadeId,
}: ResolveUnidadeArgs): string[] {
  if (manualUnidadeId) return [manualUnidadeId];

  const porCnpj = new Map<string, string>();
  for (const u of unidades) {
    const d = onlyDigits(u.cnpj);
    if (d.length >= 14) porCnpj.set(d, u.id);
  }
  const detectadas = new Set<string>();
  for (const r of rows) {
    const d = onlyDigits(r.detected_cnpj);
    const id = d ? porCnpj.get(d) : undefined;
    if (id) detectadas.add(id);
  }
  if (detectadas.size > 0) return [...detectadas];

  const byId = new Map(colaboradores.map((c) => [c.id, c]));
  const porColab = new Set<string>();
  for (const r of rows) {
    const uid = r.matched_colaborador_id ? byId.get(r.matched_colaborador_id)?.unidade_id : null;
    if (uid) porColab.add(uid);
  }
  return [...porColab];
}

export function computeCoverage({
  colaboradores, vinculados, competencia, unidadeIds, tipo,
}: CoverageArgs): CoverageResult {
  const escopo = (unidadeIds ?? []).filter(Boolean);
  if (escopo.length === 0) {
    return { esperados: [], faltantes: [], cobertos: 0, unidadeIndefinida: true };
  }
  const escopoSet = new Set(escopo);
  const esperados = colaboradores.filter((c) => {
    if (!c.unidade_id || !escopoSet.has(c.unidade_id)) return false;
    if (tipo === "ponto" && c.possui_folha_ponto === false) return false;
    if (tipo === "adiantamento" && c.optante_adiantamento !== true) return false;
    return ativoNaCompetencia(c, competencia);
  });
  const faltantes = esperados
    .filter((c) => !vinculados.has(c.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    esperados,
    faltantes,
    cobertos: esperados.length - faltantes.length,
    unidadeIndefinida: false,
  };
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
