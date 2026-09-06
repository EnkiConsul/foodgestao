/**
 * Ações que o gestor pode executar em uma troca, por status e modo de troca
 * configurado nas regras de folga da unidade.
 *
 * O gestor nunca responde em nome do colega: ele pode aprovar (só quando a
 * unidade exige aprovação do gestor), recusar ou cancelar uma troca aprovada.
 */
export type TrocaModo = "direta" | "aprovacao_admin" | "proibida";

export type AcoesGestorTroca = {
  aprovar: boolean;
  recusar: boolean;
  cancelar: boolean;
};

export function acoesGestorTroca(status: string, modo: TrocaModo): AcoesGestorTroca {
  const exigeGestor = modo !== "direta";
  switch (status) {
    case "pendente_colega":
      return { aprovar: false, recusar: true, cancelar: false };
    case "pendente_gestor":
      return { aprovar: exigeGestor, recusar: true, cancelar: false };
    case "aprovada":
      return { aprovar: false, recusar: false, cancelar: true };
    default:
      return { aprovar: false, recusar: false, cancelar: false };
  }
}

/** Texto da decisão do gestor, sem o prefixo técnico do status. */
export function textoDecisaoGestor(resposta: string | null | undefined): string | null {
  if (!resposta) return null;
  const limpo = resposta.replace(/^(recusada|cancelada|aprovada|expirada):\s*/i, "").trim();
  return limpo.length > 0 && !["aprovada", "recusada", "expirada"].includes(limpo.toLowerCase())
    ? limpo
    : null;
}

