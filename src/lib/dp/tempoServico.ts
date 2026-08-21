// ------------------------------------------------------------------
// Domínio: adicional por tempo de serviço (anuênio / triênio / quinquênio)
//
// Regras negociadas em ACT/CCT concedem um percentual a cada ciclo de
// meses completos de casa. Aqui ficam as funções puras de seleção da
// regra aplicável e de cálculo do adicional. Sem acesso a rede.
// ------------------------------------------------------------------

import { moedaBR } from "./cargos";

export type EscopoAdicional = "empresa" | "sindicato" | "unidade" | "cargo";
export type BaseAdicional = "salario_base" | "piso_cargo";

export interface RegraTempoServico {
  id: string;
  nome: string;
  escopo: EscopoAdicional;
  sindicato_id: string | null;
  unidade_id: string | null;
  cargo_id: string | null;
  ciclo_meses: number;
  percentual_por_ciclo: number;
  base: BaseAdicional;
  max_ciclos: number | null;
  acumula: boolean;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
  observacao?: string | null;
}

export interface AlvoAdicional {
  cargoId?: string | null;
  unidadeId?: string | null;
  /** Sindicato laboral do colaborador. */
  sindicatoId?: string | null;
}

/** Rótulos amigáveis por tamanho de ciclo (12 = anuênio, 36 = triênio...). */
export const CICLO_LABEL: Record<number, string> = {
  12: "Anuênio",
  24: "Biênio",
  36: "Triênio",
  48: "Quadriênio",
  60: "Quinquênio",
};

export function rotuloCiclo(meses: number): string {
  return CICLO_LABEL[meses] ?? `Ciclo de ${meses} meses`;
}

const PESO_ESCOPO: Record<EscopoAdicional, number> = {
  cargo: 4,
  unidade: 3,
  sindicato: 2,
  empresa: 1,
};

const dia = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
};

function vigenteEm(regra: RegraTempoServico, referencia: string): boolean {
  const ref = dia(referencia);
  const ini = dia(regra.vigencia_inicio);
  const fim = dia(regra.vigencia_fim);
  if (!ref || !ini) return false;
  if (ref < ini) return false;
  if (fim && ref > fim) return false;
  return true;
}

/** Uma regra atende ao colaborador informado? */
export function regraAtende(regra: RegraTempoServico, alvo: AlvoAdicional): boolean {
  switch (regra.escopo) {
    case "cargo":
      return !!regra.cargo_id && regra.cargo_id === alvo.cargoId;
    case "unidade":
      return !!regra.unidade_id && regra.unidade_id === alvo.unidadeId;
    case "sindicato":
      return !!regra.sindicato_id && regra.sindicato_id === alvo.sindicatoId;
    default:
      return true;
  }
}

/**
 * Escolhe a regra mais específica e vigente para o colaborador.
 * Prioridade: cargo > unidade > sindicato > empresa. Entre regras de mesmo
 * escopo, vence a de maior ciclo já **alcançado** pelo colaborador (escada:
 * quinquênio substitui triênio a partir de 5 anos de casa); se nenhuma foi
 * alcançada, devolve a de menor ciclo, apenas para a mensagem de "ainda não
 * atende". Empate final resolve pela vigência mais recente.
 */
export function selecionarRegraTempoServico(
  regras: RegraTempoServico[],
  alvo: AlvoAdicional,
  referencia: string,
  admissao?: string | null,
): RegraTempoServico | null {
  const meses = mesesDeCasa(admissao, referencia);
  const alcancou = (r: RegraTempoServico) =>
    r.ciclo_meses > 0 && Math.floor(meses / r.ciclo_meses) >= 1 ? 1 : 0;
  const candidatas = regras
    .filter((r) => r.ativo && vigenteEm(r, referencia) && regraAtende(r, alvo))
    .sort((a, b) => {
      const peso = PESO_ESCOPO[b.escopo] - PESO_ESCOPO[a.escopo];
      if (peso !== 0) return peso;
      const alcance = alcancou(b) - alcancou(a);
      if (alcance !== 0) return alcance;
      const ciclo = alcancou(a) === 1 ? b.ciclo_meses - a.ciclo_meses : a.ciclo_meses - b.ciclo_meses;
      if (ciclo !== 0) return ciclo;
      return b.vigencia_inicio.localeCompare(a.vigencia_inicio);
    });
  return candidatas[0] ?? null;
}


/** Meses completos entre admissão e a data de referência. */
export function mesesDeCasa(admissao: string | null | undefined, referencia: string): number {
  const ini = dia(admissao);
  const ref = dia(referencia);
  if (!ini || !ref || ref < ini) return 0;
  let meses =
    (ref.getUTCFullYear() - ini.getUTCFullYear()) * 12 + (ref.getUTCMonth() - ini.getUTCMonth());
  if (ref.getUTCDate() < ini.getUTCDate()) meses -= 1;
  return Math.max(0, meses);
}

export interface AdicionalCalculado {
  regra: RegraTempoServico;
  /** Ciclos completos já adquiridos (limitado por `max_ciclos`). */
  ciclos: number;
  /** Percentual total aplicado sobre a base. */
  percentual: number;
  /** Valor em reais do adicional no mês. */
  valor: number;
  /** Meses completos de casa na referência. */
  meses: number;
  /** Meses restantes para o próximo ciclo (null quando já atingiu o limite). */
  mesesParaProximo: number | null;
  rotulo: string;
}

/**
 * Calcula o adicional por tempo de serviço.
 * `base` é o salário (ou piso) mensal já resolvido pela tela chamadora.
 */
export function calcularAdicionalTempoServico(input: {
  regra: RegraTempoServico | null;
  admissao: string | null | undefined;
  referencia: string;
  base: number;
}): AdicionalCalculado | null {
  const { regra, admissao, referencia, base } = input;
  if (!regra || regra.percentual_por_ciclo <= 0) return null;

  const meses = mesesDeCasa(admissao, referencia);
  const ciclosBrutos = Math.floor(meses / regra.ciclo_meses);
  const limite = regra.max_ciclos != null && regra.max_ciclos > 0 ? regra.max_ciclos : null;
  const ciclos = limite != null ? Math.min(ciclosBrutos, limite) : ciclosBrutos;
  const efetivos = regra.acumula ? ciclos : Math.min(ciclos, 1);
  const percentual = Number((efetivos * regra.percentual_por_ciclo).toFixed(3));
  const valor = Number(((Math.max(0, base) * percentual) / 100).toFixed(2));

  const atingiuLimite = limite != null && ciclosBrutos >= limite;
  const mesesParaProximo = atingiuLimite
    ? null
    : regra.ciclo_meses - (meses % regra.ciclo_meses || 0) || regra.ciclo_meses;

  return {
    regra,
    ciclos: efetivos,
    percentual,
    valor,
    meses,
    mesesParaProximo,
    rotulo: `${rotuloCiclo(regra.ciclo_meses)} — ${efetivos}x ${regra.percentual_por_ciclo}%`,
  };
}

/** Texto curto para exibir na ficha do colaborador. */
export function descreverAdicional(calc: AdicionalCalculado | null): string {
  if (!calc || calc.ciclos === 0) return "Sem adicional adquirido ainda";
  return `${calc.rotulo} = ${calc.percentual}% (${moedaBR(calc.valor)}/mês)`;
}

export const ESCOPO_ADICIONAL_LABEL: Record<EscopoAdicional, string> = {
  empresa: "Toda a empresa",
  sindicato: "Por sindicato laboral",
  unidade: "Por unidade",
  cargo: "Por cargo",
};

export const BASE_ADICIONAL_LABEL: Record<BaseAdicional, string> = {
  salario_base: "Salário do colaborador",
  piso_cargo: "Piso do cargo",
};
