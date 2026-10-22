// Datas do desligamento — puro, sem aliases: usado pelo navegador e pelo servidor.

/** Converte 'YYYY-MM-DD' em Date local (sem drift de fuso). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Prazo legal (Art. 477, § 6º, CLT): 10 dias corridos após o término. */
export function prazoLegalRescisao(dataDesligamento: string): string {
  const d = parseDateOnly(dataDesligamento);
  d.setDate(d.getDate() + 10);
  return toDateOnly(d);
}

/**
 * Sugestão para pagamento por TED/compensação bancária: se o prazo legal
 * cair em sábado, domingo ou feriado da unidade, antecipa para o dia útil
 * anterior. Pix e espécie podem ser pagos no próprio prazo legal.
 */
export function prazoPagamentoRescisao(
  dataDesligamento: string,
  feriados: ReadonlySet<string> = new Set(),
): string {
  const d = parseDateOnly(prazoLegalRescisao(dataDesligamento));
  while (d.getDay() === 0 || d.getDay() === 6 || feriados.has(toDateOnly(d))) {
    d.setDate(d.getDate() - 1);
  }
  return toDateOnly(d);
}
