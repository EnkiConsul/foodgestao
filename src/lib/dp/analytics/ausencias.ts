// ------------------------------------------------------------------
// Analytics — Pessoas 360° · Ausências, solicitações e ocorrências
//
// Fonte canônica do afastamento por atestado: dp_solicitacoes com
// tipo = atestado e status = aprovada. `data_alvo` é o primeiro dia e
// `data_fim` é INCLUSIVO (atestado de 1 dia conta exatamente 1 dia).
// `created_at` nunca define a competência do afastamento.
//
// dp_ocorrencias é domínio próprio (evento administrativo) e nunca é somado
// aos atestados. dp_registros_disciplinares também é bloco separado.
// ------------------------------------------------------------------

import { diasNaInterseccao, tocaPeriodo, type PeriodoAnalytics } from "./periodo";

export interface AtestadoAnalytics {
  colaborador_id: string;
  data_alvo: string | null;
  data_fim: string | null;
}

export interface ResumoAtestados {
  /** Atestados que tocam o período. */
  ocorrencias: number;
  colaboradores: number;
  /** Só os dias que caem dentro do período. */
  dias: number;
  mediaDiasPorAtestado: number | null;
}

const janela = (a: AtestadoAnalytics) => ({ inicio: a.data_alvo, fim: a.data_fim });

export function atestadosDoPeriodo(
  lista: readonly AtestadoAnalytics[],
  p: PeriodoAnalytics,
): AtestadoAnalytics[] {
  return lista.filter((a) => tocaPeriodo(janela(a), p));
}

export function diasDeAfastamento(
  lista: readonly AtestadoAnalytics[],
  p: PeriodoAnalytics,
): number {
  return lista.reduce((s, a) => s + diasNaInterseccao(janela(a), p), 0);
}

export function resumoAtestados(
  lista: readonly AtestadoAnalytics[],
  p: PeriodoAnalytics,
): ResumoAtestados {
  const doPeriodo = atestadosDoPeriodo(lista, p);
  const dias = diasDeAfastamento(doPeriodo, p);
  return {
    ocorrencias: doPeriodo.length,
    colaboradores: new Set(doPeriodo.map((a) => a.colaborador_id)).size,
    dias,
    mediaDiasPorAtestado: doPeriodo.length ? Number((dias / doPeriodo.length).toFixed(1)) : null,
  };
}

// ------------------------------------------------------------------
// Folgas
// ------------------------------------------------------------------

export interface FolgaAnalytics {
  colaborador_id: string;
  data: string;
  tipo: string | null;
  origem: string | null;
  status: string | null;
  extra: boolean | null;
}

/** Origens que representam atribuição automática pelo sistema. */
const ORIGENS_AUTOMATICAS = new Set(["automatica_clt", "auto_fechamento_periodo"]);

export interface ResumoFolgas {
  efetivas: number;
  colaboradores: number;
  automaticas: number;
  porSolicitacao: number;
  excecoesDeJanela: number;
  porDiaSemana: number[];
}

export function resumoFolgas(
  lista: readonly FolgaAnalytics[],
  p: PeriodoAnalytics,
): ResumoFolgas {
  const doPeriodo = lista.filter(
    (f) => f.status !== "cancelada" && f.data >= p.inicio && f.data <= p.fim,
  );
  const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
  doPeriodo.forEach((f) => {
    porDiaSemana[new Date(`${f.data}T12:00:00`).getDay()] += 1;
  });
  return {
    efetivas: doPeriodo.length,
    colaboradores: new Set(doPeriodo.map((f) => f.colaborador_id)).size,
    automaticas: doPeriodo.filter((f) => ORIGENS_AUTOMATICAS.has(f.origem ?? "")).length,
    porSolicitacao: doPeriodo.filter((f) => f.origem === "solicitacao").length,
    excecoesDeJanela: doPeriodo.filter((f) => f.extra === true || f.tipo === "extra").length,
    porDiaSemana,
  };
}

// ------------------------------------------------------------------
// Solicitações
// ------------------------------------------------------------------

export interface SolicitacaoAnalytics {
  colaborador_id: string;
  tipo: string;
  status: string;
  created_at: string;
  respondido_em: string | null;
}

export interface ResumoSolicitacoes {
  recebidas: number;
  aprovadas: number;
  recusadas: number;
  pendentes: number;
  canceladas: number;
  /** Horas entre o pedido e a decisão registrada. */
  mediaHorasDecisao: number | null;
  medianaHorasDecisao: number | null;
  porTipo: { tipo: string; total: number }[];
}

export function resumoSolicitacoes(
  lista: readonly SolicitacaoAnalytics[],
  p: PeriodoAnalytics,
): ResumoSolicitacoes {
  const doPeriodo = lista.filter((s) => {
    const dia = s.created_at.slice(0, 10);
    return dia >= p.inicio && dia <= p.fim;
  });

  const horas = doPeriodo
    .filter((s) => !!s.respondido_em)
    .map(
      (s) =>
        (new Date(s.respondido_em!).getTime() - new Date(s.created_at).getTime()) / 3_600_000,
    )
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const meio = Math.floor(horas.length / 2);

  const porTipoMapa = new Map<string, number>();
  doPeriodo.forEach((s) => porTipoMapa.set(s.tipo, (porTipoMapa.get(s.tipo) ?? 0) + 1));

  const contar = (status: string) => doPeriodo.filter((s) => s.status === status).length;

  return {
    recebidas: doPeriodo.length,
    aprovadas: contar("aprovada"),
    recusadas: contar("recusada"),
    pendentes: contar("pendente"),
    canceladas: contar("cancelada"),
    mediaHorasDecisao: horas.length
      ? Number((horas.reduce((s, h) => s + h, 0) / horas.length).toFixed(1))
      : null,
    medianaHorasDecisao: horas.length
      ? Number((horas.length % 2 ? horas[meio] : (horas[meio - 1] + horas[meio]) / 2).toFixed(1))
      : null,
    porTipo: [...porTipoMapa.entries()]
      .map(([tipo, total]) => ({ tipo, total }))
      .sort((a, b) => b.total - a.total),
  };
}

// ------------------------------------------------------------------
// Ocorrências administrativas (domínio dp_ocorrencias)
// ------------------------------------------------------------------

export interface OcorrenciaAnalytics {
  colaborador_id: string;
  tipo: string;
  estado: string;
  data_operacional: string;
  unidade_id: string | null;
  setor_id: string | null;
}

export interface ResumoOcorrencias {
  confirmadas: number;
  colaboradores: number;
  comDuasOuMais: number;
  porTipo: { tipo: string; total: number }[];
}

/** Só o que foi confirmado conta como fato; previsão e cancelada ficam fora. */
export function ocorrenciasConfirmadas(
  lista: readonly OcorrenciaAnalytics[],
  p: PeriodoAnalytics,
): OcorrenciaAnalytics[] {
  return lista.filter(
    (o) =>
      o.estado === "confirmada" && o.data_operacional >= p.inicio && o.data_operacional <= p.fim,
  );
}

export function resumoOcorrencias(
  lista: readonly OcorrenciaAnalytics[],
  p: PeriodoAnalytics,
): ResumoOcorrencias {
  const confirmadas = ocorrenciasConfirmadas(lista, p);
  const porPessoa = new Map<string, number>();
  const porTipo = new Map<string, number>();
  confirmadas.forEach((o) => {
    porPessoa.set(o.colaborador_id, (porPessoa.get(o.colaborador_id) ?? 0) + 1);
    porTipo.set(o.tipo, (porTipo.get(o.tipo) ?? 0) + 1);
  });
  return {
    confirmadas: confirmadas.length,
    colaboradores: porPessoa.size,
    comDuasOuMais: [...porPessoa.values()].filter((n) => n >= 2).length,
    porTipo: [...porTipo.entries()]
      .map(([tipo, total]) => ({ tipo, total }))
      .sort((a, b) => b.total - a.total),
  };
}
