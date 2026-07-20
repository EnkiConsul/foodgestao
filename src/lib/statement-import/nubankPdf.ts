import type { ParsedStatementEntry } from "./types";
import { parseLinesToEntries } from "./nubankParser";

// Re-export pure helpers so consumers keep working after the split.
export { parseNumberBR, normalizeMonthKey, isNoise, sha1, parseLinesToEntries } from "./nubankParser";

// pdfjs worker setup (Vite friendly)
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
(pdfjsLib as unknown as { GlobalWorkerOptions: { workerPort: Worker } }).GlobalWorkerOptions.workerPort =
  new PdfWorker();

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
      let text = "";
      let prevEndX = -Infinity;
      for (const it of row) {
        if (text) {
          const gap = it.x - prevEndX;
          text += gap > 6 ? "   " : (text.endsWith(" ") ? "" : " ");
        }
        text += it.str;
        prevEndX = it.x + it.str.length * 4;
      }
      const cleaned = text.replace(/\s+/g, " ").trim();
      if (cleaned) allLines.push(cleaned);
    }
  }

  return allLines;
}

/**
 * Parses a Nubank checking-account PDF statement into individual movement entries.
 */
export async function parseNubankStatementPdf(file: File): Promise<ParsedStatementEntry[]> {
  const lines = await extractLines(file);
  return parseLinesToEntries(lines);
}
