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
  /** Categoria informada pelo provedor (ex.: "Digital services"). */
  category?: string | null;
  /** Metadados da fatura do cartão (cardNumber, billId...). */
  creditCardMetadata?: any;
}

/**
 * Lançamentos de fatura de cartão frequentemente chegam sem estabelecimento:
 * no lugar do nome vem o código da operação. Traduzimos para rótulo legível.
 */
const CARD_OPERATION_LABELS: Record<string, string> = {
  CREDITO_A_VISTA: 'Compra no crédito à vista',
  COMPRA_A_VISTA: 'Compra no crédito à vista',
  CREDITO_PARCELADO: 'Compra parcelada',
  COMPRA_PARCELADA: 'Compra parcelada',
  PARCELA: 'Compra parcelada',
  PARCELAMENTO_FATURA: 'Parcelamento da fatura',
  PAGAMENTO_RECEBIDO: 'Pagamento da fatura',
  PAGAMENTO_FATURA: 'Pagamento da fatura',
  TARIFA: 'Tarifa do cartão',
  ANUIDADE: 'Anuidade do cartão',
  ENCARGOS: 'Encargos do cartão',
  JUROS: 'Juros do cartão',
  JUROS_ROTATIVO: 'Juros do rotativo',
  MULTA: 'Multa por atraso',
  IOF: 'IOF',
  ESTORNO: 'Estorno',
  CREDITO_ROTATIVO: 'Crédito rotativo',
  SAQUE: 'Saque com o cartão',
  SAQUE_CREDITO: 'Saque com o cartão',
  TAXAS: 'Taxas do cartão',
  OUTROS: 'Outros lançamentos do cartão',
  OUTROS_CREDITOS: 'Outros créditos do cartão',
};

const CARD_CATEGORY_LABELS: Record<string, string> = {
  'digital services': 'Serviços digitais',
  'online services': 'Serviços online',
  'food and beverages': 'Alimentação',
  'food and drinks': 'Alimentação',
  supermarkets: 'Supermercado',
  groceries: 'Supermercado',
  restaurants: 'Restaurantes',
  transportation: 'Transporte',
  travel: 'Viagem',
  shopping: 'Compras',
  electronics: 'Eletrônicos',
  health: 'Saúde',
  pharmacy: 'Farmácia',
  education: 'Educação',
  entertainment: 'Entretenimento',
  'gas stations': 'Combustível',
  telecommunications: 'Telecomunicações',
  services: 'Serviços',
  taxes: 'Impostos e taxas',
  'bank fees': 'Tarifas bancárias',
  'credit card payment': 'Pagamento de fatura',
};

/**
 * MCC (Merchant Category Code) do estabelecimento, quando o banco não manda o
 * nome. Não identifica a loja, mas diz o ramo da compra.
 */
const MCC_LABELS: Record<string, string> = {
  '4111': 'Transporte urbano',
  '4121': 'Táxi/aplicativo de transporte',
  '4812': 'Telefonia',
  '4814': 'Telecomunicações',
  '4899': 'TV/streaming por assinatura',
  '5411': 'Supermercado',
  '5412': 'Mercearia',
  '5499': 'Alimentos e conveniência',
  '5541': 'Combustível',
  '5542': 'Combustível (autoatendimento)',
  '5812': 'Restaurante',
  '5813': 'Bar',
  '5814': 'Fast-food',
  '5815': 'Mídia digital',
  '5816': 'Jogos digitais',
  '5817': 'Aplicativos',
  '5818': 'Serviços digitais',
  '5912': 'Farmácia',
  '5942': 'Livraria',
  '5968': 'Assinatura recorrente',
  '7372': 'Serviços de software',
  '7997': 'Academia/clube',
  '8062': 'Hospital',
  '8071': 'Laboratório',
  '8099': 'Serviços de saúde',
};

export function mccLabel(mcc: unknown): string | null {
  const digits = String(mcc ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return MCC_LABELS[digits] ?? null;
}

/** true quando o texto é código de operação de cartão (não estabelecimento). */
export function isCardOperationCode(description: string | null | undefined): boolean {
  const value = String(description ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!value) return false;
  if (CARD_OPERATION_LABELS[value]) return true;
  if (!value.includes('_')) return false;
  return /^[A-Z0-9]+(?:[_ ][A-Z0-9]+)*$/.test(value);
}

/**
 * Rótulo legível do código de operação. NÃO é usado como descrição: a descrição
 * gravada é sempre o texto do banco. Serve apenas como informação auxiliar.
 */
export function cardOperationLabel(description: string | null | undefined): string | null {
  const raw = String(description ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const key = raw.toUpperCase();
  if (CARD_OPERATION_LABELS[key]) return CARD_OPERATION_LABELS[key];
  if (!key.includes('_')) return null;
  const humanized = key.replace(/_/g, ' ').toLowerCase();
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}

/** Rótulo auxiliar da categoria do provedor (nunca vira descrição). */
export function cardCategoryLabel(category: string | null | undefined): string | null {
  const cat = String(category ?? '').replace(/\s+/g, ' ').trim();
  if (!cat) return null;
  return CARD_CATEGORY_LABELS[cat.toLowerCase()] ??
    cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
}

/**
 * Descrição de lançamento de cartão = texto do banco, sem reescrita.
 *
 * O sistema já tentou traduzir código de operação, juntar categoria/MCC e casar
 * encargos da fatura por valor — isso divergia do extrato do banco e podia
 * rotular a linha errada. A regra agora é fidelidade: só devolvemos o texto do
 * provedor com os blocos de espaço de alinhamento colapsados.
 */
export function buildCardDescription(t: EnrichInput): string | null {
  const raw = String(t.descriptionRaw ?? t.description ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  if (!isCardOperationCode(raw) && !t.creditCardMetadata) return null;
  return raw;
}


export interface EnrichOptions {
  /** Documentos (CNPJ/CPF) da própria empresa — nunca são contraparte. */
  ownDocuments?: (string | null | undefined)[];
  /** Nomes/razões sociais da própria empresa — nunca são contraparte. */
  ownNames?: (string | null | undefined)[];
}


interface ExternalCounterparty {
  name: string | null;
  document: string | null;
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

function isMerchantPurchase(t: EnrichInput): boolean {
  const merchantName = t.merchant?.businessName ?? t.merchant?.name;
  const merchantDoc = t.merchant?.cnpj;
  if (!merchantName && !merchantDoc) return false;
  const text = normalizeName([t.description, t.descriptionRaw, t.paymentData?.paymentMethod].filter(Boolean).join(' '));
  return /\b(COMPRA|CARTAO|CARTÃO|DEBITO|DÉBITO|CREDITO|CRÉDITO)\b/.test(text);
}

function pickExternalCounterparty(t: EnrichInput, options: EnrichOptions = {}): ExternalCounterparty | null {
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
  const candidates: ExternalCounterparty[] = [
    { name: primary?.name ?? null, document: primary?.documentNumber?.value ?? null },
    { name: t.merchant?.businessName ?? t.merchant?.name ?? null, document: t.merchant?.cnpj ?? null },
  ];
  const ordered = isMerchantPurchase(t) ? [candidates[1], candidates[0]] : candidates;

  const usable = ordered.filter((c) => {
    const name = String(c.name ?? '').trim();
    const doc = digitsOf(c.document);
    if (doc && ownDocs.has(doc)) return false;
    if (name && ownNames.has(normalizeName(name))) return false;
    return !!(name || doc.length >= 11);
  });
  if (usable.length === 0) return null;

  const complete = usable.find((c) => String(c.name ?? '').trim() && digitsOf(c.document).length >= 11);
  const named = complete ?? usable.find((c) => String(c.name ?? '').trim()) ?? usable[0];
  const documented = digitsOf(named.document).length >= 11
    ? named
    : usable.find((c) => digitsOf(c.document).length >= 11) ?? null;

  return {
    name: String(named.name ?? '').trim() || null,
    document: documented?.document ?? named.document ?? null,
  };
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
  return pickExternalCounterparty(t, options)?.name ?? null;
}

/** Nome da contraparte (quando disponível), independente do rótulo do banco. */
export function counterpartyName(t: EnrichInput, options: EnrichOptions = {}): string | null {
  const structured = externalCounterpartyName(t, options);
  if (structured) return structured;

  if (!t.creditCardMetadata || t.merchant || t.paymentData) return null;
  const original = String(t.descriptionRaw ?? t.description ?? '').trim();
  if (!original || isCardOperationCode(original)) return null;
  // Movimento da própria fatura (pagamento, estorno, encerramento de dívida)
  // e encargos (juros, multa, IOF, tarifa, anuidade) não têm fornecedor.
  const text = `${original} ${t.category ?? ''}`;
  if (CARD_BILL_MOVEMENT_RE.test(text)) return null;
  if (CARD_CHARGE_RE.test(text)) return null;

  // Parcela no fim do texto ("Ipremium Store 2/3") não faz parte do nome.
  const withoutInstallment = original
    .replace(/[\s\-–]*(?:parc(?:ela)?\.?\s*)?\d{1,2}\s*\/\s*\d{1,2}\s*$/i, '')
    .trim() || original;

  // Extratos de cartão separam estabelecimento, cidade e país por colunas.
  const columns = withoutInstallment.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
  if (columns.length >= 2 && columns[0].length >= 3) return stripCardAggregator(columns[0]);

  // Fallback para bancos que já colapsaram os espaços: remove país e cidades
  // mais comuns sem inventar um nome quando só há código de operação.
  const withoutCountry = withoutInstallment
    .replace(/\s+(?:de)?(BR|BRA|GB|UK|US|USA|PT|ES|AR|CL|UY)$/i, '')
    .trim();
  const withoutCity = withoutCountry.replace(
    /\s+(GOIANIA|ANAPOLIS|ABADIANIA|VALPARAISO(?:\s+DE)?|APARECIDA(?:\s+DE)?|SAO\s+PAULO|SOUTHAMPTON)$/i,
    '',
  ).trim();
  const name = stripCardAggregator(withoutCity);
  return name.length >= 3 ? name : null;
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
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      // Controles C0/C1 viram espaço (checagem por código evita regex de controle).
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? ' ' : ch;
    })
    .join('')
    .replace(/\uFFFD/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // pontuação solta nas bordas
    .replace(/^[\s\-–—_.,;:|/\\*]+/g, '')
    .replace(/[\s\-–—_,;:|/\\]+$/g, '')
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

  // Lançamento de cartão: mantemos o texto do banco, sem reescrita.
  if (!t.merchant && !t.paymentData) {
    const card = buildCardDescription({ ...t, description: raw });
    if (card) return card;
  }


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
