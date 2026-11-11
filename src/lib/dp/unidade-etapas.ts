/**
 * Ordem das etapas do cadastro de unidade. A barra de abas e o botão
 * "Salvar e avançar" leem a mesma lista, então a sequência nunca diverge.
 */
export const UNIDADE_ETAPAS = [
  { valor: "dados", rotulo: "Dados" },
  { valor: "setores", rotulo: "Setores" },
  { valor: "funcionamento", rotulo: "Horários" },
  { valor: "feriados", rotulo: "Feriados" },
  { valor: "sindicato", rotulo: "Sindicato" },
] as const;

export type UnidadeEtapa = (typeof UNIDADE_ETAPAS)[number]["valor"];

/** Próxima etapa depois da atual; `null` na última. */
export function proximaEtapaUnidade(atual: UnidadeEtapa): UnidadeEtapa | null {
  const i = UNIDADE_ETAPAS.findIndex((e) => e.valor === atual);
  return i >= 0 && i < UNIDADE_ETAPAS.length - 1 ? UNIDADE_ETAPAS[i + 1].valor : null;
}
