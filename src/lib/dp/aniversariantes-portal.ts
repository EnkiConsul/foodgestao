/**
 * Regras de exibição de aniversariantes no Portal do Colaborador.
 *
 * No portal aparecem apenas:
 * - aniversários de nascimento de colegas da mesma unidade (e o próprio);
 * - o aniversário de contratação do próprio colaborador.
 *
 * A tela administrativa continua mostrando tudo.
 */
export type AnivFiltravel = {
  colaboradorId: string;
  unidadeId: string | null;
  tipo: "nascimento" | "contratacao";
};

export function filtrarAniversariantesPortal<T extends AnivFiltravel>(
  itens: T[],
  eu: { colaboradorId: string | null; unidadeId: string | null },
): T[] {
  return itens.filter((a) => {
    if (a.tipo === "contratacao") return !!eu.colaboradorId && a.colaboradorId === eu.colaboradorId;
    if (a.colaboradorId === eu.colaboradorId) return true;
    if (!eu.unidadeId) return false;
    return a.unidadeId === eu.unidadeId;
  });
}
