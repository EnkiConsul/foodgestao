/**
 * Identificação da contraparte (nome + CNPJ/CPF) em lançamentos importados
 * via Open Finance.
 *
 * A Pluggy devolve `paymentData.payer` / `paymentData.receiver` com `name` e
 * `documentNumber` em PIX/TED/boleto, e `merchant` em compras de cartão.
 *
 * Regras:
 * - Entradas: a contraparte é o pagador; saídas: o recebedor.
 * - O documento da própria empresa (dono da conta) é descartado.
 * - Débitos internos (tarifas, IOF, juros, anuidade, rendimento) não possuem
 *   contraparte externa: nesses casos a contraparte é o próprio banco.
 */

import { toProperName } from "@/lib/text/properName";

export type DocumentType = "CNPJ" | "CPF";

export interface CounterpartyRow {
  description?: string | null;
  category_pluggy?: string | null;
  amount: number;
  raw?: unknown;
}

export interface Counterparty {
  name: string | null;
  document: string | null;
  documentType: DocumentType | null;
  /** true quando o lançamento é uma cobrança/crédito do próprio banco. */
  internal: boolean;
}

export const EMPTY_COUNTERPARTY: Counterparty = {
  name: null,
  document: null,
  documentType: null,
  internal: false,
};

/** Apenas dígitos — usado para comparar e casar documentos. */
export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Formata CPF/CNPJ a partir de qualquer entrada; devolve o original se não bater. */
export function formatDocument(value: string | null | undefined): string | null {
  const d = onlyDigits(value);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return value ? String(value) : null;
}

function documentTypeOf(value: string | null | undefined): DocumentType | null {
  const d = onlyDigits(value);
  if (d.length === 11) return "CPF";
  if (d.length === 14) return "CNPJ";
  return null;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cobranças e créditos internos do banco: não há pagador/recebedor externo,
 * a contraparte é a própria instituição financeira.
 */
const INTERNAL_RE =
  /(TARIFA|CESTA|PACOTE\s+DE\s+SERVICO|MANUTENCAO\s+DE\s+CONTA|ANUIDADE|\bIOF\b|\bIR\b\s*SOBRE|IMPOSTO\s+SOBRE\s+OPERACOES|JUROS|ENCARGO|MULTA\s+POR\s+ATRASO|CHEQUE\s+ESPECIAL|LIMITE\s+ESPECIAL|RENDIMENT|REMUNERACAO\s+DE\s+SALDO|CREDITO\s+DE\s+JUROS|CUSTODIA|SEGURO\s+CONTA|ESTORNO\s+DE\s+TARIFA|TAXA\s+DE|TED\s+TARIFA|DEBITO\s+DE\s+TARIFA|MENSALIDADE)/;

/** true quando a descrição indica uma cobrança/crédito do próprio banco. */
export function isInternalBankCharge(row: CounterpartyRow): boolean {
  const text = normalize([row.description ?? "", row.category_pluggy ?? ""].join(" "));
  return INTERNAL_RE.test(text);
}

interface RawSide {
  name?: string | null;
  documentNumber?: { type?: string | null; value?: string | null } | null;
}

function readSide(raw: unknown, key: "payer" | "receiver"): RawSide | null {
  if (!raw || typeof raw !== "object") return null;
  const pd = (raw as { paymentData?: unknown }).paymentData;
  if (!pd || typeof pd !== "object") return null;
  const side = (pd as Record<string, unknown>)[key];
  return side && typeof side === "object" ? (side as RawSide) : null;
}

function readMerchant(raw: unknown): { name: string | null; document: string | null } {
  if (!raw || typeof raw !== "object") return { name: null, document: null };
  const m = (raw as { merchant?: unknown }).merchant;
  if (!m || typeof m !== "object") return { name: null, document: null };
  const merchant = m as { name?: string | null; businessName?: string | null; cnpj?: string | null };
  const name = (merchant.businessName ?? merchant.name ?? null)?.trim() || null;
  return { name, document: merchant.cnpj ?? null };
}

function fromSide(side: RawSide | null): { name: string | null; document: string | null } {
  if (!side) return { name: null, document: null };
  return {
    name: (side.name ?? "").trim() || null,
    document: side.documentNumber?.value ?? null,
  };
}

export interface ExtractOptions {
  /** Documentos da própria empresa/conta, para descartar o próprio lado. */
  ownDocuments?: (string | null | undefined)[];
}

/**
 * Alguns bancos não devolvem `payer.name` / `receiver.name`, mas a descrição
 * já traz a contraparte ("Pix enviado para ANTONIA BARROS RODRIGUES",
 * "Pagamento Boleto STONE IP S.A."). Extraímos esse trecho como último recurso.
 */
const DESC_AFTER_RE =
  /(?:enviad[ao]s?\s+(?:para|a)|recebid[ao]s?\s+(?:de|do|da)|pago\s+(?:para|a)|pagamento\s+(?:de\s+)?boleto|boleto|compra\s+(?:em|no|na)|para|de)\s+(.+)$/i;

const OP_LABEL_RE =
  /^\s*(pix|ted|doc|tev|transf(er[eê]ncia)?|pagamento|pgto|boleto|d[eé]bito|cr[eé]dito|compra|cart[aã]o)\b[\s.:\-/]*/i;

export function nameFromDescription(description: string | null | undefined): string | null {
  let s = String(description ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;

  const m = DESC_AFTER_RE.exec(s);
  if (m?.[1]) s = m[1].trim();
  else {
    // Sem preposição: remove apenas o rótulo da operação no início.
    const stripped = s.replace(OP_LABEL_RE, "").trim();
    if (!stripped || stripped === s) return null;
    s = stripped;
  }

  // Remove rótulos residuais ("Pix ACME LTDA") e ruído final (preserva "S.A.").
  s = s.replace(OP_LABEL_RE, "").replace(/[\s\-–—_,;:|/]+$/g, "").trim();

  // Descarta sobras numéricas / documentos / termos genéricos.
  if (s.length < 3) return null;
  if (!/[a-zA-ZÀ-ÿ]{3}/.test(s)) return null;
  if (onlyDigits(s).length >= 11 && !/[a-zA-ZÀ-ÿ]{3}/.test(s.replace(/\d/g, ""))) return null;
  if (/^(contraparte|terceiros?|n[aã]o\s+identificad)/i.test(s)) return null;
  // Sobrou apenas o complemento da operação ("enviada", "recebido").
  if (/^(enviad|recebid|efetuad|realizad|pag[oa]|pgto|debitad|creditad)\S*$/i.test(s)) return null;


  return s.slice(0, 120);
}

/** Extrai nome + documento da contraparte de um lançamento importado. */
export function extractCounterparty(
  row: CounterpartyRow,
  options: ExtractOptions = {},
): Counterparty {
  const own = new Set(
    (options.ownDocuments ?? []).map((d) => onlyDigits(d)).filter((d) => d.length >= 11),
  );

  const isEntrada = Number(row.amount ?? 0) >= 0;
  const primary = fromSide(readSide(row.raw, isEntrada ? "payer" : "receiver"));
  const secondary = fromSide(readSide(row.raw, isEntrada ? "receiver" : "payer"));
  const merchant = readMerchant(row.raw);

  const candidates = [primary, merchant, secondary].filter(
    (c) => c.name || onlyDigits(c.document).length >= 11,
  );

  const external = candidates.find((c) => {
    const d = onlyDigits(c.document);
    return !(d && own.has(d));
  });

  if (external && (external.name || onlyDigits(external.document).length >= 11)) {
    return {
      // Último recurso: nome dentro da descrição do extrato.
      name: toProperName(external.name ?? nameFromDescription(row.description)) || null,
      document: formatDocument(external.document),
      documentType: documentTypeOf(external.document),
      internal: false,
    };
  }

  // Sem contraparte externa: tarifas/juros/rendimentos são do próprio banco.
  if (isInternalBankCharge(row)) {
    return { ...EMPTY_COUNTERPARTY, internal: true };
  }

  return EMPTY_COUNTERPARTY;
}

/** Rótulo curto para exibir na fila de conciliação. */
export function counterpartyLabel(cp: Counterparty): string | null {
  if (cp.name && cp.document) return `${cp.name} • ${cp.documentType ?? ""} ${cp.document}`.trim();
  if (cp.name) return cp.name;
  if (cp.document) return `Contraparte não identificada • ${cp.documentType ?? "Documento"} ${cp.document}`;
  return null;
}


export interface BankOpt {
  id: string;
  name: string;
  tax_id?: string | null;
}

/**
 * Casa o nome do conector da Pluggy ("Banco do Brasil Empresas") com o banco
 * cadastrado ("Banco do Brasil"). Escolhe o nome mais longo que casa, para
 * evitar falso positivo entre "Inter" e "Banco Inter".
 */
export function matchBankByConnector(
  connectorName: string | null | undefined,
  banks: BankOpt[],
): BankOpt | null {
  const target = normalize(connectorName ?? "");
  if (!target) return null;
  let best: BankOpt | null = null;
  for (const b of banks) {
    const name = normalize(b.name ?? "");
    if (!name) continue;
    if (target.includes(name) && (!best || name.length > normalize(best.name).length)) best = b;
  }
  return best;
}
