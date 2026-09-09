/**
 * Cadastros estruturais (colaborador, cargo, setor, unidade, turno, jornada,
 * sindicato) são gravados em CAIXA ALTA — padrão de ficha de registro.
 *
 * Comunicação (avisos, mensagens, boas-vindas) NÃO usa esta função: lá vale
 * Primeira Maiúscula (`toProperName` / `tituloSistema`).
 */
export function toUpperCadastro<T extends string | null | undefined>(value: T): T {
  if (value == null) return value;
  const v = String(value).replace(/\s+/g, " ").trim();
  return (v ? v.toLocaleUpperCase("pt-BR") : v) as T;
}
