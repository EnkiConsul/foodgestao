/**
 * Dados de pagamento do colaborador (depósito ou Pix).
 *
 * Regra única do sistema: quem não recebe em espécie precisa informar OU os
 * dados da conta (banco, agência e conta) OU a chave Pix. O banco de dados
 * também valida o titular de terceiro, então a tela nunca é a única barreira.
 */

export interface DadosPagamento {
  banco_codigo: string;
  banco_nome: string;
  agencia: string;
  conta: string;
  conta_digito: string;
  conta_tipo: string;
  titular_proprio: boolean;
  titular_nome: string;
  titular_cpf: string;
  pix_tipo: string;
  pix_chave: string;
  recebe_em_especie: boolean;
}

export const CONTA_TIPOS: { value: string; label: string }[] = [
  { value: "corrente", label: "Conta corrente" },
  { value: "poupanca", label: "Conta poupança" },
  { value: "pagamento", label: "Conta de pagamento" },
  { value: "salario", label: "Conta salário" },
];

/**
 * Tipos de chave Pix, na ordem da tela. CPF e celular são os recomendados —
 * são os que comprovam que a chave é do próprio colaborador; os demais ficam
 * disponíveis com aviso.
 */
export const PIX_TIPOS: { value: string; label: string; recomendado?: boolean }[] = [
  { value: "cpf", label: "CPF (recomendado)", recomendado: true },
  { value: "telefone", label: "Celular (recomendado)", recomendado: true },
  { value: "email", label: "E-mail" },
  { value: "aleatoria", label: "Chave aleatória" },
  { value: "cnpj", label: "CNPJ" },
];

export const PIX_TIPOS_RECOMENDADOS = ["cpf", "telefone"] as const;

export const pixTipoRecomendado = (tipo: string): boolean =>
  (PIX_TIPOS_RECOMENDADOS as readonly string[]).includes(String(tipo ?? "").trim());

export const CAMPOS_PAGAMENTO = [
  "banco_codigo", "banco_nome", "agencia", "conta", "conta_digito", "conta_tipo",
  "titular_proprio", "titular_nome", "titular_cpf", "pix_tipo", "pix_chave",
  "recebe_em_especie",
] as const;

export const PAGAMENTO_BLANK: DadosPagamento = {
  banco_codigo: "", banco_nome: "", agencia: "", conta: "", conta_digito: "",
  conta_tipo: "", titular_proprio: true, titular_nome: "", titular_cpf: "",
  pix_tipo: "", pix_chave: "", recebe_em_especie: false,
};

const texto = (v: unknown) => String(v ?? "").trim();

/** Lê os dados de pagamento de um registro do banco para dentro do formulário. */
export function pagamentoDoRegistro(c: Record<string, unknown> | null | undefined): DadosPagamento {
  return {
    ...PAGAMENTO_BLANK,
    banco_codigo: texto(c?.banco_codigo),
    banco_nome: texto(c?.banco_nome),
    agencia: texto(c?.agencia),
    conta: texto(c?.conta),
    conta_digito: texto(c?.conta_digito),
    conta_tipo: texto(c?.conta_tipo),
    titular_proprio: c?.titular_proprio !== false,
    titular_nome: texto(c?.titular_nome),
    titular_cpf: texto(c?.titular_cpf),
    pix_tipo: texto(c?.pix_tipo),
    pix_chave: texto(c?.pix_chave),
    recebe_em_especie: c?.recebe_em_especie === true,
  };
}

/** Converte o formulário em colunas do banco (vazio vira nulo). */
export function pagamentoParaBanco(p: DadosPagamento) {
  const emEspecie = p.recebe_em_especie === true;
  const nulo = (v: string) => (texto(v) ? texto(v) : null);
  return {
    banco_codigo: emEspecie ? null : nulo(p.banco_codigo),
    banco_nome: emEspecie ? null : nulo(p.banco_nome),
    agencia: emEspecie ? null : nulo(p.agencia),
    conta: emEspecie ? null : nulo(p.conta),
    conta_digito: emEspecie ? null : nulo(p.conta_digito),
    conta_tipo: emEspecie ? null : nulo(p.conta_tipo),
    // Só conta de titularidade do próprio colaborador: o titular de terceiro
    // saiu do sistema e o banco de dados recusa qualquer gravação assim.
    titular_proprio: true,
    titular_nome: null,
    titular_cpf: null,
    pix_tipo: emEspecie ? null : nulo(p.pix_tipo),
    pix_chave: emEspecie ? null : nulo(p.pix_chave),
    recebe_em_especie: emEspecie,
  };
}

export const contaPreenchida = (p: Partial<DadosPagamento> | Record<string, unknown>) =>
  !!texto((p as DadosPagamento).banco_codigo || (p as DadosPagamento).banco_nome)
  && !!texto((p as DadosPagamento).agencia)
  && !!texto((p as DadosPagamento).conta);

export const pixPreenchido = (p: Partial<DadosPagamento> | Record<string, unknown>) =>
  !!texto((p as DadosPagamento).pix_tipo) && !!texto((p as DadosPagamento).pix_chave);

/** Falta informar como a pessoa recebe? (espécie dispensa tudo) */
export function pagamentoFaltando(c: Record<string, unknown> | null | undefined): boolean {
  if (!c) return true;
  if (c.recebe_em_especie === true) return false;
  return !contaPreenchida(c) && !pixPreenchido(c);
}

/**
 * A chave combina com o tipo escolhido? CPF confere os dígitos, celular exige
 * DDD, e-mail precisa de arroba e a aleatória tem o formato do banco central.
 */
export function erroChavePix(tipo: string, chave: string): string | null {
  const t = texto(tipo);
  const v = texto(chave);
  if (!t || !v) return null;
  const digitos = v.replace(/\D/g, "");
  if (t === "cpf") {
    return isValidCpf(digitos) ? null : "Confira o CPF da chave Pix: os números não fecham.";
  }
  if (t === "cnpj") {
    return digitos.length === 14 ? null : "Informe o CNPJ da chave Pix com 14 dígitos.";
  }
  if (t === "telefone") {
    return digitos.length >= 10 && digitos.length <= 13
      ? null
      : "Informe o celular da chave Pix com DDD.";
  }
  if (t === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "Informe um e-mail válido na chave Pix.";
  }
  if (t === "aleatoria") {
    return /^[0-9a-fA-F-]{32,36}$/.test(v)
      ? null
      : "A chave aleatória tem 32 caracteres (com ou sem os traços).";
  }
  return null;
}

/** Mensagem curta de erro para a tela; null quando está tudo certo. */
export function erroPagamento(p: DadosPagamento): string | null {
  if (p.recebe_em_especie) return null;
  if (!contaPreenchida(p) && !pixPreenchido(p)) {
    return "Informe os dados da conta (banco, agência e conta) ou a chave Pix.";
  }
  if (p.titular_proprio === false) {
    return "A conta precisa ser de titularidade do próprio colaborador.";
  }
  if (texto(p.pix_tipo) && !texto(p.pix_chave)) return "Informe a chave Pix.";
  return erroChavePix(p.pix_tipo, p.pix_chave);
}
