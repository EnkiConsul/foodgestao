/**
 * Forma de quitação do pagamento comprovado.
 *
 * Regra de negócio (CLT, art. 464): pagamento em conta (Pix/TED) tem eficácia
 * de quitação pelo comprovante bancário; pagamento em espécie exige recibo
 * assinado pelo empregado. O pagamento pode ser misto — parte em conta, parte
 * em dinheiro — e aí os dois lastros precisam existir.
 *
 * Este módulo só valida e formata: a gravação é sempre conferida de novo pelo
 * servidor (`dp_comprovante_anexar`).
 */

export const COMPROVANTE_MODALIDADES = ["bancario", "especie", "misto"] as const;
export type ComprovanteModalidade = (typeof COMPROVANTE_MODALIDADES)[number];

export const MODALIDADE_LABEL: Record<ComprovanteModalidade, string> = {
  bancario: "Pix ou Transferência",
  especie: "Dinheiro (Espécie)",
  misto: "Misto (Conta e Dinheiro)",
};

export const MODALIDADE_AJUDA: Record<ComprovanteModalidade, string> = {
  bancario: "O comprovante do banco já vale como quitação do valor pago.",
  especie: "Pagamento em dinheiro exige recibo assinado pelo colaborador.",
  misto: "Informe quanto foi pago na conta e quanto foi pago em dinheiro.",
};

export function modalidadeLabel(valor?: string | null): string {
  const m = (valor ?? "").trim() as ComprovanteModalidade;
  return MODALIDADE_LABEL[m] ?? "Não informada";
}

export function ehModalidade(valor?: string | null): valor is ComprovanteModalidade {
  return COMPROVANTE_MODALIDADES.includes((valor ?? "") as ComprovanteModalidade);
}

/** Quem paga em dinheiro (total ou em parte) precisa do recibo de quitação. */
export function exigeRecibo(modalidade?: string | null): boolean {
  return modalidade === "especie" || modalidade === "misto";
}

// ------------------------------------------------------------------
// Dinheiro
// ------------------------------------------------------------------

/** Centavos para "R$ 1.234,56". */
export function centsParaBRL(cents?: number | null): string {
  const v = Number(cents ?? 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Lê o valor digitado pelo gestor ("1.234,56", "1234,5", "R$ 80") em centavos.
 * Devolve null quando não há número válido.
 */
export function brlParaCents(texto: string): number | null {
  const bruto = (texto ?? "").trim();
  if (!bruto) return null;
  const limpo = bruto
    .replace(/[R$\s]/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(limpo)) return null;
  const cents = Math.round(Number(limpo) * 100);
  if (!Number.isFinite(cents) || cents < 0) return null;
  return cents;
}

// ------------------------------------------------------------------
// Validação do conjunto
// ------------------------------------------------------------------

export type QuitacaoEntrada = {
  modalidade: ComprovanteModalidade;
  /** Valor pago na conta, em centavos. */
  bancarioCents: number | null;
  /** Valor pago em dinheiro, em centavos. */
  especieCents: number | null;
};

export type QuitacaoValida = {
  ok: true;
  modalidade: ComprovanteModalidade;
  bancarioCents: number | null;
  especieCents: number | null;
  motivo?: undefined;
};
export type QuitacaoInvalida = { ok: false; motivo: string };

/**
 * Espelha as travas do banco: espécie e misto exigem o valor em dinheiro;
 * misto exige também o valor pago na conta. Os valores que não fazem parte da
 * modalidade são descartados aqui para não irem ao servidor.
 */
export function validarQuitacao(entrada: QuitacaoEntrada): QuitacaoValida | QuitacaoInvalida {
  const { modalidade } = entrada;
  if (!ehModalidade(modalidade)) {
    return { ok: false, motivo: "Informe como o pagamento foi feito." };
  }

  if (modalidade === "bancario") {
    return { ok: true, modalidade, bancarioCents: entrada.bancarioCents ?? null, especieCents: null };
  }

  const especie = entrada.especieCents;
  if (!especie || especie <= 0) {
    return { ok: false, motivo: "Informe o valor pago em dinheiro." };
  }

  if (modalidade === "especie") {
    return { ok: true, modalidade, bancarioCents: null, especieCents: especie };
  }

  const bancario = entrada.bancarioCents;
  if (!bancario || bancario <= 0) {
    return { ok: false, motivo: "No pagamento misto, informe o valor pago na conta e o valor em dinheiro." };
  }
  return { ok: true, modalidade, bancarioCents: bancario, especieCents: especie };
}

/** Soma do que foi comprovado, para conferência na tela. */
export function totalQuitacao(bancarioCents?: number | null, especieCents?: number | null): number {
  return Number(bancarioCents ?? 0) + Number(especieCents ?? 0);
}

/** Frase curta da quitação: "Dinheiro (Espécie) · R$ 300,00 em dinheiro". */
export function resumoQuitacao(dados: {
  modalidade?: string | null;
  valor_bancario_cents?: number | null;
  valor_especie_cents?: number | null;
}): string {
  const modalidade = dados.modalidade;
  if (!ehModalidade(modalidade)) return "Forma de pagamento não informada";
  const partes: string[] = [modalidadeLabel(modalidade)];
  if (modalidade !== "especie" && dados.valor_bancario_cents) {
    partes.push(`${centsParaBRL(dados.valor_bancario_cents)} na conta`);
  }
  if (modalidade !== "bancario" && dados.valor_especie_cents) {
    partes.push(`${centsParaBRL(dados.valor_especie_cents)} em dinheiro`);
  }
  return partes.join(" · ");
}
