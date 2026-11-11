/**
 * Efetivação das fichas prontas do lote em um só passo.
 *
 * Monta, para cada ficha, exatamente o que a conferência individual enviaria
 * ao criar o cadastro (mesmos padrões, rascunho e ações em grupo). Ficha com
 * qualquer parada obrigatória fica de fora com o motivo — nunca é "completada"
 * por suposição. Quem grava é sempre a rotina oficial `dp_ficha_aplicar`.
 */
import { divergenciasComFicha, type DivergenciaFicha } from "./divergencia";
import { dependentesDaFicha, inferirFormaPagamento, inferirRegime } from "./inferencia";
import { inconformidadesJornada, jornadaDosDadosDaFicha, type JornadaSugerida } from "./jornada-parse";
import { matchTurno, type TurnoCadastrado } from "./turno-match";
import { matchUnidade, type UnidadeCadastrada } from "./unidade-match";
import {
  dadosDaFichaLote, escolhaDaFicha, JUSTIFICATIVA_PONTO_MIN, pendenciasFichaLote, semDadosAcesso,
  turnoPadraoDoLote, vinculoOrganizado, type ItemLote, type OrganizacaoLote, type PadroesLote,
} from "./organizacao-lote";

export const ROTULO_REGIME: Record<string, string> = {
  clt: "CLT efetivo",
  intermitente: "CLT intermitente",
  estagio: "Estagiário",
  temporario: "Temporário",
  pj: "PJ / Sócio",
  mei: "MEI",
  freelancer: "Freelancer (sem registro)",
};
export const ROTULO_FORMA: Record<string, string> = {
  mensalista: "Mensalista",
  horista: "Horista",
  diarista: "Diarista",
  semanal: "Semanal",
  por_turno: "Por turno",
  servico_acordo: "Serviço acordado",
};

export type ItemEfetivacao = ItemLote & { colaborador_existente_id?: string | null };

export type EnvioFichaLote = {
  dados: Record<string, unknown>;
  cargoId: string;
  unidadeId: string;
  setorId: string | null;
  regime: string | null;
  formaPagamento: string;
  possuiFolhaPonto: boolean;
  optanteAdiantamento: boolean;
  jornada: JornadaSugerida | null;
  turnoId: string | null;
  /** Assina documentos em papel a partir da admissão (marcado na ficha ou em grupo). */
  assinaturaPapel: boolean;
};

export type PlanoFichaLote =
  | {
      itemId: string;
      nome: string;
      apta: true;
      envio: EnvioFichaLote;
      divergencias: DivergenciaFicha[];
      dependentes: ReturnType<typeof dependentesDaFicha>;
      semAcesso: boolean;
      /** Intervalo de 30 a 59 min coberto pela ciência única do lote: registrar por pessoa. */
      intervaloReduzidoLote: boolean;
    }
  | { itemId: string; nome: string; apta: false; motivos: string[] };

export type ContextoEfetivacao = {
  unidadeId: string | null;
  unidades: UnidadeCadastrada[];
  empresaCnpj?: string | null;
  cargos: Array<{ id: string; nome: string }>;
  turnos: TurnoCadastrado[];
  padroes: PadroesLote;
  exigirSetor: boolean;
  salarioCargo?: (cargoId: string | null) => number | null;
};

const jornadaDe = (d: Record<string, unknown>): JornadaSugerida => jornadaDosDadosDaFicha(d);

/** O que a ficha enviaria ao cadastro, ou por que ela precisa ser conferida à parte. */
export function planejarFichaLote(item: ItemEfetivacao, org: OrganizacaoLote | null | undefined, ctx: ContextoEfetivacao): PlanoFichaLote {
  const d = dadosDaFichaLote(item, org);
  const nome = String(d.nome ?? item.nome_extraido ?? "Ficha sem nome");
  const extraidos = (item.dados_extraidos ?? {}) as Record<string, unknown>;
  const v = vinculoOrganizado(item, org);
  const jornada = jornadaDe(d);
  const formaInferida = inferirFormaPagamento(d, jornada);
  const pend = pendenciasFichaLote(item, org, {
    padroes: ctx.padroes,
    formaPagamento: formaInferida,
    salarioCargo: ctx.salarioCargo?.(v?.cargoId ?? null) ?? null,
    exigirSetor: ctx.exigirSetor,
  });
  const motivos = [...pend.obrigatorias];
  if (!["pendente", "revisar", "duplicado"].includes(item.status)) motivos.push("ficha já concluída");
  if (item.colaborador_existente_id) motivos.push("já existe cadastro com este CPF: conferir lado a lado");
  if (!ctx.unidadeId) motivos.push("unidade do lote");
  const cargo = ctx.cargos.find((c) => c.id === v?.cargoId) ?? null;
  if (v?.cargoId && !cargo) motivos.push("cargo não encontrado");
  const unidadeLida = matchUnidade(d, ctx.unidades, ctx.empresaCnpj);
  if (unidadeLida.empresaConfere === "nao") motivos.push("CNPJ da ficha é de outra empresa");
  else if (unidadeLida.unidade_id && ctx.unidadeId && unidadeLida.unidade_id !== ctx.unidadeId) {
    motivos.push("ficha de outra unidade");
  }

  const regimeAjuste = org?.ajustes?.[item.id]?.regime ?? null;
  const regime = escolhaDaFicha(item, org, "regime") ?? ctx.padroes.regime ?? inferirRegime(d) ?? null;
  const formaPagamento = escolhaDaFicha(item, org, "forma_pagamento") ?? formaInferida ?? null;
  const pontoFicha = escolhaDaFicha(item, org, "folha_ponto");
  const possuiFolhaPonto = ctx.padroes.unidadeTemPonto ? pontoFicha ?? true : false;
  const motivoPonto = String(escolhaDaFicha(item, org, "folha_ponto_justificativa") ?? "").trim();
  // Em lote a unidade cresce de uma vez: toda dispensa de ponto leva o motivo.
  if (ctx.padroes.unidadeTemPonto && !possuiFolhaPonto && motivoPonto.length < JUSTIFICATIVA_PONTO_MIN
    && !motivos.includes("motivo de não registrar ponto")) {
    motivos.push("motivo de não registrar ponto");
  }
  if (!formaPagamento && !motivos.includes("forma de pagamento")) motivos.push("forma de pagamento");
  const adiantAjuste = org?.ajustes?.[item.id]?.adiantamento;
  const optanteAdiantamento = typeof adiantAjuste === "boolean" ? adiantAjuste : ctx.padroes.adiantamento ?? false;

  if (motivos.length > 0 || !cargo || !ctx.unidadeId || !formaPagamento) return { itemId: item.id, nome, apta: false, motivos };

  const turnoFicha = escolhaDaFicha(item, org, "turno_id") ?? null;
  const turnoAjuste = org?.ajustes?.[item.id]?.turno_id ?? null;
  const turnoId = turnoAjuste
    ?? matchTurno(jornada, ctx.turnos, ctx.unidadeId).turno_id
    ?? turnoPadraoDoLote(jornada.vazia, turnoFicha, ctx.turnos);

  const divergencias = divergenciasComFicha(
    {
      cargoNome: (extraidos.cargo_nome as string) ?? null,
      salario: extraidos.salario as string | number | null,
      regime: inferirRegime(extraidos),
      formaPagamento: inferirFormaPagamento(extraidos, jornadaDe(extraidos)),
    },
    {
      cargoNome: cargo.nome,
      salario: d.salario as string | number | null,
      regime: regimeAjuste ? regime : null,
      formaPagamento,
    },
    { regime: (r) => ROTULO_REGIME[r] ?? r, forma: (f) => ROTULO_FORMA[f] ?? f },
  );

  const dados = !possuiFolhaPonto && motivoPonto
    ? { ...d, folha_ponto_dispensa_justificativa: motivoPonto }
    : d;

  return {
    itemId: item.id,
    nome,
    apta: true,
    envio: {
      dados,
      cargoId: cargo.id,
      unidadeId: ctx.unidadeId,
      setorId: v?.setorId ?? null,
      regime,
      formaPagamento,
      possuiFolhaPonto,
      optanteAdiantamento,
      jornada: jornada.vazia ? null : jornada,
      turnoId,
      assinaturaPapel: org?.ajustes?.[item.id]?.assinatura_papel === true,
    },
    divergencias,
    dependentes: dependentesDaFicha(d),
    semAcesso: semDadosAcesso(d),
    intervaloReduzidoLote: !!ctx.padroes.intervaloReduzidoAceito
      && inconformidadesJornada(jornada).some((i) => i.codigo === "intervalo_reduzido"),
  };
}

export function planejarLote(itens: ItemEfetivacao[], org: OrganizacaoLote | null | undefined, ctx: ContextoEfetivacao) {
  const planos = itens
    .filter((i) => ["pendente", "revisar", "duplicado"].includes(i.status))
    .map((i) => planejarFichaLote(i, org, ctx));
  const aptas = planos.filter((p): p is Extract<PlanoFichaLote, { apta: true }> => p.apta);
  const foraDoLote = planos.filter((p): p is Extract<PlanoFichaLote, { apta: false }> => !p.apta);
  return { aptas, foraDoLote, comDivergencia: aptas.filter((p) => p.divergencias.length > 0) };
}
