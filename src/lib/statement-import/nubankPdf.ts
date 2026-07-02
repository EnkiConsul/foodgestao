import type { ParsedStatementEntry } from "./types";

// pdfjs worker setup (Vite friendly)
import * as pdfjsLib from "pdfjs-dist";
// @ts-expect-error - vite worker import
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
(pdfjsLib as unknown as { GlobalWorkerOptions: { workerPort: Worker } }).GlobalWorkerOptions.workerPort =
  new PdfWorker();

const MONTHS: Record<string, string> = {
  JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
  JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12",
};

const CREDIT_PATTERNS = [
  /transfer[eê]ncia recebida/i,
  /pix recebido/i,
  /recebimento/i,
  /estorno/i,
  /rendimento/i,
  /cr[eé]dito/i,
];

const CNPJ_RE = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;

function parseNumberBR(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

async function extractText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group items by their y coordinate to reconstruct lines
    type Item = { str: string; x: number; y: number };
    const items: Item[] = content.items
      .map((it) => {
        const anyIt = it as unknown as { str?: string; transform?: number[] };
        if (!anyIt.str || !anyIt.transform) return null;
        return { str: anyIt.str, x: anyIt.transform[4], y: Math.round(anyIt.transform[5]) };
      })
      .filter((v): v is Item => !!v);

    const byRow = new Map<number, Item[]>();
    for (const it of items) {
      const key = Math.round(it.y / 2) * 2; // tolerate 1px jitter
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key)!.push(it);
    }
    const rows = Array.from(byRow.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, arr]) => arr.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    lines.push(...rows);
  }
  return lines.join("\n");
}

async function sha1(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function detectType(title: string): "receita" | "despesa" {
  return CREDIT_PATTERNS.some((re) => re.test(title)) ? "receita" : "despesa";
}

export async function parseNubankStatementPdf(file: File): Promise<ParsedStatementEntry[]> {
  const text = await extractText(file);
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const entries: ParsedStatementEntry[] = [];
  let currentDate: string | null = null;

  // Date header: "18 JUN 2026" or "18 JUN 2026 Total de entradas ..."
  const dateHeaderRe = /^(\d{1,2})\s+([A-ZÇ]{3})\s+(\d{4})\b/i;
  // Movement line: "<title...>   <counterparty...>   <amount>"
  // We split on the last currency-looking token.
  const amountAtEndRe = /([+-]?\s?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dm = line.match(dateHeaderRe);
    if (dm) {
      const dd = dm[1].padStart(2, "0");
      const mm = MONTHS[dm[2].toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
      const yyyy = dm[3];
      if (mm) currentDate = `${yyyy}-${mm}-${dd}`;
      // Continue: the rest of the line may still contain "Total de entradas/saídas" summary, skip amount.
      const rest = line.slice(dm[0].length).trim();
      if (/^total de (entradas|sa[ií]das)/i.test(rest)) continue;
    }

    if (!currentDate) continue;
    const am = line.match(amountAtEndRe);
    if (!am) continue;
    // Skip obvious summary lines
    if (/^total de (entradas|sa[ií]das)/i.test(line)) continue;
    if (/^saldo\b/i.test(line)) continue;

    const amount = parseNumberBR(am[1]);
    if (!amount) continue;

    const head = line.slice(0, am.index!).trim();
    // Heuristic split: first ~40 chars = movement title, rest = counterparty details.
    // Try common titles first.
    const titleMatch = head.match(
      /^(Transfer[eê]ncia recebida pelo Pix|Transfer[eê]ncia enviada pelo Pix|Pix recebido|Pix enviado|Compra no d[eé]bito|Compra no cr[eé]dito|Pagamento de boleto efetuado|Tarifa[^-]*|IOF|Anuidade|Rendimento[^-]*|Estorno[^-]*|Dep[oó]sito[^-]*)/i
    );
    let title = "";
    let counterparty = head;
    if (titleMatch) {
      title = titleMatch[0].trim();
      counterparty = head.slice(titleMatch[0].length).trim();
    } else {
      // Fallback: everything is title
      title = head;
      counterparty = "";
    }

    const cnpj = counterparty.match(CNPJ_RE)?.[0] ?? head.match(CNPJ_RE)?.[0] ?? null;
    const cpf = counterparty.match(CPF_RE)?.[0] ?? head.match(CPF_RE)?.[0] ?? null;
    const doc = cnpj ?? cpf ?? null;

    // Counterparty name: text before the document, stripped of "-" tail
    let cpName: string | null = null;
    if (counterparty) {
      const before = doc ? counterparty.split(doc)[0] : counterparty;
      cpName = before.replace(/[-·•]+\s*$/g, "").trim() || null;
    }

    const type = detectType(title);
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
