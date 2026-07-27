// ------------------------------------------------------------------
// Domínio: DP → Encargos legais do contracheque (Fase 17)
//
// INSS progressivo, IRRF por faixa e FGTS (custo do empregador, não
// descontado do colaborador). Funções puras, sem I/O.
// ------------------------------------------------------------------

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Faixas progressivas do INSS (empregado). */
export const FAIXAS_INSS: { ate: number; aliquota: number }[] = [
  { ate: 1518.0, aliquota: 0.075 },
  { ate: 2793.88, aliquota: 0.09 },
  { ate: 4190.83, aliquota: 0.12 },
  { ate: 8157.41, aliquota: 0.14 },
];

/** Faixas do IRRF (base mensal já deduzida do INSS e dos dependentes). */
export const FAIXAS_IRRF: { ate: number; aliquota: number; deducao: number }[] = [
  { ate: 2428.8, aliquota: 0, deducao: 0 },
  { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
  { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
  { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
  { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
];

export const DEDUCAO_POR_DEPENDENTE = 189.59;
export const ALIQUOTA_FGTS = 0.08;

/** INSS progressivo por faixas, limitado ao teto de contribuição. */
export function calcularInss(base: number): number {
  if (base <= 0) return 0;
  let anterior = 0;
  let total = 0;
  for (const f of FAIXAS_INSS) {
    if (base <= anterior) break;
    const tributavel = Math.min(base, f.ate) - anterior;
    total += tributavel * f.aliquota;
    anterior = f.ate;
  }
  return round2(total);
}

/** IRRF sobre a base (bruto − INSS − dependentes). */
export function calcularIrrf(base: number): number {
  if (base <= 0) return 0;
  const faixa = FAIXAS_IRRF.find((f) => base <= f.ate) ?? FAIXAS_IRRF[FAIXAS_IRRF.length - 1];
  return round2(Math.max(0, base * faixa.aliquota - faixa.deducao));
}

/** FGTS: 8% sobre a remuneração — depósito do empregador, não é desconto. */
export function calcularFgts(base: number): number {
  return base > 0 ? round2(base * ALIQUOTA_FGTS) : 0;
}

export interface Encargos {
  baseInss: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  fgts: number;
  /** INSS + IRRF: o que efetivamente é descontado do colaborador. */
  descontos: number;
}

/** Encargos legais de uma remuneração bruta tributável. */
export function calcularEncargos(bruto: number, dependentes = 0): Encargos {
  const baseInss = round2(Math.max(0, bruto));
  const inss = calcularInss(baseInss);
  const baseIrrf = round2(Math.max(0, baseInss - inss - Math.max(0, dependentes) * DEDUCAO_POR_DEPENDENTE));
  const irrf = calcularIrrf(baseIrrf);
  return {
    baseInss,
    inss,
    baseIrrf,
    irrf,
    fgts: calcularFgts(baseInss),
    descontos: round2(inss + irrf),
  };
}
