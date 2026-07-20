import type { ParsedStatementEntry } from "./types";

/**
 * Pure Nubank statement parser — no PDF or worker dependencies.
 * Separated from `nubankPdf.ts` so it can be unit-tested under jsdom
 * without loading the pdfjs worker (`?worker` Vite import).
 */

const MONTHS: Record<string, string> = {
  JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
  JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12",
};

const CNPJ_RE = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const AMOUNT_END_RE = /([+-]?\s?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
const DATE_HEADER_RE = /(\d{1,2})\s+([A-ZÇ]{3})\s+(\d{4})\b/i;

const TITLE_RE = new RegExp(
  [
    "Transfer[eê]ncia recebida pelo Pix",
    "Transfer[eê]ncia enviada pelo Pix",
    "Transfer[eê]ncia Recebida",
    "Transfer[eê]ncia Enviada",
    "Pix recebido",
    "Pix enviado",
    "Compra no d[eé]bito",
    "Compra no cr[eé]dito",
    "Pagamento de boleto efetuado",
    "Pagamento de fatura",
    "Recarga de celular",
    "Tarifa[^-]*",
    "IOF",
    "Anuidade",
    "Rendimento[^-]*",
    "Estorno[^-]*",
    "Dep[oó]sito[^-]*",
    "Resgate[^-]*",
    "Aplica[çc][aã]o[^-]*",
  ].join("|"),
  "i",
);

const NOISE_RES: RegExp[] = [
  /^Extrato gerado dia/i,
  /^\d+\s+de\s+\d+\s*$/i,
  /^Rafael\b/i,
  /^CPF\b/i,
  /^Ag[eê]ncia\s+\d+\s+Conta/i,
  /^Movimenta[cç][oõ]es\s*$/i,
  /^VALORES EM R\$/i,
  /^Saldo inicial/i,
  /^Saldo final/i,
  /^Rendimento l[ií]quido/i,
  /^Tem alguma d[uú]vida/i,
  /^Caso a solu[cç][aã]o/i,
  /^Atendimento/i,
  /nubank\.com\.br/i,
];

export function parseNumberBR(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeMonthKey(m: string): string | null {
  const key = m.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return MONTHS[key] ?? null;
}

export function isNoise(line: string): boolean {
  return NOISE_RES.some((re) => re.test(line));
}

export async function sha1(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Converts extracted text lines into structured entries.
 *
 * Robust to:
 *  - date header sharing a row with the day's "Total de entradas/saídas"
 *  - multi-line counterparty details (indented continuation rows)
 *  - repeated page headers/footers
 *  - summary rows at the top of the document (Saldo inicial/final, Rendimento)
 */
export async function parseLinesToEntries(lines: string[]): Promise<ParsedStatementEntry[]> {
  const entries: ParsedStatementEntry[] = [];
  let currentDate: string | null = null;
  let currentSign: "receita" | "despesa" | null = null;
  let sawFirstDate = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (isNoise(line)) continue;

    const dm = line.match(DATE_HEADER_RE);
    if (dm && (dm.index === 0 || /^\s*$/.test(line.slice(0, dm.index!)))) {
      const dd = dm[1].padStart(2, "0");
      const mm = normalizeMonthKey(dm[2]);
      const yyyy = dm[3];
      if (mm) {
        currentDate = `${yyyy}-${mm}-${dd}`;
        sawFirstDate = true;
        const rest = line.slice(dm[0].length).trim();
        if (/^total de entradas/i.test(rest)) currentSign = "receita";
        else if (/^total de sa[ií]das/i.test(rest)) currentSign = "despesa";
        continue;
      }
    }

    if (sawFirstDate && /^total de entradas\b/i.test(line)) {
      currentSign = "receita";
      continue;
    }
    if (sawFirstDate && /^total de sa[ií]das\b/i.test(line)) {
      currentSign = "despesa";
      continue;
    }
    if (/^saldo\b/i.test(line)) continue;

    if (!currentDate) continue;

    const am = line.match(AMOUNT_END_RE);
    if (!am) {
      const last = entries[entries.length - 1];
      if (last && last.date === currentDate) {
        const cnpj = line.match(CNPJ_RE)?.[0] ?? null;
        const cpf = line.match(CPF_RE)?.[0] ?? null;
        const doc = cnpj ?? cpf ?? null;
        if (doc && !last.counterparty_document) last.counterparty_document = doc;
      }
      continue;
    }

    const rawAmount = am[1].trim();
    const signed = parseNumberBR(rawAmount);
    if (!signed) continue;

    // Sign resolution: explicit +/- on the line wins over the section header.
    const explicitSign: "receita" | "despesa" | null =
      rawAmount.startsWith("-") ? "despesa"
      : rawAmount.startsWith("+") ? "receita"
      : null;
    const type = explicitSign ?? currentSign;
    if (!type) continue;

    // Invariant: amount is always a positive magnitude in reais.
    const amount = Math.abs(signed);

    const head = line.slice(0, am.index!).trim();
    if (!head) continue;

    const titleMatch = head.match(TITLE_RE);
    let title = "";
    let counterparty = head;
    if (titleMatch) {
      title = titleMatch[0].trim();
      counterparty = head.slice(titleMatch.index! + titleMatch[0].length).trim();
    } else {
      title = head;
      counterparty = "";
    }

    const cnpj = counterparty.match(CNPJ_RE)?.[0] ?? head.match(CNPJ_RE)?.[0] ?? null;
    const cpf = counterparty.match(CPF_RE)?.[0] ?? head.match(CPF_RE)?.[0] ?? null;
    const doc = cnpj ?? cpf ?? null;

    let cpName: string | null = null;
    if (counterparty) {
      const before = doc ? counterparty.split(doc)[0] : counterparty;
      cpName = before.replace(/[-·•]+\s*$/g, "").trim() || null;
      if (cpName) cpName = cpName.replace(/\s*Ag[eê]ncia\s*:.*$/i, "").trim() || null;
    }

    const description = [title, cpName].filter(Boolean).join(" - ").trim() || title || "Lançamento";
    const import_hash = await sha1(`${currentDate}|${type}|${amount.toFixed(2)}|${description.toUpperCase()}`);

    entries.push({
      date: currentDate,
      description,
      amount,
      transaction_type: type,
      counterparty_document: doc,
      counterparty_name: cpName,
      import_hash,
    });
  }

  return entries;
}
