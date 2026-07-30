/**
 * Enriquecimento de descrições de transações do Open Finance.
 *
 * Bancos frequentemente devolvem rótulos genéricos ("TRANSF ENVIADA PIX",
 * "PIX RECEBIDO", "TED"), sem qualquer identificação da contraparte.
 * Aqui montamos uma descrição legível usando paymentData / merchant e,
 * como último recurso, o documento mascarado da contraparte.
 */

// Rótulos genéricos: qualquer combinação de transf/pix/ted/doc + enviada/recebida.
const GENERIC_RE =
  /^\s*(trans[a-z]*\.?|transfer[eê]ncia|pix|ted|doc|env(io|iada|iado)?|receb(ido|ida)?|pagamento|pgto)[\s.\-/]*(enviad[ao]|recebid[ao]|pix|ted|doc|para|de)?[\s.\-/]*(pix|ted|doc)?\s*$/i;

export function isGenericDescription(raw: string | null | undefined): boolean {
  const s = (raw ?? '').trim();
  if (!s) return true;
  return GENERIC_RE.test(s);
}

/**
 * Alguns bancos devolvem apenas o nome de uma instituição financeira como
 * descrição (ex.: "BANCO SICOOB S.A."), sem qualquer referência ao
 * estabelecimento real da compra/pagamento.
 */
const BANK_LABEL_RE =
  /^\s*(banco|bco|caixa\s+econ[oô]mica|nu\s*pagamentos|coop(erativa)?\s+de\s+cr[eé]dito)\b.*$/i;

export function isBankLabelDescription(raw: string | null | undefined): boolean {
  const s = (raw ?? '').trim();
  if (!s) return false;
  return BANK_LABEL_RE.test(s);
}


/** Mascara CPF/CNPJ preservando apenas o miolo. */
export function maskDocument(doc: string | null | undefined): string | null {
  const digits = (doc ?? '').replace(/\D/g, '');
  if (digits.length === 11) {
    return `CPF ***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  }
  if (digits.length === 14) {
    return `CNPJ **.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-**`;
  }
  return null;
}

export interface EnrichInput {
  description?: string | null;
  descriptionRaw?: string | null;
  amount?: number | null;
  paymentData?: any;
  merchant?: any;
}

/** Nome da contraparte (quando disponível), independente do rótulo do banco. */
export function counterpartyName(t: EnrichInput): string | null {
  const amt = Number(t.amount ?? 0);
  const pd = t.paymentData ?? null;
  const side = amt < 0 ? pd?.receiver : pd?.payer;
  const name: string | null = side?.name ?? null;
  if (name && name.trim()) return name.trim();
  const merchantName: string | null =
    t.merchant?.name ?? t.merchant?.businessName ?? null;
  if (merchantName && merchantName.trim()) return merchantName.trim();
  return null;
}

/** Descrição final a ser exibida na conciliação. */
export function buildDescription(t: EnrichInput): string {
  const raw = (t.description ?? t.descriptionRaw ?? '').trim();
  if (!isGenericDescription(raw)) {
    // "BANCO SICOOB S.A." não diz nada sobre o pagamento: se houver
    // estabelecimento/contraparte identificado, usamos esse nome.
    if (isBankLabelDescription(raw)) {
      const merchantName: string | null =
        t.merchant?.businessName ?? t.merchant?.name ?? null;
      const better = (merchantName ?? counterpartyName(t) ?? '').trim();
      if (better && !isBankLabelDescription(better)) return better;
    }
    return raw;
  }

  const amt = Number(t.amount ?? 0);
  const pd = t.paymentData ?? null;
  const side = amt < 0 ? pd?.receiver : pd?.payer;
  const method: string | null = pd?.paymentMethod ?? null;

  const label =
    method === 'PIX' || /pix/i.test(raw)
      ? 'Pix'
      : method
        ? method
        : /ted/i.test(raw)
          ? 'TED'
          : /doc/i.test(raw)
            ? 'DOC'
            : 'Transferência';
  const verb = amt < 0 ? 'enviado para' : 'recebido de';

  const name = counterpartyName(t);
  if (name) return `${label} ${verb} ${name}`;

  const masked = maskDocument(side?.documentNumber?.value);
  if (masked) return `${label} ${verb} ${masked}`;

  const bankHint = side?.routingNumber
    ? ` (banco ${side.routingNumber}${side?.accountNumber ? ` • conta ${side.accountNumber}` : ''})`
    : '';
  return raw ? `${raw}${bankHint}` : `${label} ${verb} contraparte não identificada`;
}
