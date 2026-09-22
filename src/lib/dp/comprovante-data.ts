/**
 * Data do pagamento informada ao anexar o comprovante.
 * Vazia é aceita (campo opcional); data futura é recusada.
 */
export type DataPagamentoValida = { ok: true; valor: string | null; motivo?: undefined };
export type DataPagamentoInvalida = { ok: false; valor?: undefined; motivo: string };

export function validarDataPagamento(
  valor: string,
  hoje: string = new Date().toISOString().slice(0, 10),
): DataPagamentoValida | DataPagamentoInvalida {
  const v = (valor ?? "").trim();
  if (!v) return { ok: true, valor: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, motivo: "Informe uma data válida." };
  if (Number.isNaN(new Date(`${v}T00:00:00`).getTime())) {
    return { ok: false, motivo: "Informe uma data válida." };
  }
  if (v > hoje) return { ok: false, motivo: "A data do pagamento não pode ser futura." };
  return { ok: true, valor: v };
}

/** Hoje no formato aceito pelo campo de data (limite máximo). */
export function hojeISO(base: Date = new Date()): string {
  const off = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - off).toISOString().slice(0, 10);
}
