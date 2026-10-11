/** Folga do colaborador considerada para oferecer numa troca. */
export type FolgaOfertavel = {
  id: string;
  colaborador_id: string;
  data: string;
  status: string | null;
};

/** Período de afastamento (atestado, licença, suspensão ou férias) vindo da RPC dp_trocas_afastamentos. */
export type PeriodoAfastamento = {
  colaborador_id: string;
  inicio: string;
  fim: string;
};

/**
 * Verdadeiro quando a data cai num período de afastamento da pessoa.
 * Folga nesse período não é negociável: nem o próprio colaborador oferece,
 * nem o colega pode pedir (a RPC dp_troca_propor também barra no servidor).
 */
export function dataEmAfastamento(
  periodos: PeriodoAfastamento[] | null | undefined,
  colaboradorId: string | null | undefined,
  dataIso: string,
): boolean {
  if (!colaboradorId || !periodos?.length) return false;
  return periodos.some(
    (p) => p.colaborador_id === colaboradorId && p.inicio <= dataIso && dataIso <= p.fim,
  );
}

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
