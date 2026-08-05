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

export interface EnrichOptions {
  /** Documentos (CNPJ/CPF) da própria empresa — nunca são contraparte. */
  ownDocuments?: (string | null | undefined)[];
  /** Nomes/razões sociais da própria empresa — nunca são contraparte. */
  ownNames?: (string | null | undefined)[];
}

function digitsOf(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** Normaliza para comparação: sem acento, maiúsculo, espaços colapsados. */
function normalizeName(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nome da contraparte EXTERNA: pagador em entradas, recebedor em saídas,
 * descartando o próprio titular (documento ou nome da empresa) antes de
 * considerar o `merchant` — em créditos o Pluggy às vezes traz a própria
 * empresa como merchant.
 */
export function externalCounterpartyName(
  t: EnrichInput,
  options: EnrichOptions = {},
): string | null {
  const ownDocs = new Set(
    (options.ownDocuments ?? []).map(digitsOf).filter((d) => d.length >= 11),
  );
  const ownNames = new Set(
    (options.ownNames ?? [])
      .map((n) => normalizeName(String(n ?? '')))
      .filter((n) => n.length > 2),
  );

  const isEntrada = Number(t.amount ?? 0) >= 0;
  const pd = t.paymentData ?? null;
  const primary = isEntrada ? pd?.payer : pd?.receiver;
  const secondary = isEntrada ? pd?.receiver : pd?.payer;

  const candidates: { name?: unknown; document?: unknown }[] = [
    { name: primary?.name, document: primary?.documentNumber?.value },
    { name: t.merchant?.businessName ?? t.merchant?.name, document: t.merchant?.cnpj },
    { name: secondary?.name, document: secondary?.documentNumber?.value },
  ];

  for (const c of candidates) {
    const name = String(c.name ?? '').trim();
    if (!name) continue;
    const doc = digitsOf(c.document);
    if (doc && ownDocs.has(doc)) continue;
    if (ownNames.has(normalizeName(name))) continue;
    return name;
  }
  return null;
}

/** Nome da contraparte (quando disponível), independente do rótulo do banco. */
export function counterpartyName(t: EnrichInput, options: EnrichOptions = {}): string | null {
  return externalCounterpartyName(t, options);
}

/**
 * Alguns bancos (Santander, por exemplo) cortam a descrição em ~30/60
 * caracteres, deixando o nome da contraparte incompleto
 * ("PIX ENVIADO   BYTEDANCE BRASIL TECNOLOG"). Quando o final da descrição é
 * um prefixo estrito do nome completo, completamos o nome preservando o
 * rótulo da operação.
 */
export function completeTruncatedName(raw: string, fullName: string | null): string {
  const desc = raw.trim();
  const name = (fullName ?? '').trim();
  if (!desc || name.length < 4) return desc;

  const normName = normalizeName(name);
  if (normalizeName(desc).includes(normName)) return desc;

  const tokens = [...desc.matchAll(/\S+/g)];
  // Do maior sufixo para o menor: preferimos completar o trecho mais longo.
  for (let k = tokens.length; k >= 1; k--) {
    const start = tokens[tokens.length - k].index ?? 0;
    const tail = desc.slice(start);
    const normTail = normalizeName(tail);
    if (normTail.length < 6) continue;
    if (normName.length <= normTail.length) continue;
    if (!normName.startsWith(normTail)) continue;
    return `${desc.slice(0, start)}${name}`;
  }
  return desc;
}

/**
 * Sanitiza uma descrição vinda do provedor: remove caracteres de controle,
 * colapsa espaços, corta placeholders inúteis ("-", "null", "sem descricao")
 * e limita o tamanho.
 */
const PLACEHOLDER_RE =
  /^(n\/?a|null|undefined|nil|none|sem\s+descri[cç][aã]o|sem\s+informa[cç][aã]o|desconhecido|\?+|0+)$/i;

export const MAX_DESCRIPTION_LENGTH = 255;

export function sanitizeDescription(raw: string | null | undefined): string {
  const s = String(raw ?? '')
    // remove caracteres de controle (inclui \u0000, \t, \n) e substitutos
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // pontuação solta nas bordas
    .replace(/^[\s\-–—_.,;:|/\\*]+/g, '')
    .replace(/[\s\-–—_,;:|/\\*]+$/g, '')
    .trim();
  if (!s) return '';
  if (PLACEHOLDER_RE.test(s)) return '';
  return s.slice(0, MAX_DESCRIPTION_LENGTH).trim();
}

/**
 * Escolhe a descrição de origem correta: `description` é o campo canônico do
 * Pluggy; só caímos para `descriptionRaw` quando o canônico está vazio,
 * é placeholder, ou é claramente menos informativo (genérico enquanto o raw
 * traz contraparte).
 */
export function pickSourceDescription(t: EnrichInput): string {
  const primary = sanitizeDescription(t.description);
  const fallback = sanitizeDescription(t.descriptionRaw);

  if (!primary) return fallback;
  if (!fallback) return primary;
  if (isGenericDescription(primary) && !isGenericDescription(fallback)) return fallback;
  if (isBankLabelDescription(primary) && !isBankLabelDescription(fallback) && !isGenericDescription(fallback)) {
    return fallback;
  }
  // Mesmo conteúdo, mas o banco truncou o campo canônico.
  const nPrimary = normalizeName(primary);
  const nFallback = normalizeName(fallback);
  if (nFallback.length > nPrimary.length && nFallback.startsWith(nPrimary)) return fallback;
  return primary;
}

/** Descrição final a ser exibida na conciliação (sanitizada e limitada). */
export function buildDescription(t: EnrichInput, options: EnrichOptions = {}): string {
  return sanitizeDescription(buildDescriptionInternal(t, options)) ||
    'Lançamento sem descrição';
}

function buildDescriptionInternal(t: EnrichInput, options: EnrichOptions = {}): string {
  const raw = pickSourceDescription(t);

  if (!isGenericDescription(raw)) {
    // "BANCO SICOOB S.A." não diz nada sobre o pagamento: se houver
    // estabelecimento/contraparte identificado, usamos esse nome.
    if (isBankLabelDescription(raw)) {
      const better = (externalCounterpartyName(t, options) ?? '').trim();
      if (better && !isBankLabelDescription(better)) return better;
    }
    // Nome cortado pelo banco: completa com o nome da contraparte externa.
    return completeTruncatedName(raw, externalCounterpartyName(t, options));
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

  const name = externalCounterpartyName(t, options);
  if (name) return `${label} ${verb} ${name}`;

  const masked = maskDocument(side?.documentNumber?.value);
  if (masked) return `${label} ${verb} ${masked}`;

  const bankHint = side?.routingNumber
    ? ` (banco ${side.routingNumber}${side?.accountNumber ? ` • conta ${side.accountNumber}` : ''})`
    : '';
  return raw ? `${raw}${bankHint}` : `${label} ${verb} contraparte não identificada`;
}
