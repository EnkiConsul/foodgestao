/**
 * Sinais derivados da resposta de cadastro (signUp).
 *
 * Com a proteção contra enumeração de e-mail ativa, cadastrar um e-mail que já
 * existe NÃO retorna erro: o backend responde sucesso com um usuário "fantasma",
 * sem sessão e com a lista de identidades vazia. Este helper isola essa
 * detecção para que a tela possa avisar o usuário corretamente.
 */
export interface SignupResponseLike {
  user?: { identities?: unknown[] | null } | null;
  session?: unknown | null;
}

export function isAlreadyRegisteredSignup(data: SignupResponseLike | null | undefined): boolean {
  if (!data?.user) return false;
  if (data.session) return false;
  const identities = data.user.identities;
  if (identities == null) return true;
  return Array.isArray(identities) && identities.length === 0;
}
