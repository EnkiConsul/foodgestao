// Formatações de exibição do módulo Pessoas em um só lugar.
// Antes cada tela reescrevia a mesma função, o que fazia a mesma data
// aparecer com variações entre telas.

/** Data ISO (AAAA-MM-DD) como dd/MM/aaaa. Sem valor, devolve o texto de reserva. */
export function dataBr(iso?: string | null, fallback = "—"): string {
  if (!iso) return fallback;
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return fallback;
  return `${dia}/${mes}/${ano}`;
}

/** Data ISO como dd/MM (sem o ano). */
export function diaMes(iso?: string | null, fallback = "—"): string {
  if (!iso) return fallback;
  const [, mes, dia] = iso.slice(0, 10).split("-");
  if (!mes || !dia) return fallback;
  return `${dia}/${mes}`;
}

/** Horário "HH:MM:SS" ou "HH:MM" como HH:MM. */
export function hhmm(valor?: string | null, fallback = ""): string {
  if (!valor) return fallback;
  return String(valor).slice(0, 5);
}

/** Mantém apenas os dígitos (CPF, CNPJ, telefone). */
export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}
