/**
 * Pagamento acima do documento (valor comprovado > líquido).
 *
 * Exige motivo estruturado, justificativa e confirmação de responsabilidade.
 * Cada motivo traz o embasamento legal para o gestor decidir com clareza —
 * orientação, não parecer jurídico.
 */
export type MotivoExcedente =
  | "erro_calculo"
  | "periodo_anterior"
  | "reembolso"
  | "premio"
  | "comissao"
  | "adiantamento_adicional"
  | "outro";

export const JUSTIFICATIVA_EXCEDENTE_MIN = 15;

export const CONFIRMACAO_EXCEDENTE =
  "Revisei a diferença, informei o motivo e assumo a responsabilidade pela conferência.";

export type InfoMotivo = { rotulo: string; orientacao: string; base: string };

export const MOTIVOS_EXCEDENTE: Record<MotivoExcedente, InfoMotivo> = {
  erro_calculo: {
    rotulo: "Correção de erro de cálculo",
    orientacao: "Corrija o valor do documento ou emita documento complementar; o pagamento precisa bater com o demonstrativo.",
    base: "CLT art. 464 (pagamento contra recibo) e art. 477 §2º (discriminação das parcelas).",
  },
  periodo_anterior: {
    rotulo: "Diferença de período anterior",
    orientacao: "Identifique a competência original e a razão do ajuste; a diferença deve constar no demonstrativo daquela competência ou em folha complementar.",
    base: "CLT art. 459 (pagamento mensal) e art. 464 (recibo discriminado).",
  },
  reembolso: {
    rotulo: "Reembolso de despesa",
    orientacao: "Guarde o comprovante da despesa vinculado a este registro. Reembolso comprovado não é salário.",
    base: "CLT art. 457 §2º (ajuda de custo e diárias não integram a remuneração).",
  },
  premio: {
    rotulo: "Prêmio, bônus ou gratificação",
    orientacao: "Verifique com a contabilidade se a verba deve constar no documento remuneratório. Gratificação paga com habitualidade integra o salário.",
    base: "CLT art. 457 §1º (gratificações legais integram) e §4º (prêmio por desempenho superior, sem habitualidade, não integra); Súmula 152 do TST.",
  },
  comissao: {
    rotulo: "Comissão",
    orientacao: "Comissão é salário: deve constar no demonstrativo, com reflexos em férias, 13º e FGTS.",
    base: "CLT art. 457 §1º e art. 466; Súmula 27 do TST.",
  },
  adiantamento_adicional: {
    rotulo: "Adiantamento adicional",
    orientacao: "Registre o adiantamento para que seja descontado no pagamento do mês; sem desconto, a diferença vira pagamento a maior.",
    base: "CLT art. 462 (descontos só de adiantamentos ou previstos em lei/contrato).",
  },
  outro: {
    rotulo: "Outro motivo",
    orientacao: "Descreva com detalhes a natureza do valor. Pagamento sem documento que o explique pode ser tratado como salário.",
    base: "CLT art. 457 e art. 464; princípio da primazia da realidade.",
  },
};

/** Alerta geral exibido para qualquer excedente. */
export const ALERTA_EXCEDENTE =
  "Valores pagos fora do documento, com habitualidade, podem integrar o salário e gerar reflexos em férias, 13º, FGTS e INSS (CLT art. 457 e Súmula 152 do TST).";

export type ConfirmacaoExcedente = {
  motivo: MotivoExcedente | null;
  justificativa: string;
  confirmado: boolean;
};

export function validarExcedente(c: ConfirmacaoExcedente): { ok: true } | { ok: false; erro: string } {
  if (!c.motivo) return { ok: false, erro: "Escolha o motivo do valor a maior." };
  if (c.justificativa.trim().length < JUSTIFICATIVA_EXCEDENTE_MIN)
    return { ok: false, erro: `Justifique o valor a maior (mín. ${JUSTIFICATIVA_EXCEDENTE_MIN} caracteres).` };
  if (!c.confirmado) return { ok: false, erro: "Confirme que revisou a diferença e assume a conferência." };
  return { ok: true };
}
