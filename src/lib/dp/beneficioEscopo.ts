// ------------------------------------------------------------------
// Domínio: DP → Escopo do benefício do catálogo
//
// Um benefício pode valer para a empresa inteira (unidade e cargo em branco),
// para uma unidade, para um cargo, ou para um cargo dentro de uma unidade.
// Fonte única usada pelo cadastro do colaborador e pela tela de Benefícios.
// ------------------------------------------------------------------

export interface EscopoBeneficio {
  unidade_id?: string | null;
  cargo_id?: string | null;
}

export interface AlvoEscopo {
  unidade_id?: string | null;
  cargo_id?: string | null;
}

/** O benefício alcança este colaborador? Escopo em branco vale para todos. */
export function beneficioAlcanca(b: EscopoBeneficio, alvo: AlvoEscopo): boolean {
  if (b.unidade_id && b.unidade_id !== (alvo.unidade_id ?? null)) return false;
  if (b.cargo_id && b.cargo_id !== (alvo.cargo_id ?? null)) return false;
  return true;
}

/** Texto curto do escopo, para selo e para o motivo do item indisponível. */
export function descreverEscopoBeneficio(
  b: EscopoBeneficio,
  nomes: { unidade?: string | null; cargo?: string | null } = {},
): string {
  const unidade = b.unidade_id ? nomes.unidade ?? "outra unidade" : null;
  const cargo = b.cargo_id ? nomes.cargo ?? "outro cargo" : null;
  if (unidade && cargo) return `${cargo} na unidade ${unidade}`;
  if (unidade) return `unidade ${unidade}`;
  if (cargo) return `cargo ${cargo}`;
  return "empresa inteira";
}
