/** Folga do colaborador considerada para oferecer numa troca. */
export type FolgaOfertavel = {
  id: string;
  colaborador_id: string;
  data: string;
  status: string | null;
};

/**
 * Folgas que o colaborador pode oferecer numa troca: apenas as dele, ativas,
 * de hoje em diante e **nunca** o próprio dia que ele está pedindo — trocar um
 * dia pelo mesmo dia não é troca.
 */
export function folgasOfertaveis<T extends FolgaOfertavel>(
  folgas: T[],
  opts: { meuId: string | null | undefined; hojeIso: string; diaPedidoIso?: string | null },
): T[] {
  if (!opts.meuId) return [];
  return folgas
    .filter(
      (f) =>
        f.colaborador_id === opts.meuId &&
        f.status !== "cancelada" &&
        f.data >= opts.hojeIso &&
        f.data !== opts.diaPedidoIso,
    )
    .sort((a, b) => a.data.localeCompare(b.data));
}
