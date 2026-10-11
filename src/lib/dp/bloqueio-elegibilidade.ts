import { podeEscolherFolgaFds } from "./escolha-folga-elegibilidade";

type ColabElegivel = {
  regime?: string | null;
  forma_pagamento?: string | null;
  vinculo_label?: string | null;
  folga_fixa_semana?: number[] | number | string | null;
};

/** Domingo = 0 (ou 7) na folga fixa semanal. */
function folgaFixaNoDomingo(v: ColabElegivel["folga_fixa_semana"]): boolean {
  if (v == null) return false;
  const lista = Array.isArray(v) ? v : String(v).split(/[,\s]+/);
  return lista.some((d) => Number(d) === 0 || Number(d) === 7);
}

/**
 * Pode ser alvo de bloqueio de folga quem participa da escolha de folga
 * (CLT exceto intermitente, freelancer mensalista) e não tem folga fixa
 * no domingo — sócio fica de fora.
 */
export function colaboradorElegivelBloqueio(c: ColabElegivel): boolean {
  return podeEscolherFolgaFds(c.regime, c.forma_pagamento, c.vinculo_label) && !folgaFixaNoDomingo(c.folga_fixa_semana);
}
