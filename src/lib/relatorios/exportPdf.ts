import { format } from "date-fns";

export function exportFluxoCaixaPdf(activeRange: { from: Date; to: Date }, tableElementId = "fluxo-caixa-table") {
  const tableEl = document.getElementById(tableElementId);
  if (!tableEl) return;
  const periodLabel = `${format(activeRange.from, "dd/MM/yyyy")} a ${format(activeRange.to, "dd/MM/yyyy")}`;
  const pdfWindow = window.open("", "_blank");
  if (!pdfWindow) return;
  pdfWindow.document.write(`
    <!DOCTYPE html><html><head><title>Fluxo de Caixa ${periodLabel}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 10px; padding: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 4px 6px; border: 1px solid #ddd; text-align: right; white-space: nowrap; }
      th { background: #f5f5f5; }
      td:first-child, th:first-child { text-align: left; }
      .receita { color: #16a34a; } .despesa { color: #dc2626; } .saldo-pos { color: #2563eb; } .saldo-neg { color: #dc2626; }
      .header-row { background: #f0f0f0; font-weight: bold; }
      .cat-row td:first-child { padding-left: 24px; }
      @page { size: landscape; margin: 10mm; }
      @media print {
        body { padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      }
    </style></head><body>
    <h2>Fluxo de Caixa — ${periodLabel}</h2>
    <p style="font-size:11px;color:#666;margin-bottom:8px;">Exportado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
    ${tableEl.outerHTML}
    </body></html>
  `);
  pdfWindow.document.close();
  setTimeout(() => pdfWindow.print(), 300);
}
