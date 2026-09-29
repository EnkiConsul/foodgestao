export type EscolhasObrigatoriasFicha = {
  regime: string | null;
  formaPagamento: string | null;
  possuiFolhaPonto: boolean | null;
  optanteAdiantamento: boolean | null;
};

const CAMPOS: Array<[keyof EscolhasObrigatoriasFicha, string]> = [
  ["regime", "vínculo"],
  ["formaPagamento", "forma de pagamento"],
  ["possuiFolhaPonto", "folha de ponto"],
  ["optanteAdiantamento", "adiantamento salarial"],
];

export function escolhasObrigatoriasFaltando(escolhas: EscolhasObrigatoriasFicha): string[] {
  return CAMPOS.filter(([campo]) => escolhas[campo] === null || escolhas[campo] === "")
    .map(([, rotulo]) => rotulo);
}

export function mensagemEscolhasObrigatorias(faltando: string[]): string {
  if (faltando.length === 0) return "";
  if (faltando.length === 1) return `Selecione ${faltando[0]} antes de criar o cadastro.`;
  return `Selecione os campos que faltam: ${faltando.join(", ")}.`;
}
