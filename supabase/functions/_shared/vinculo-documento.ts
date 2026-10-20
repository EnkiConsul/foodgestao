// Espelho de src/lib/dp/vinculo-documento.ts (mantenha os dois iguais).
//
// O ASO (NR-7 / art. 168 CLT) só se aplica a vínculo de emprego. O servidor
// usa esta regra para recusar registro de ASO em fichas de PJ/freelancer e
// para não bloquear o envio à contabilidade de vínculos sem exame.

export function regimeEhEmprego(regime?: string | null): boolean {
  const r = String(regime ?? "clt").trim().toLowerCase();
  return r === "clt" || r === "intermitente";
}
