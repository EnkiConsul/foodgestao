/**
 * Data-base do sindicato se repete todo ano: guardamos só dia/mês, com o ano
 * fixo 2000 (bissexto, então 29/02 é aceito).
 */
export function dataBaseIso(v: string): string | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1) return null;
  const ultimoDia = new Date(Date.UTC(2000, mes, 0)).getUTCDate();
  if (dia > ultimoDia) return null;
  return `2000-${m[2]}-${m[1]}`;
}

/** Máscara de digitação dd/mm. */
export function mascaraDataBase(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}
