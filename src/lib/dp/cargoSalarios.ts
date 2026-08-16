// ------------------------------------------------------------------
// Domínio: DP → Salário do cargo por unidade.
//
// O sindicato laboral vem do cargo, mas o patronal é da unidade: convenções
// patronais diferentes produzem pisos diferentes para o mesmo cargo. Por isso
// o salário de referência é resolvido por (cargo, unidade, data), caindo no
// salário geral do cargo apenas quando a unidade não tem valor próprio.
// ------------------------------------------------------------------

export interface CargoSalarioUnidade {
  id?: string;
  cargo_id?: string;
  unidade_id: string;
  salario_base: number;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
  sindicato_patronal_id?: string | null;
  observacao?: string | null;
}

export type OrigemSalario = "unidade" | "cargo" | "nenhuma";

export interface SalarioResolvido {
  valor: number | null;
  origem: OrigemSalario;
  /** Registro por unidade usado, quando a origem é `unidade`. */
  piso?: CargoSalarioUnidade | null;
  /** Existem pisos por unidade cadastrados para este cargo. */
  temPisosPorUnidade: boolean;
  /** Há piso em outra unidade, mas não na unidade escolhida. */
  faltaPisoDaUnidade: boolean;
}

const hoje = () => new Date().toISOString().slice(0, 10);

/** O registro está vigente na data informada (YYYY-MM-DD). */
export function pisoVigente(p: CargoSalarioUnidade, data: string): boolean {
  if (p.vigencia_inicio && p.vigencia_inicio > data) return false;
  if (p.vigencia_fim && p.vigencia_fim < data) return false;
  return true;
}

/** Piso vigente do cargo naquela unidade (o de início mais recente). */
export function pisoDaUnidade(
  pisos: CargoSalarioUnidade[] | null | undefined,
  unidadeId: string | null | undefined,
  data: string = hoje(),
): CargoSalarioUnidade | null {
  if (!unidadeId) return null;
  const candidatos = (pisos ?? [])
    .filter((p) => p.unidade_id === unidadeId && pisoVigente(p, data))
    .sort((a, b) => (a.vigencia_inicio < b.vigencia_inicio ? 1 : -1));
  return candidatos[0] ?? null;
}

/**
 * Salário de referência do cargo para a unidade na data:
 * piso da unidade → salário geral do cargo → sem referência.
 */
export function salarioCargoNaUnidade(
  salarioGeralCargo: number | null | undefined,
  pisos: CargoSalarioUnidade[] | null | undefined,
  unidadeId: string | null | undefined,
  data: string = hoje(),
): SalarioResolvido {
  const lista = pisos ?? [];
  const temPisosPorUnidade = lista.length > 0;
  const piso = pisoDaUnidade(lista, unidadeId, data);
  if (piso && piso.salario_base > 0) {
    return { valor: piso.salario_base, origem: "unidade", piso, temPisosPorUnidade, faltaPisoDaUnidade: false };
  }
  const faltaPisoDaUnidade = temPisosPorUnidade && !!unidadeId && !piso;
  const geral = salarioGeralCargo == null ? null : Number(salarioGeralCargo);
  if (geral && geral > 0) {
    return { valor: geral, origem: "cargo", piso: null, temPisosPorUnidade, faltaPisoDaUnidade };
  }
  return { valor: null, origem: "nenhuma", piso: null, temPisosPorUnidade, faltaPisoDaUnidade };
}

/** Aplica um reajuste percentual a um valor, arredondando em centavos. */
export function aplicarReajuste(valor: number, percentual: number): number {
  const p = Number.isFinite(percentual) ? percentual : 0;
  return Math.round(valor * (1 + p / 100) * 100) / 100;
}
