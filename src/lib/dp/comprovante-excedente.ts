/**
 * Pagamento acima do documento (valor comprovado > líquido).
 *
 * Exige motivo estruturado, justificativa e confirmação de responsabilidade.
 * Cada motivo traz o embasamento legal para o gestor decidir com clareza —
 * orientação, não parecer jurídico.
 *
 * Regras:
 * - Pagamento por engano NÃO gera recibo (recibo daria quitação ao erro);
 *   o gestor escolhe como acertar: estorno pelo colaborador ou desconto no
 *   próximo pagamento.
 * - O recibo da diferença é sempre uma verba extra, nunca da mesma natureza
 *   do documento principal (adiantamento/salário): se fosse, o documento
 *   principal é que deveria trazer o valor.
 * - A forma de pagamento do recibo vem do próprio comprovante.
 */
export type MotivoExcedente =
  | "pago_por_engano"
  | "periodo_anterior"
  | "reembolso"
  | "premio"
  | "comissao"
  | "outro";

export type AcertoEngano = "estorno_parcial" | "estorno_total" | "desconto_proximo";

export const ACERTO_ENGANO_LABEL: Record<AcertoEngano, string> = {
  estorno_parcial: "Colaborador devolve só a diferença",
  estorno_total: "Colaborador devolve tudo e pago de novo o valor certo",
  desconto_proximo: "Descontar no próximo pagamento",
};

export const ACERTO_ENGANO_ORIENTACAO: Record<AcertoEngano, string> = {
  estorno_parcial: "Quando o colaborador devolver, anexe o comprovante do estorno neste documento. O total fica quitado no valor correto.",
  estorno_total: "Anexe o comprovante da devolução integral e depois o novo comprovante com o valor correto. O documento fica pendente até o novo pagamento.",
  desconto_proximo: "Lance o desconto no próximo pagamento com ciência do colaborador (CLT art. 462).",
};

/** Natureza de cada comprovante extra: estorno subtrai do total pago. */
export type NaturezaComprovante = "pagamento" | "estorno" | "repagamento";
export const NATUREZA_COMPROVANTE_LABEL: Record<NaturezaComprovante, string> = {
  pagamento: "Comprovante complementar",
  estorno: "Comprovante de estorno (devolução)",
  repagamento: "Novo comprovante (valor correto)",
};
export function sinalNatureza(n: NaturezaComprovante | string | null | undefined): 1 | -1 {
  return n === "estorno" ? -1 : 1;
}

export const JUSTIFICATIVA_EXCEDENTE_MIN = 15;

export const CONFIRMACAO_EXCEDENTE =
  "Revisei a diferença, informei o motivo e assumo a responsabilidade pela conferência.";

export type InfoMotivo = { rotulo: string; orientacao: string; base: string };

export const MOTIVOS_EXCEDENTE: Record<MotivoExcedente, InfoMotivo> = {
  pago_por_engano: {
    rotulo: "Paguei a mais por engano",
    orientacao: "Não emita recibo: ele daria quitação ao valor errado. Combine a devolução (estorno) ou o desconto no próximo pagamento, e informe a contabilidade.",
    base: "CLT art. 462 (desconto só de adiantamento ou previsto em lei/contrato) e Código Civil art. 876 (quem recebe o indevido deve restituir).",
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
  outro: {
    rotulo: "Outro motivo",
    orientacao: "Descreva com detalhes a natureza do valor. Pagamento sem documento que o explique pode ser tratado como salário.",
    base: "CLT art. 457 e art. 464; princípio da primazia da realidade.",
  },
};

/** Alerta geral exibido para qualquer excedente. */
export const ALERTA_EXCEDENTE =
  "Valores pagos fora do documento, com habitualidade, podem integrar o salário e gerar reflexos em férias, 13º, FGTS e INSS (CLT art. 457 e Súmula 152 do TST).";

/** Só verba extra legítima gera recibo; engano nunca. */
export function motivoPermiteRecibo(m: MotivoExcedente | null): boolean {
  return !!m && m !== "pago_por_engano";
}

/** Natureza do recibo: nunca adiantamento/salário (mesma do principal). */
export function naturezaReciboDiferenca(_m: MotivoExcedente): "outros" {
  return "outros";
}

/**
 * Forma de pagamento da diferença, deduzida do comprovante. No misto, o
 * excedente é atribuído primeiro ao dinheiro (parte sem lastro bancário).
 */
export function quitacaoDiferenca(
  modalidade: "bancario" | "especie" | "misto",
  diferencaCents: number,
  especieCents: number | null,
): { modalidade: "bancario" | "especie" | "misto"; bancarioCents: number | null; especieCents: number | null } {
  if (modalidade === "bancario") return { modalidade, bancarioCents: diferencaCents, especieCents: null };
  if (modalidade === "especie") return { modalidade, bancarioCents: null, especieCents: diferencaCents };
  const esp = Math.min(Math.max(especieCents ?? 0, 0), diferencaCents);
  const banc = diferencaCents - esp;
  if (banc === 0) return { modalidade: "especie", bancarioCents: null, especieCents: esp };
  if (esp === 0) return { modalidade: "bancario", bancarioCents: banc, especieCents: null };
  return { modalidade: "misto", bancarioCents: banc, especieCents: esp };
}

export type ConfirmacaoExcedente = {
  motivo: MotivoExcedente | null;
  justificativa: string;
  confirmado: boolean;
  acerto?: AcertoEngano | null;
};

export function validarExcedente(c: ConfirmacaoExcedente): { ok: true } | { ok: false; erro: string } {
  if (!c.motivo) return { ok: false, erro: "Escolha o motivo do valor a maior." };
  if (c.motivo === "pago_por_engano" && !c.acerto)
    return { ok: false, erro: "Informe como o valor pago por engano será acertado." };
  if (c.justificativa.trim().length < JUSTIFICATIVA_EXCEDENTE_MIN)
    return { ok: false, erro: `Justifique o valor a maior (mín. ${JUSTIFICATIVA_EXCEDENTE_MIN} caracteres).` };
  if (!c.confirmado) return { ok: false, erro: "Confirme que revisou a diferença e assume a conferência." };
  return { ok: true };
}
