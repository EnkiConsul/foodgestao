/**
 * CSV do portal do colaborador.
 *
 * Mesmo padrão dos exports do administrativo: separador ";" e BOM UTF-8,
 * para o Excel em português abrir sem bagunçar acentos.
 */

const celula = (v: string | number | null | undefined) =>
  `"${String(v ?? "").replace(/"/g, '""')}"`;

export function montarCsv(headers: string[], linhas: (string | number | null | undefined)[][]): string {
  return [headers, ...linhas].map((l) => l.map(celula).join(";")).join("\n");
}

export function baixarCsv(
  nomeArquivo: string,
  headers: string[],
  linhas: (string | number | null | undefined)[][],
): void {
  const blob = new Blob(["\ufeff" + montarCsv(headers, linhas)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
