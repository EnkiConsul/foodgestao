// ------------------------------------------------------------------
// Domínio: DP → Padrão de benefícios por unidade.
//
// Assiduidade, tolerância, vale-alimentação, vale-transporte e a ficha de
// benefícios são, na prática, iguais para todo o time de uma unidade (mesma
// negociação coletiva). O primeiro colaborador cadastrado define o padrão e os
// próximos já nascem pré-preenchidos. O padrão da unidade tem prioridade sobre
// o padrão geral da empresa; nada é aplicado a colaborador já existente.
// ------------------------------------------------------------------

import type { RemuneracaoFormState } from "@/components/dp/RemuneracaoFields";

/** Campos que fazem parte do padrão (salário/hora nunca entram: são do cargo). */
export const CAMPOS_PADRAO = [
  "vale_transporte",
  "vale_transporte_valor_dia",
  "premio_assiduidade",
  "premio_assiduidade_valor",
  "premio_assiduidade_tipo",
  "assiduidade_criterio",
  "assiduidade_tolerancia_min",
  "assiduidade_max_atrasos",
  "vale_alimentacao",
  "vale_alimentacao_valor",
  "vale_alimentacao_periodicidade",
  "vale_alimentacao_dias_base",
  "vale_alimentacao_dias_origem",
  "vale_alimentacao_desconto_tipo",
  "vale_alimentacao_desconto_valor",
  "beneficios",
] as const satisfies readonly (keyof RemuneracaoFormState)[];

export type CampoPadrao = (typeof CAMPOS_PADRAO)[number];

export type BeneficiosPadraoPayload = Partial<Pick<RemuneracaoFormState, CampoPadrao>>;

export interface BeneficiosPadraoLinha {
  id?: string;
  unidade_id?: string | null;
  payload: BeneficiosPadraoPayload;
  updated_at?: string | null;
}

/** Recorta do formulário apenas os campos que compõem o padrão. */
export function extrairPadrao(rem: RemuneracaoFormState): BeneficiosPadraoPayload {
  const out: Record<string, unknown> = {};
  for (const campo of CAMPOS_PADRAO) out[campo] = rem[campo];
  return out as BeneficiosPadraoPayload;
}

/** O padrão da unidade vence o padrão geral da empresa. */
export function resolverPadrao(
  linhas: BeneficiosPadraoLinha[] | null | undefined,
  unidadeId: string | null | undefined,
): BeneficiosPadraoLinha | null {
  const lista = linhas ?? [];
  const daUnidade = unidadeId ? lista.find((l) => l.unidade_id === unidadeId) : null;
  if (daUnidade) return daUnidade;
  return lista.find((l) => !l.unidade_id) ?? null;
}

/** Mescla o padrão no formulário, mantendo apenas campos conhecidos. */
export function aplicarPadrao(
  rem: RemuneracaoFormState,
  payload: BeneficiosPadraoPayload | null | undefined,
): RemuneracaoFormState {
  if (!payload) return rem;
  const patch: Record<string, unknown> = {};
  for (const campo of CAMPOS_PADRAO) {
    const valor = (payload as Record<string, unknown>)[campo];
    if (valor === undefined || valor === null) continue;
    patch[campo] = valor;
  }
  return { ...rem, ...(patch as Partial<RemuneracaoFormState>) };
}

/** O padrão traz alguma informação útil? (evita salvar padrão vazio) */
export function padraoTemConteudo(payload: BeneficiosPadraoPayload | null | undefined): boolean {
  if (!payload) return false;
  const beneficiosMarcados = Object.values(payload.beneficios ?? {}).some(Boolean);
  return !!payload.vale_transporte || !!payload.vale_alimentacao || !!payload.premio_assiduidade
    || beneficiosMarcados;
}

/** Resumo curto para telas de configuração. */
export function resumoPadrao(payload: BeneficiosPadraoPayload | null | undefined): string[] {
  if (!payload) return [];
  const itens: string[] = [];
  if (payload.vale_transporte) {
    itens.push(`Vale-transporte R$ ${payload.vale_transporte_valor_dia || "0,00"}/dia`);
  }
  if (payload.vale_alimentacao) {
    const per = payload.vale_alimentacao_periodicidade === "diario" ? "por dia" : "por mês";
    itens.push(`Vale-alimentação R$ ${payload.vale_alimentacao_valor || "0,00"} ${per}`);
  }
  if (payload.premio_assiduidade) {
    const unidade = payload.premio_assiduidade_tipo === "percentual" ? "%" : "R$";
    itens.push(`Assiduidade ${unidade} ${payload.premio_assiduidade_valor || "0"}`);
  }
  if (payload.assiduidade_tolerancia_min) {
    itens.push(`Tolerância de ${payload.assiduidade_tolerancia_min} min`);
  }
  const marcados = Object.values(payload.beneficios ?? {}).filter(Boolean).length;
  if (marcados > 0) itens.push(`${marcados} benefício(s) da ficha`);
  return itens;
}
