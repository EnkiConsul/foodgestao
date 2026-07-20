import type { ParsedStatementEntry } from "./types";

// pdfjs worker setup (Vite friendly)
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
(pdfjsLib as unknown as { GlobalWorkerOptions: { workerPort: Worker } }).GlobalWorkerOptions.workerPort =
  new PdfWorker();

const MONTHS: Record<string, string> = {
  JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
  JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12",
};

const CNPJ_RE = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
// A number in BR format at the end of a line: "1.234,56" or "1234,56" — may have leading +/-.
const AMOUNT_END_RE = /([+-]?\s?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
// Date header can appear anywhere at the beginning of a row: "05 JUN 2026"
const DATE_HEADER_RE = /(\d{1,2})\s+([A-ZÇ]{3})\s+(\d{4})\b/i;

// Titles Nubank uses for individual movements. The rest of the line is the counterparty.
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

// Rows that are noise (header, footer, page summary) and must be ignored.
const NOISE_RES: RegExp[] = [
  /^Extrato gerado dia/i,
  /^\d+\s+de\s+\d+\s*$/i, // "1 de 14"
  /^Rafael\b/i, // account holder name row (dynamic in real usage; kept generic below too)
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

function parseNumberBR(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

async function extractLines(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const allLines: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    type Item = { str: string; x: number; y: number };
    const items: Item[] = content.items
      .map((it) => {
        const anyIt = it as unknown as { str?: string; transform?: number[] };
        if (anyIt.str == null || !anyIt.transform) return null;
        const s = anyIt.str;
        if (!s.trim()) return null;
        return { str: s, x: anyIt.transform[4], y: anyIt.transform[5] };
      })
      .filter((v): v is Item => !!v);

    // Sort top→bottom, then left→right
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));

    // Group into rows using a Y tolerance (Nubank uses ~10px line height)
    const rows: Item[][] = [];
    const TOL = 4;
    for (const it of items) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last[0].y - it.y) <= TOL) {
        last.push(it);
      } else {
        rows.push([it]);
      }
    }

    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      // Join with gap-aware spacing so columns stay separated
      let text = "";
      let prevEndX = -Infinity;
      for (const it of row) {
        if (text) {
          const gap = it.x - prevEndX;
          text += gap > 6 ? "   " : (text.endsWith(" ") ? "" : " ");
        }
        text += it.str;
        prevEndX = it.x + it.str.length * 4; // rough
      }
      const cleaned = text.replace(/\s+/g, " ").trim();
      if (cleaned) allLines.push(cleaned);
    }
  }

  return allLines;
}

export async function sha1(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeMonthKey(m: string): string | null {
  const key = m.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return MONTHS[key] ?? null;
}

export function isNoise(line: string): boolean {
  return NOISE_RES.some((re) => re.test(line));
}

export { parseNumberBR };


/**
 * Parses a Nubank checking-account PDF statement into individual movement entries.
 *
 * Robust to:
 *  - date header sharing a row with the day's "Total de entradas/saídas"
 *  - multi-line counterparty details (indented continuation rows)
 *  - repeated page headers/footers
 *  - summary rows at the top of the document (Saldo inicial/final, Rendimento)
 *
 * Sign (receita/despesa) is inferred from the active section: each day starts
 * with "Total de entradas" then "Total de saídas". We track the current section
 * to classify subsequent movement lines correctly, regardless of their title.
 */
export async function parseNubankStatementPdf(file: File): Promise<ParsedStatementEntry[]> {
  const lines = await extractLines(file);
  return parseLinesToEntries(lines);
}

/**
 * Pure parser: converts extracted text lines into structured entries.
 * Extracted from `parseNubankStatementPdf` so it can be unit-tested without a real PDF.
 */
export async function parseLinesToEntries(lines: string[]): Promise<ParsedStatementEntry[]> {


  const entries: ParsedStatementEntry[] = [];
  let currentDate: string | null = null;
  let currentSign: "receita" | "despesa" | null = null;
  // Whether we've seen at least one date header — before that, "Total de entradas/saídas"
  // rows are part of the top summary and must not switch our sign state.
  let sawFirstDate = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (isNoise(line)) continue;

    // 1) Date header — may appear alone or followed by "Total de entradas ..."
    const dm = line.match(DATE_HEADER_RE);
    if (dm && (dm.index === 0 || /^\s*$/.test(line.slice(0, dm.index!)))) {
      const dd = dm[1].padStart(2, "0");
      const mm = normalizeMonthKey(dm[2]);
      const yyyy = dm[3];
      if (mm) {
        currentDate = `${yyyy}-${mm}-${dd}`;
        sawFirstDate = true;
        // The remainder of this row is typically the day's "Total de entradas" summary.
        const rest = line.slice(dm[0].length).trim();
        if (/^total de entradas/i.test(rest)) currentSign = "receita";
        else if (/^total de sa[ií]das/i.test(rest)) currentSign = "despesa";
        continue;
      }
    }

    // 2) Section markers within a day
    if (sawFirstDate && /^total de entradas\b/i.test(line)) {
      currentSign = "receita";
      continue;
    }
    if (sawFirstDate && /^total de sa[ií]das\b/i.test(line)) {
      currentSign = "despesa";
      continue;
    }
    // "Saldo do dia" (some layouts include it) — informational, skip
    if (/^saldo\b/i.test(line)) continue;

    if (!currentDate || !currentSign) continue;

    // 3) Movement line: must end with an amount
    const am = line.match(AMOUNT_END_RE);
    if (!am) {
      // Continuation row with counterparty details — append to last entry on same day.
      const last = entries[entries.length - 1];
      if (last && last.date === currentDate) {
        // Try to extract a document from the continuation
        const cnpj = line.match(CNPJ_RE)?.[0] ?? null;
        const cpf = line.match(CPF_RE)?.[0] ?? null;
        const doc = cnpj ?? cpf ?? null;
        if (doc && !last.counterparty_document) last.counterparty_document = doc;
        // Do not modify description with noisy trailing agency/account details.
      }
      continue;
    }

    const amount = parseNumberBR(am[1]);
    if (!amount) continue;

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
      // Trim trailing agency/account fragments if they slipped in
      if (cpName) cpName = cpName.replace(/\s*Ag[eê]ncia\s*:.*$/i, "").trim() || null;
    }

    const description = [title, cpName].filter(Boolean).join(" - ").trim() || title || "Lançamento";
    const type = currentSign;
    // Keep hash stable with the previous parser version so re-imports of the
    // same PDF correctly dedupe against already-imported entries.
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
