/**
 * Correspondência entre o cargo escrito na ficha e os cargos já cadastrados.
 *
 * Ordem de preferência: CBO igual + nome parecido > CBO igual > nome parecido >
 * sem correspondência. Criar cargo novo é sempre decisão do usuário.
 */

export type CargoCadastrado = { id: string; nome: string; cbo?: string | null };

export type CargoMatch = {
  cargo_id: string | null;
  motivo: "cbo_e_nome" | "cbo" | "nome" | "nenhum";
  /** Alternativas para o usuário escolher, da mais provável para a menos. */
  alternativas: CargoCadastrado[];
};

export function normalizeCargoNome(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\([AO]S?\)/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function normalizeCbo(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D+/g, "");
}

/** Abreviações comuns nas fichas da contabilidade. */
const ABREVIACOES: Record<string, string> = {
  AUX: "AUXILIAR",
  AUXIL: "AUXILIAR",
  ASSIST: "ASSISTENTE",
  ATEND: "ATENDENTE",
  OPER: "OPERADOR",
  OP: "OPERADOR",
  COZ: "COZINHA",
  GER: "GERENTE",
  SUPERV: "SUPERVISOR",
  ENC: "ENCARREGADO",
};

/** Palavras de ligação não contam para a semelhança ("Aux de Cozinha" ≠ "Aux de Limpeza"). */
const LIGACAO = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "EM", "NO", "NA"]);

function tokensCargo(value: string | null | undefined): string[] {
  return normalizeCargoNome(value)
    .split(" ")
    .filter(Boolean)
    .map((t) => ABREVIACOES[t] ?? t)
    .filter((t) => !LIGACAO.has(t));
}

/** Similaridade simples por tokens compartilhados (0..1). */
export function similaridadeNome(a: string | null | undefined, b: string | null | undefined): number {
  const ta = tokensCargo(a);
  const tb = tokensCargo(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const comuns = ta.filter((t) => setB.has(t)).length;
  return (2 * comuns) / (ta.length + tb.length);
}

export function matchCargo(
  ficha: { cargo_nome?: string | null; cbo?: string | null },
  cargos: CargoCadastrado[],
): CargoMatch {
  const cbo = normalizeCbo(ficha.cbo);
  const porCbo = cbo ? cargos.filter((c) => normalizeCbo(c.cbo) === cbo) : [];

  const comScore = cargos
    .map((c) => ({ cargo: c, score: similaridadeNome(ficha.cargo_nome, c.nome) }))
    .sort((a, b) => b.score - a.score);

  if (porCbo.length > 0) {
    const melhorDoCbo = porCbo
      .map((c) => ({ cargo: c, score: similaridadeNome(ficha.cargo_nome, c.nome) }))
      .sort((a, b) => b.score - a.score)[0];
    if (melhorDoCbo.score >= 0.5) {
      return { cargo_id: melhorDoCbo.cargo.id, motivo: "cbo_e_nome", alternativas: porCbo };
    }
    return { cargo_id: porCbo[0].id, motivo: "cbo", alternativas: porCbo };
  }

  const melhor = comScore[0];
  if (melhor && melhor.score >= 0.6) {
    return {
      cargo_id: melhor.cargo.id,
      motivo: "nome",
      alternativas: comScore.filter((c) => c.score >= 0.4).slice(0, 5).map((c) => c.cargo),
    };
  }

  return {
    cargo_id: null,
    motivo: "nenhum",
    alternativas: comScore.filter((c) => c.score > 0).slice(0, 5).map((c) => c.cargo),
  };
}
