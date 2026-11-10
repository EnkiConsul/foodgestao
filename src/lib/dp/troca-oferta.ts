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

/** Troca ainda aberta, como lida pelo calendário do portal. */
export type TrocaAberta = {
  solicitante_id: string;
  destino_id: string;
  data_original: string | null;
  data_proposta: string | null;
  status: string;
};

export type EsperaTroca = "colega" | "gestor";

/**
 * Colegas do dia `iso` com quem eu já tenho uma troca aberta envolvendo a folga
 * deles nesse dia. O portal troca o botão "Trocar" pelo aviso de espera — reenviar
 * a mesma proposta só esbarraria na duplicidade barrada pelo servidor.
 */
export function trocasAbertasComColegas(
  trocas: TrocaAberta[] | null | undefined,
  meuId: string | null | undefined,
  iso: string,
): Map<string, EsperaTroca> {
  const out = new Map<string, EsperaTroca>();
  if (!meuId || !trocas?.length) return out;
  for (const t of trocas) {
    const espera: EsperaTroca | null =
      t.status === "pendente_colega" ? "colega" : t.status === "pendente_gestor" ? "gestor" : null;
    if (!espera) continue;
    // Eu pedi a folga do colega neste dia.
    if (t.solicitante_id === meuId && t.data_proposta === iso) out.set(t.destino_id, espera);
    // O colega me ofereceu a folga dele neste dia.
    else if (t.destino_id === meuId && t.data_original === iso) out.set(t.solicitante_id, espera);
  }
  return out;
}
