// ------------------------------------------------------------------
// Domínio: DP → Remuneração do colaborador
//
// Fonte única das regras de remuneração cadastradas no colaborador
// (forma de pagamento, salário/valor-hora, adicionais, vale-transporte).
// Funções puras — nenhuma tela deve recalcular isso inline.
// ------------------------------------------------------------------

import type { Database } from "@/integrations/supabase/types";
import { contratoPolicy, formasPagamentoDoRegime, formaPagamentoValida } from "./contrato-policy";

export type FormaPagamento = Database["public"]["Enums"]["dp_forma_pagamento"];

export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  mensalista: "Mensalista (salário fixo)",
  horista: "Horista (por hora trabalhada)",
  diarista: "Diarista (por dia trabalhado)",
};

export const FORMA_PAGAMENTO_OPTIONS: { value: FormaPagamento; label: string }[] = [
  { value: "mensalista", label: FORMA_PAGAMENTO_LABEL.mensalista },
  { value: "horista", label: FORMA_PAGAMENTO_LABEL.horista },
  { value: "diarista", label: FORMA_PAGAMENTO_LABEL.diarista },
];

/** Dias úteis considerados no cálculo padrão do vale-transporte. */
export const DIAS_UTEIS_MES = 22;

/** Limite legal do desconto de vale-transporte (art. 4º, Lei 7.418/85). */
export const VT_DESCONTO_MAXIMO = 0.06;

/** Formas de pagamento oferecidas no cadastro conforme o vínculo. */
export function formaPagamentoOptions(
  regime?: string | null,
): { value: FormaPagamento; label: string }[] {
  return formasPagamentoDoRegime(regime).map((value) => ({
    value: value as FormaPagamento,
    label: FORMA_PAGAMENTO_LABEL[value as FormaPagamento],
  }));
}

/** Forma de pagamento sugerida pelo vínculo (a 1ª admitida pelo contrato). */
export function formaPagamentoPadrao(regime?: string | null): FormaPagamento {
  return formasPagamentoDoRegime(regime)[0] as FormaPagamento;
}

/**
 * Ajusta a forma de pagamento ao vínculo: dados legados incompatíveis
 * (ex.: intermitente mensalista) caem na primeira forma admitida.
 */
export function ajustarFormaPagamento(
  regime?: string | null,
  forma?: string | null,
): FormaPagamento {
  return formaPagamentoValida(regime, forma) as FormaPagamento;
}

/** O vínculo gera folha de pagamento CLT (freelancer/PJ ficam fora). */
export function entraEmFolha(regime?: string | null): boolean {
  return contratoPolicy(regime).entraEmFolha;
}

/**
 * Adiantamento quinzenal exige salário mensal fixo: além da política do
 * contrato, só se aplica a mensalistas.
 */
export function permiteAdiantamento(regime?: string | null, forma?: FormaPagamento | null): boolean {
  return contratoPolicy(regime).permiteAdiantamento && (forma ?? "mensalista") === "mensalista";
}

export interface RemuneracaoColaborador {
  forma_pagamento?: FormaPagamento | null;
  salario_base?: number | null;
  valor_hora?: number | null;
  dependentes_irrf?: number | null;
  adicional_percentual?: number | null;
  vale_transporte?: boolean | null;
  vale_transporte_valor_dia?: number | null;
  /** Salário do cargo, usado quando o colaborador não tem valor próprio. */
  salario_cargo?: number | null;
}

/** Salário base efetivo: valor do colaborador e, na ausência, o do cargo. */
export function salarioBaseEfetivo(r: RemuneracaoColaborador): number | null {
  const proprio = num(r.salario_base);
  if (proprio > 0) return proprio;
  const cargo = num(r.salario_cargo);
  return cargo > 0 ? cargo : null;
}

/**
 * Valor da hora efetivo:
 *  - horista → valor da hora cadastrado;
 *  - diarista → valor do dia dividido pela jornada diária (carga/5);
 *  - mensalista → salário ÷ (carga semanal × 5), divisor CLT.
 */
export function valorHoraEfetivo(
  r: RemuneracaoColaborador,
  cargaSemanalHoras?: number | null,
): number | undefined {
  const forma = r.forma_pagamento ?? "mensalista";
  const carga = cargaSemanalHoras && cargaSemanalHoras > 0 ? cargaSemanalHoras : 44;

  if (forma === "horista") {
    const vh = num(r.valor_hora);
    return vh > 0 ? vh : undefined;
  }

  const salario = salarioBaseEfetivo(r);
  if (!salario) return undefined;

  if (forma === "diarista") {
    const horasDia = carga / 5;
    return horasDia > 0 ? salario / horasDia : undefined;
  }
  return salario / (carga * 5);
}

/** Valor do adicional de insalubridade/periculosidade sobre uma base. */
export function valorAdicional(base: number, percentual?: number | null): number {
  const p = Math.min(100, Math.max(0, num(percentual)));
  if (p <= 0 || base <= 0) return 0;
  return round2(base * (p / 100));
}

/** Vale-transporte do mês: valor concedido e desconto legal de até 6%. */
export function valeTransporteDoMes(
  r: RemuneracaoColaborador,
  diasUteis = DIAS_UTEIS_MES,
): { bruto: number; desconto: number; liquido: number } {
  const dia = num(r.vale_transporte_valor_dia);
  if (!r.vale_transporte || dia <= 0) return { bruto: 0, desconto: 0, liquido: 0 };
  const bruto = round2(dia * Math.max(0, diasUteis));
  const salario = salarioBaseEfetivo(r) ?? 0;
  const desconto = Math.min(bruto, round2(salario * VT_DESCONTO_MAXIMO));
  return { bruto, desconto, liquido: round2(bruto - desconto) };
}

/**
 * Motivo do bloqueio da folha quando a remuneração não está cadastrada.
 * `null` = colaborador apto a gerar folha.
 */
export function remuneracaoPendente(r: RemuneracaoColaborador): string | null {
  const forma = r.forma_pagamento ?? "mensalista";
  if (forma === "horista") {
    return num(r.valor_hora) > 0 ? null : "Valor da hora não informado";
  }
  if (salarioBaseEfetivo(r)) return null;
  return forma === "diarista"
    ? "Valor do dia não informado"
    : "Salário base não informado (colaborador e cargo)";
}

// ------------------------------------------------------------------
// Base de cálculo do valor da hora / do dia
// ------------------------------------------------------------------

/** Bases de horas mensais usualmente praticadas (220h = 44h semanais). */
export const BASES_HORAS_MES = [220, 200, 180, 150, 120];

/** Base de horas mensais padrão quando o administrador não informa. */
export const BASE_HORAS_MES_PADRAO = 220;

/** Base de dias mensais padrão para diaristas. */
export const BASE_DIAS_MES_PADRAO = 30;

/**
 * Valor da hora derivado da base salarial informada no cadastro
 * (base salarial ÷ base de horas). `null` quando faltam dados.
 */
export function valorHoraPorBase(
  baseSalarial?: number | null,
  baseHoras?: number | null,
): number | null {
  const salario = num(baseSalarial);
  const horas = num(baseHoras);
  if (salario <= 0 || horas <= 0) return null;
  return round2(salario / horas);
}

/**
 * Valor do dia derivado da base salarial informada no cadastro
 * (base salarial ÷ base de dias). `null` quando faltam dados.
 */
export function valorDiaPorBase(
  baseSalarial?: number | null,
  baseDias?: number | null,
): number | null {
  const salario = num(baseSalarial);
  const dias = num(baseDias);
  if (salario <= 0 || dias <= 0) return null;
  return round2(salario / dias);
}

// ------------------------------------------------------------------
// Assiduidade e pontualidade
// ------------------------------------------------------------------

export type AssiduidadeCriterio = "sem_faltas_sem_atrasos" | "sem_faltas" | "proporcional";

export const ASSIDUIDADE_CRITERIO_LABEL: Record<AssiduidadeCriterio, string> = {
  sem_faltas_sem_atrasos: "Sem faltas e sem atrasos",
  sem_faltas: "Sem faltas (atrasos tolerados)",
  proporcional: "Perde proporcional por ocorrência",
};

export const ASSIDUIDADE_CRITERIO_OPTIONS: { value: AssiduidadeCriterio; label: string }[] = [
  { value: "sem_faltas_sem_atrasos", label: ASSIDUIDADE_CRITERIO_LABEL.sem_faltas_sem_atrasos },
  { value: "sem_faltas", label: ASSIDUIDADE_CRITERIO_LABEL.sem_faltas },
  { value: "proporcional", label: ASSIDUIDADE_CRITERIO_LABEL.proporcional },
];

export interface AssiduidadeConfig {
  premio_assiduidade?: boolean | null;
  premio_assiduidade_valor?: number | null;
  assiduidade_criterio?: AssiduidadeCriterio | string | null;
  assiduidade_tolerancia_min?: number | null;
  assiduidade_max_atrasos?: number | null;
}

export interface OcorrenciasMes {
  faltas: number;
  /** Atrasos que ultrapassaram a tolerância diária. */
  atrasos: number;
  /** Dias efetivamente previstos no mês, usado no critério proporcional. */
  diasPrevistos?: number;
}

/**
 * Prêmio de assiduidade devido no mês conforme o critério cadastrado.
 * Função pura — a folha (quando ativada) consome este resultado.
 */
export function premioAssiduidadeDevido(
  cfg: AssiduidadeConfig,
  oc: OcorrenciasMes,
): number {
  const valor = num(cfg.premio_assiduidade_valor);
  if (!cfg.premio_assiduidade || valor <= 0) return 0;

  const faltas = Math.max(0, num(oc.faltas));
  const atrasos = Math.max(0, num(oc.atrasos));
  const criterio = (cfg.assiduidade_criterio ?? "sem_faltas_sem_atrasos") as AssiduidadeCriterio;

  if (criterio === "sem_faltas") {
    return faltas > 0 ? 0 : valor;
  }
  if (criterio === "proporcional") {
    const dias = Math.max(1, num(oc.diasPrevistos) || 22);
    const ocorrencias = faltas + atrasos;
    if (ocorrencias <= 0) return valor;
    const proporcao = Math.max(0, 1 - ocorrencias / dias);
    return round2(valor * proporcao);
  }
  // sem_faltas_sem_atrasos — respeita o máximo de atrasos tolerados.
  const maxAtrasos = Math.max(0, num(cfg.assiduidade_max_atrasos));
  if (faltas > 0) return 0;
  return atrasos > maxAtrasos ? 0 : valor;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

