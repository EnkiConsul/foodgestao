/**
 * Traduz erros técnicos vindos do banco (triggers, constraints) em mensagens
 * compreensíveis para quem está usando o sistema.
 */

export interface MensagemErro {
  titulo: string;
  descricao?: string;
}

const REGRAS: Array<{ padrao: RegExp; mensagem: MensagemErro }> = [
  {
    padrao: /confirmed_open_finance_tx_immutable/i,
    mensagem: {
      titulo: "Lançamento conciliado com o banco",
      descricao:
        "Este lançamento veio do extrato bancário automático e já está conciliado. A conta, o valor e a data não podem ser alterados, porque precisam continuar iguais ao extrato. Você ainda pode mudar a categoria, o contato, a forma de pagamento e as observações.",
    },
  },
  {
    padrao: /cross_tenant|tenant_mismatch/i,
    mensagem: {
      titulo: "Dados de outra empresa",
      descricao:
        "A conta, a categoria ou o contato escolhido pertence a outra empresa. Selecione itens da empresa aberta na tela.",
    },
  },
  {
    padrao: /permission denied|row-level security|violates row-level/i,
    mensagem: {
      titulo: "Sem permissão para esta ação",
      descricao:
        "Seu perfil não permite esta alteração. Peça ao dono ou ao administrador para liberar nas permissões.",
    },
  },
];

/** Converte a mensagem de erro do banco em título e descrição amigáveis. */
export function mensagemErroLancamento(
  erro: unknown,
  tituloPadrao = "Erro ao salvar",
): MensagemErro {
  const texto =
    typeof erro === "string"
      ? erro
      : ((erro as { message?: string } | null)?.message ?? "");

  for (const regra of REGRAS) {
    if (regra.padrao.test(texto)) return regra.mensagem;
  }

  return { titulo: tituloPadrao, descricao: texto || undefined };
}
