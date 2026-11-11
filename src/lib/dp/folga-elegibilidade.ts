import { contratoPolicy, isSocio } from "./contrato-policy";
import { podeEscolherFolgaFds } from "./escolha-folga-elegibilidade";

export interface PessoaFolga {
  regime?: string | null;
  forma_pagamento?: string | null;
  vinculo_label?: string | null;
  /** "12x36" quando a configuração vigente é plantão alternado. */
  escala_modelo?: string | null;
}

/** Descansos operacionais de sócios permanecem separados de direitos celetistas. */
export function podeReceberFolga(p: PessoaFolga): boolean {
  if (isSocio(p.vinculo_label)) return false;
  const policy = contratoPolicy(p.regime, p.vinculo_label);
  return (!!p.regime && policy.exigeFolgaSemanal) || podeEscolherFolgaFds(p.regime, p.forma_pagamento, p.vinculo_label);
}

/**
 * O calendário verifica configuração, nunca apura feriados trabalhados ou saldo.
 * 12x36 nunca recebe compensatória de feriado: o descanso de 36h já compensa
 * (Art. 59-A, parágrafo único, da CLT) — o banco recusa com o mesmo critério.
 */
export function podeReceberCompensatoria(p: PessoaFolga, unidadeCompensa: boolean, individual?: boolean | null): boolean {
  if (p.escala_modelo === "12x36") return false;
  return podeEscolherFolgaFds(p.regime, p.forma_pagamento, p.vinculo_label) && (unidadeCompensa && individual !== false);
}