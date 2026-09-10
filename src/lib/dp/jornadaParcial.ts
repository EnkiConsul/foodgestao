// ------------------------------------------------------------------
// Domínio: DP → Jornada parcial e salário proporcional.
//
// Quem trabalha menos horas que a jornada base do cargo recebe o salário do
// cargo na proporção das horas contratadas. A referência é sempre o salário do
// cargo na unidade (piso do patronal ou ajuste da unidade), nunca um valor solto.
//
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

/** Jornada integral padrão da CLT, usada quando o cargo não informa a sua. */
export const CARGA_BASE_PADRAO = 44;

/** Base de horas do mês para a jornada integral de 44h semanais. */
export const BASE_HORAS_INTEGRAL = 220;

/**
 * Base mensal sugerida: 30 horas semanais → 150 horas no mês (30 ÷ 6 × 30).
 * A conta é a mesma da jornada integral (44 ÷ 6 × 30 = 220), então o gestor vê
 * um número coerente com o que já usa na folha.
 */
export function baseHorasMesSugerida(cargaSemanal?: number | null): number {
  const carga = Number(cargaSemanal ?? 0);
  if (!carga || carga <= 0) return BASE_HORAS_INTEGRAL;
  return Math.round((carga / 6) * 30);
}

export interface ProporcionalidadeInput {
  /** Salário do cargo na unidade (piso do patronal ou ajuste da unidade). */
  salarioCargo: number | null | undefined;
  /** Carga semanal contratada com o colaborador (ex.: 30). */
  cargaSemanal: number | null | undefined;
  /** Carga semanal base do cargo (ex.: 44). */
  cargaBaseCargo?: number | null;
  /** Base de horas do mês usada para o valor da hora. */
  baseHorasMes?: number | null;
}

export interface ProporcionalidadeResultado {
  /** É jornada parcial (carga menor que a base do cargo)? */
  parcial: boolean;
  /** Fator aplicado ao salário do cargo (1 = integral). */
  fator: number;
  cargaBase: number;
  cargaSemanal: number | null;
  baseHorasMes: number;
  /** Salário mensal proporcional. null quando o cargo não tem salário resolvido. */
  salario: number | null;
  /** Valor da hora derivado do salário proporcional. */
  valorHora: number | null;
  /** Explicação em texto para mostrar na tela. */
  explicacao: string;
}

const arred2 = (v: number) => Math.round(v * 100) / 100;

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Salário proporcional às horas contratadas.
 *
 * salário = salário do cargo × (carga contratada ÷ carga base do cargo)
 * valor da hora = salário ÷ base de horas do mês
 */
export function salarioProporcional(input: ProporcionalidadeInput): ProporcionalidadeResultado {
  const cargaBase = Number(input.cargaBaseCargo ?? 0) > 0
    ? Number(input.cargaBaseCargo)
    : CARGA_BASE_PADRAO;
  const cargaSemanal = input.cargaSemanal != null && Number(input.cargaSemanal) > 0
    ? Number(input.cargaSemanal)
    : null;
  const baseHorasMes = Number(input.baseHorasMes ?? 0) > 0
    ? Number(input.baseHorasMes)
    : baseHorasMesSugerida(cargaSemanal ?? cargaBase);

  const fator = cargaSemanal ? Math.min(cargaSemanal / cargaBase, 1) : 1;
  const parcial = !!cargaSemanal && cargaSemanal < cargaBase;

  const salarioCargo = input.salarioCargo != null && Number(input.salarioCargo) > 0
    ? Number(input.salarioCargo)
    : null;

  if (salarioCargo == null) {
    return {
      parcial,
      fator,
      cargaBase,
      cargaSemanal,
      baseHorasMes,
      salario: null,
      valorHora: null,
      explicacao:
        "O cargo ainda não tem salário de referência cadastrado para esta unidade — informe o valor à mão.",
    };
  }

  const salario = arred2(salarioCargo * fator);
  const valorHora = arred2(salario / baseHorasMes);

  const explicacao = parcial
    ? `${moeda(salarioCargo)} do cargo × ${cargaSemanal}h ÷ ${cargaBase}h = ${moeda(salario)} por mês · hora ${moeda(valorHora)} (base ${baseHorasMes}h)`
    : `${moeda(salario)} por mês (jornada integral do cargo) · hora ${moeda(valorHora)} (base ${baseHorasMes}h)`;

  return { parcial, fator, cargaBase, cargaSemanal, baseHorasMes, salario, valorHora, explicacao };
}
