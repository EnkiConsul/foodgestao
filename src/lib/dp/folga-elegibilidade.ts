import { contratoPolicy, isSocio } from "./contrato-policy";
import { podeEscolherFolgaFds } from "./escolha-folga-elegibilidade";

export interface PessoaFolga {
  regime?: string | null;
  forma_pagamento?: string | null;
  vinculo_label?: string | null;
}

/** Descansos operacionais de sócios permanecem separados de direitos celetistas. */
export function podeReceberFolga(p: PessoaFolga): boolean {
  if (isSocio(p.vinculo_label)) return false;
  const policy = contratoPolicy(p.regime, p.vinculo_label);
  return (!!p.regime && policy.exigeFolgaSemanal) || podeEscolherFolgaFds(p.regime, p.forma_pagamento, p.vinculo_label);
}

/** O calendário verifica configuração, nunca apura feriados trabalhados ou saldo. */
export function podeReceberCompensatoria(p: PessoaFolga, unidadeCompensa: boolean, individual?: boolean | null): boolean {
  return podeEscolherFolgaFds(p.regime, p.forma_pagamento, p.vinculo_label) && (unidadeCompensa && individual !== false);
}