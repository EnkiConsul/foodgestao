// Utilitários puros de relatórios operacionais do módulo Pedidos.
// Mantidos fora do componente para permitir teste unitário e reuso.

/** Formata centavos em BRL. */
export function formatCents(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Formata uma duração em segundos de forma legível. */
export function formatDurationSeconds(seconds: number | null | undefined): string {
  const value = seconds ?? 0;
  if (value <= 0) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)} min`;
  return `${(value / 3600).toFixed(1)} h`;
}

/** Mascaramento espelhado do backend, usado em pré-visualizações. */
export function maskPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `••••${digits.slice(-4)}`;
}

export function maskName(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const [first, second] = trimmed.split(/\s+/);
  return second ? `${first} ${second.charAt(0)}.` : first;
}

/** Converte linhas em CSV com separador ; (compatível com Excel pt-BR). */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const text = String(value).replace(/"/g, '""');
    return /[";\n]/.test(text) ? `"${text}"` : text;
  };
  return [
    headers.join(";"),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(";")),
  ].join("\n");
}

/** Ticket médio operacional, ignorando pedidos cancelados. */
export function averageTicket(totalAmount: number, validOrders: number): number {
  if (validOrders <= 0) return 0;
  return Math.round(totalAmount / validOrders);
}
