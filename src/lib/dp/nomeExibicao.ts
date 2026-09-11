/**
 * Nome usado no dia a dia (rotina, escalas, portal e mensagens).
 *
 * Quando a pessoa informou nome social, é ele que aparece nas telas
 * operacionais. Documentos oficiais continuam sempre com o nome completo —
 * por isso este helper nunca deve ser usado em holerite, TRCT, contrato etc.
 */
export function nomeExibicao(
  pessoa: { nome?: string | null; nome_social?: string | null } | null | undefined,
): string {
  if (!pessoa) return "";
  const social = (pessoa.nome_social ?? "").trim();
  if (social) return social;
  return (pessoa.nome ?? "").trim();
}

/** Nome do dia a dia com o completo entre parênteses, para listas de conferência. */
export function nomeComCompleto(
  pessoa: { nome?: string | null; nome_social?: string | null } | null | undefined,
): string {
  if (!pessoa) return "";
  const completo = (pessoa.nome ?? "").trim();
  const social = (pessoa.nome_social ?? "").trim();
  if (!social || social === completo) return completo;
  return `${social} (${completo})`;
}
