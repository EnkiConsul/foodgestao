/**
 * Adicionais de risco do contrato: insalubridade e periculosidade.
 *
 * São adicionais distintos e com bases de cálculo distintas:
 * - Insalubridade (art. 192 CLT): 10%, 20% ou 40% sobre o salário mínimo.
 * - Periculosidade (art. 193 CLT): 30% sobre o salário base, sem os adicionais.
 *
 * O art. 193, §2º da CLT não permite cumular os dois — o empregado opta pelo
 * que lhe for mais favorável.
 */

export const GRAUS_INSALUBRIDADE = [
  { percentual: 10, label: "Grau mínimo (10%)" },
  { percentual: 20, label: "Grau médio (20%)" },
  { percentual: 40, label: "Grau máximo (40%)" },
] as const;

export const PERICULOSIDADE_PERCENTUAL_LEGAL = 30;

/** Valor do adicional de insalubridade: percentual sobre o salário mínimo. */
export function valorInsalubridade(percentual: number, salarioMinimo: number | null | undefined): number | null {
  if (!percentual || percentual <= 0) return 0;
  if (!salarioMinimo || salarioMinimo <= 0) return null;
  return (salarioMinimo * percentual) / 100;
}

/** Valor do adicional de periculosidade: percentual sobre o salário base. */
export function valorPericulosidade(percentual: number, salarioBase: number | null | undefined): number | null {
  if (!percentual || percentual <= 0) return 0;
  if (!salarioBase || salarioBase <= 0) return null;
  return (salarioBase * percentual) / 100;
}

/** Percentual único gravado para compatibilidade com a apuração da folha. */
export function percentualAdicionalVigente(insalubridade: number, periculosidade: number): number {
  const i = Number.isFinite(insalubridade) ? Math.max(0, insalubridade) : 0;
  const p = Number.isFinite(periculosidade) ? Math.max(0, periculosidade) : 0;
  // Não cumulam: prevalece o mais favorável ao colaborador.
  return Math.max(i, p);
}

export interface AlertaRisco {
  tipo: "cumulacao" | "cargo_sem_percentual" | "percentual_atipico";
  mensagem: string;
}

export function alertasAdicionaisRisco(input: {
  insalubridade: number;
  periculosidade: number;
  cargoInsalubre?: boolean;
  cargoPerigoso?: boolean;
}): AlertaRisco[] {
  const out: AlertaRisco[] = [];
  const i = Math.max(0, input.insalubridade || 0);
  const p = Math.max(0, input.periculosidade || 0);

  if (i > 0 && p > 0) {
    out.push({
      tipo: "cumulacao",
      mensagem:
        "Insalubridade e periculosidade não podem ser pagas ao mesmo tempo (art. 193, §2º da CLT). " +
        "Mantenha apenas o adicional mais favorável ao colaborador.",
    });
  }
  if (i > 0 && ![10, 20, 40].includes(i)) {
    out.push({
      tipo: "percentual_atipico",
      mensagem: "A insalubridade legal é de 10%, 20% ou 40% do salário mínimo. Confirme o percentual informado.",
    });
  }
  if (p > 0 && p !== PERICULOSIDADE_PERCENTUAL_LEGAL) {
    out.push({
      tipo: "percentual_atipico",
      mensagem: "A periculosidade legal é de 30% do salário base. Percentual diferente precisa vir de norma coletiva.",
    });
  }
  if (input.cargoInsalubre && i === 0) {
    out.push({
      tipo: "cargo_sem_percentual",
      mensagem: "O cargo está marcado como insalubre — informe o grau devido ou registre o laudo que afasta o adicional.",
    });
  }
  if (input.cargoPerigoso && p === 0) {
    out.push({
      tipo: "cargo_sem_percentual",
      mensagem: "O cargo está marcado como perigoso — informe o percentual de periculosidade devido.",
    });
  }
  return out;
}

// ------------------------------------------------------------------
// Simulação do adicional por dia / por hora
//
// Intermitentes e diaristas raciocinam em valor do dia; horistas, em valor
// da hora. O adicional continua sendo um percentual, então a simulação é o
// mesmo percentual aplicado à unidade de pagamento do contrato.
// ------------------------------------------------------------------

export interface SimulacaoRisco {
  /** Adicional no mês, sobre a base salarial mensal. */
  mes: number | null;
  /** Adicional embutido em cada dia trabalhado. */
  porDia: number | null;
  /** Adicional embutido em cada hora trabalhada. */
  porHora: number | null;
}

const positivo = (n: number | null | undefined) =>
  n != null && Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null;

const perc = (base: number | null, percentual: number) => {
  if (base == null || percentual <= 0) return null;
  return Math.round(base * (percentual / 100) * 100) / 100;
};

/**
 * Simula um adicional percentual nas três unidades usadas nos contratos.
 * `baseMensal` é o salário mensal de referência; `valorDia`/`valorHora` são os
 * valores cadastrados para diarista/intermitente e horista.
 */
export function simularAdicionalPercentual(input: {
  percentual: number;
  baseMensal?: number | null;
  valorDia?: number | null;
  valorHora?: number | null;
}): SimulacaoRisco {
  const p = Math.max(0, Number(input.percentual) || 0);
  return {
    mes: perc(positivo(input.baseMensal), p),
    porDia: perc(positivo(input.valorDia), p),
    porHora: perc(positivo(input.valorHora), p),
  };
}
