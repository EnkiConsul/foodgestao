/**
 * Utilitários de exportação do Relatório de Fluxo de Caixa (CSV e PDF via impressão).
 * Puro (sem React/Supabase) para ser testável isoladamente.
 */

export type CsvCell = string | number | null | undefined;

const BRL = (v: number) => v.toFixed(2).replace(".", ",");

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return BRL(value);
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Monta o conteúdo CSV (separador ";" — padrão Excel pt-BR). */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

/** Dispara o download de um CSV com BOM UTF-8 (compatível com Excel). */
export function downloadCsv(filename: string, rows: CsvCell[][]) {
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PrintableTable = {
  title: string;
  subtitle?: string;
  head: string[];
  /** cada célula: texto já formatado; use `align`/`cls` por índice de coluna */
  body: { cells: string[]; cls?: string }[];
  aligns?: ("left" | "right")[];
  /** rodapé com observações (filtros aplicados etc.) */
  notes?: string[];
  landscape?: boolean;
};

/** Gera o HTML imprimível (o usuário escolhe "Salvar como PDF" na caixa de impressão). */
export function buildPrintableHtml(t: PrintableTable): string {
  const aligns = t.aligns ?? [];
  const th = t.head
    .map((h, i) => `<th class="${aligns[i] === "right" ? "right" : "left"}">${escapeHtml(h)}</th>`)
    .join("");
  const tr = t.body
    .map(
      (row) =>
        `<tr class="${row.cls ?? ""}">${row.cells
          .map((c, i) => `<td class="${aligns[i] === "right" ? "right" : "left"}">${escapeHtml(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>${escapeHtml(t.title)}</title>
<style>
  @page { size: A4 ${t.landscape ? "landscape" : "portrait"}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0B0F0D; margin: 0; }
  header { border-bottom: 3px solid #02AB3D; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub { font-size: 11px; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  th { background: #0B0F0D; color: #fff; text-transform: uppercase; font-size: 9px; }
  .right { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .left { text-align: left; }
  tr.group td { background: #f3f4f6; font-weight: 700; }
  tr.saldo td { background: #fdece2; font-weight: 700; }
  footer { margin-top: 10px; font-size: 9px; color: #666; }
  footer div { margin-top: 2px; }
</style></head>
<body>
  <header>
    <h1>${escapeHtml(t.title)}</h1>
    ${t.subtitle ? `<div class="sub">${escapeHtml(t.subtitle)}</div>` : ""}
  </header>
  <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
  <footer>${(t.notes ?? []).map((n) => `<div>${escapeHtml(n)}</div>`).join("")}
    <div>Gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))} · Aveto 360</div>
  </footer>
</body></html>`;
}

/** Abre uma janela com o HTML imprimível e dispara a caixa de impressão (Salvar como PDF). */
export function openPrintable(t: PrintableTable): boolean {
  const win = window.open("", "_blank", "width=1024,height=768");
  if (!win) return false;
  win.document.write(buildPrintableHtml(t));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
  return true;
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

export type XlsxRowKind = "normal" | "group" | "saldo" | "total";

export type XlsxSheet = {
  /** nome da aba (máx. 31 chars, sem : \ / ? * [ ]) */
  name: string;
  title: string;
  subtitle?: string;
  head: string[];
  rows: { cells: (string | number | null)[]; kind?: XlsxRowKind; indent?: number }[];
  /** índices das colunas numéricas (formato contábil BRL) */
  numericColumns: number[];
  colWidths?: number[];
  notes?: string[];
};

const NUM_FMT = '#,##0.00;[Red]-#,##0.00;"–"';
const INK = "FF0B0F0D";
const BRAND = "FF02AB3D";

export function safeSheetName(name: string): string {
  return (name.replace(/[:\\/?*[\]]/g, " ").trim() || "Planilha").slice(0, 31);
}

/** Gera e baixa um arquivo .xlsx replicando o layout do relatório. */
export async function downloadXlsx(filename: string, sheets: XlsxSheet[]) {
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aveto 360";
  wb.created = new Date();

  for (const s of sheets) {
    const ws = wb.addWorksheet(safeSheetName(s.name), {
      views: [{ state: "frozen", xSplit: 1, ySplit: 4 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const lastCol = Math.max(s.head.length, 1);
    const colLetter = (n: number) => {
      let out = "";
      while (n > 0) {
        const r = (n - 1) % 26;
        out = String.fromCharCode(65 + r) + out;
        n = Math.floor((n - 1) / 26);
      }
      return out;
    };
    const span = (row: number) => `A${row}:${colLetter(lastCol)}${row}`;

    // Título
    ws.mergeCells(span(1));
    const titleCell = ws.getCell("A1");
    titleCell.value = s.title;
    titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: NAVY } };

    ws.mergeCells(span(2));
    const subCell = ws.getCell("A2");
    subCell.value = s.subtitle ?? "";
    subCell.font = { name: "Arial", size: 10, color: { argb: "FF555555" } };

    ws.getRow(3).height = 6;

    // Cabeçalho
    const headerRow = ws.getRow(4);
    headerRow.values = s.head;
    headerRow.eachCell((cell, col) => {
      cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: ORANGE } } };
    });
    headerRow.height = 20;

    const numeric = new Set(s.numericColumns);

    for (const r of s.rows) {
      const row = ws.addRow(r.cells.map((c) => (c === null ? "" : c)));
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const isNum = numeric.has(col - 1);
        cell.font = {
          name: "Arial",
          size: 9,
          bold: r.kind === "group" || r.kind === "saldo" || r.kind === "total",
          color: { argb: NAVY },
        };
        cell.alignment = {
          horizontal: isNum ? "right" : "left",
          indent: col === 1 ? (r.indent ?? 0) : undefined,
        };
        if (isNum) cell.numFmt = NUM_FMT;
        if (r.kind === "group") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
        } else if (r.kind === "saldo" || r.kind === "total") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECE2" } };
        }
        cell.border = { bottom: { style: "hair", color: { argb: "FFE5E7EB" } } };
      });
    }

    for (const n of s.notes ?? []) {
      const row = ws.addRow([n]);
      row.getCell(1).font = { name: "Arial", size: 8, italic: true, color: { argb: "FF666666" } };
    }
    const gen = ws.addRow([`Gerado em ${new Date().toLocaleString("pt-BR")} · Aveto 360`]);
    gen.getCell(1).font = { name: "Arial", size: 8, italic: true, color: { argb: "FF666666" } };

    s.head.forEach((h, i) => {
      ws.getColumn(i + 1).width = s.colWidths?.[i] ?? (i === 0 ? 42 : Math.max(12, h.length + 4));
    });

    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: lastCol } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
