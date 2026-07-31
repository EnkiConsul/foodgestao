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
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0F1B3D; margin: 0; }
  header { border-bottom: 3px solid #EB6119; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub { font-size: 11px; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  th { background: #0F1B3D; color: #fff; text-transform: uppercase; font-size: 9px; }
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
    <div>Gerado em ${escapeHtml(new Date().toLocaleString("pt-BR"))} · 360°FOOD</div>
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
