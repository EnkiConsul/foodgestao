/**
 * O que ainda falta no cadastro de uma unidade. Nada aqui é obrigatório para
 * importar fichas: a tela só sinaliza "Cadastro incompleto" e, ao tocar,
 * mostra a lista abaixo — sem poluir a esteira.
 */
export type UnidadeCompletude = {
  cnpj?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  telefone?: string | null;
  tem_adiantamento?: boolean | null;
  dia_adiantamento?: number | null;
  pagamento_salario_tipo?: string | null;
  pagamento_salario_dia?: number | null;
};

export type PendenciaUnidade = { chave: string; rotulo: string; detalhe?: string };

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

export function pendenciasUnidade(
  u: UnidadeCompletude | null | undefined,
  opts: { feriadosAtivos?: number } = {},
): PendenciaUnidade[] {
  if (!u) return [];
  const out: PendenciaUnidade[] = [];
  if (vazio(u.cnpj)) out.push({ chave: "cnpj", rotulo: "CNPJ" });
  const partes: Array<[keyof UnidadeCompletude, string]> = [
    ["logradouro", "rua"], ["numero", "número"], ["bairro", "bairro"], ["cep", "CEP"], ["cidade", "cidade"], ["uf", "UF"],
  ];
  const faltaEndereco = partes.filter(([k]) => vazio(u[k])).map(([, r]) => r);
  if (faltaEndereco.length > 0) {
    out.push({
      chave: "endereco",
      rotulo: "Endereço",
      detalhe: faltaEndereco.length === partes.length ? "em branco" : `falta ${faltaEndereco.join(", ")}`,
    });
  }
  if (vazio(u.telefone)) out.push({ chave: "telefone", rotulo: "Telefone" });
  if (vazio(u.pagamento_salario_tipo) || (u.pagamento_salario_tipo === "dia_fixo" && vazio(u.pagamento_salario_dia))) {
    out.push({ chave: "pagamento", rotulo: "Dia do pagamento do salário" });
  }
  if (u.tem_adiantamento && vazio(u.dia_adiantamento)) {
    out.push({ chave: "adiantamento", rotulo: "Dia do adiantamento" });
  }
  if (opts.feriadosAtivos !== undefined && opts.feriadosAtivos === 0) {
    out.push({ chave: "feriados", rotulo: "Feriados", detalhe: "nenhum feriado ativo" });
  }
  return out;
}
