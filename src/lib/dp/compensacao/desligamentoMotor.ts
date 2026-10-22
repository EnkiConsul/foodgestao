/**
 * Motor puro de simulação de aviso prévio — dispensa sem justa causa por
 * iniciativa do empregador (Etapa 3.2).
 *
 * Sem banco, sem rede, sem relógio: tudo vem dos parâmetros. Nunca grava,
 * nunca solicita folga, nunca registra desligamento.
 *
 * Fontes: CLT arts. 487, 488 e 477 §6º; Lei 12.506/2011; Súmula 380 TST;
 * CC art. 132. Minutos inteiros; datas ISO "AAAA-MM-DD" tratadas em UTC.
 */

import { prazoLegalRescisao, prazoPagamentoRescisao } from "@/lib/dp/desligamento";

export type ModalidadeAviso = "trabalhado" | "indenizado";
export type ReducaoArt488 = "duas_horas" | "sete_dias";

export type ClassificacaoDia =
  | "folga_regular" // DSR, dia sem expediente ou feriado
  | "ausencia_legal_aviso" // 7 dias corridos do art. 488, parágrafo único
  | "folga_compensatoria" // simulação hipotética abatendo banco de horas
  | "trabalho_previsto";

export interface DiaAviso {
  data: string;
  /** 1..N dentro do aviso (contagem a partir de D+1). */
  numero: number;
  classificacao: ClassificacaoDia;
  /** Jornada habitual do dia (antes da redução legal). */
  jornadaHabitual: number;
  /** Jornada exigida após a redução legal (0 quando não há presença). */
  jornadaPrevista: number;
  /** Minutos do banco de horas abatidos neste dia. */
  minutosCompensados: number;
}

export type MotivoRejeicao =
  | "data_invalida"
  | "duplicada"
  | "fora_do_periodo_trabalhado"
  | "dia_sem_jornada"
  | "dia_de_ausencia_legal"
  | "excede_saldo"
  | "aviso_indenizado";

export interface FolgaRejeitada {
  data: string;
  motivo: MotivoRejeicao;
}

export interface ParametrosDesligamento {
  dataAdmissao: string;
  dataComunicacao: string;
  modalidade: ModalidadeAviso;
  /** Obrigatória quando trabalhado (art. 488 — escolha do empregado). */
  reducao?: ReducaoArt488 | null;
  /** Jornada em minutos por dia da semana, índice 0 = domingo. 0 = sem expediente. */
  jornadaSemanal: [number, number, number, number, number, number, number];
  /** Ajustes pontuais de jornada (escala), sobrepõem a semana. */
  excecoesJornada?: { data: string; minutos: number }[];
  /** Feriados — sem expediente. */
  feriados?: string[];
  /** Datas hipotéticas de folga compensatória. */
  folgasCompensatorias?: string[];
  /** Saldo positivo do banco de horas, em minutos. */
  saldoBancoMinutos?: number;
}

export interface ResultadoDesligamento {
  anosCompletos: number;
  duracaoLegalDias: number;
  /** Dias proporcionais (Lei 12.506) acima dos 30. */
  diasProporcionais: number;
  inicioAviso: string;
  /** Fim do período de aviso efetivamente cumprido (trabalhado) ou da comunicação (indenizado). */
  fimPeriodoCumprido: string | null;
  /** Data de término com a projeção integral do aviso (art. 487 §1º; anotação na CTPS). */
  terminoProjetado: string;
  /** Dias projetados (indenizados) além do período cumprido. */
  diasProjetadosIndenizados: number;
  /** Período da ausência legal de 7 dias, quando escolhida. */
  periodoReducao: { inicio: string; fim: string } | null;
  calendario: DiaAviso[];
  ultimoComparecimento: string | null;
  jornadasRestantes: number;
  minutosCompensados: number;
  saldoResidualMinutos: number;
  folgasAceitas: string[];
  folgasRejeitadas: FolgaRejeitada[];
  /** Data-base da contagem do prazo de quitação. */
  baseQuitacao: string;
  /** Base + 10 dias corridos (art. 477 §6º). */
  prazoQuitacao: string;
  /**
   * Sugestão operacional SÓ para a empresa: último dia útil anterior quando o
   * 10º dia cai em sábado, domingo ou feriado informado. Nunca substitui
   * `prazoQuitacao` nem é limite legal.
   */
  sugestaoPagamentoDiaUtilAnterior: string;
  /** Indenizado: data a partir da qual o empregado fica dispensado de comparecer (D+1). Null no trabalhado. */
  dispensadoDeComparecerDesde: string | null;
  avisos: string[];
}

export type ResultadoOuErro = ResultadoDesligamento | { erro: string };

/* ------------------------------------------------------------------ datas */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parse(d: string): Date | null {
  if (!ISO.test(d)) return null;
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== d ? null : dt;
}
const fmt = (d: Date) => d.toISOString().slice(0, 10);
export function somarDias(iso: string, n: number): string {
  const d = parse(iso)!;
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}
const diaSemana = (iso: string) => parse(iso)!.getUTCDay();

/** Anos completos entre admissão e comunicação (aniversário exato). */
export function anosCompletos(admissao: string, comunicacao: string): number {
  const a = parse(admissao)!;
  const c = parse(comunicacao)!;
  let anos = c.getUTCFullYear() - a.getUTCFullYear();
  const antesDoAniversario =
    c.getUTCMonth() < a.getUTCMonth() ||
    (c.getUTCMonth() === a.getUTCMonth() && c.getUTCDate() < a.getUTCDate());
  if (antesDoAniversario) anos -= 1;
  return Math.max(0, anos);
}

/** Lei 12.506/2011: 30 dias + 3 por ano completo, teto 90. */
export function duracaoAvisoProporcional(anos: number): number {
  return 30 + Math.min(60, Math.max(0, Math.floor(anos)) * 3);
}

/* ------------------------------------------------------------------ motor */

const PERIODO_TRABALHADO_MAX = 30;
const REDUCAO_DIARIA = 120;
const DIAS_AUSENCIA_LEGAL = 7;

export function simularDesligamento(p: ParametrosDesligamento): ResultadoOuErro {
  if (!parse(p.dataAdmissao)) return { erro: "Data de admissão inválida." };
  if (!parse(p.dataComunicacao)) return { erro: "Data de comunicação inválida." };
  if (p.dataComunicacao < p.dataAdmissao) return { erro: "A comunicação não pode ser anterior à admissão." };
  if (p.jornadaSemanal.length !== 7 || p.jornadaSemanal.some((m) => !Number.isInteger(m) || m < 0 || m > 1440))
    return { erro: "Jornada semanal inválida." };
  if (p.modalidade === "trabalhado" && !p.reducao)
    return { erro: "Informe a redução do art. 488: duas horas diárias ou sete dias corridos." };
  const saldoInicial = Math.max(0, Math.round(p.saldoBancoMinutos ?? 0));

  const anos = anosCompletos(p.dataAdmissao, p.dataComunicacao);
  const duracao = duracaoAvisoProporcional(anos);
  const inicio = somarDias(p.dataComunicacao, 1); // Súmula 380: exclui o dia da comunicação, sem adiar
  const terminoProjetado = somarDias(p.dataComunicacao, duracao);
  const feriados = new Set(p.feriados ?? []);
  const excecoes = new Map((p.excecoesJornada ?? []).map((e) => [e.data, Math.max(0, Math.round(e.minutos))]));
  const avisos: string[] = [];

  const jornadaDe = (iso: string) => {
    if (feriados.has(iso)) return 0;
    return excecoes.has(iso) ? excecoes.get(iso)! : p.jornadaSemanal[diaSemana(iso)];
  };

  const rejeitadas: FolgaRejeitada[] = [];
  const aceitas: string[] = [];
  const calendario: DiaAviso[] = [];
  let periodoReducao: ResultadoDesligamento["periodoReducao"] = null;
  let fimCumprido: string | null = null;
  let diasProjetados = duracao;
  let compensados = 0;

  if (p.modalidade === "indenizado") {
    for (const f of p.folgasCompensatorias ?? []) rejeitadas.push({ data: f, motivo: "aviso_indenizado" });
    avisos.push("Aviso indenizado: não há jornadas no período; todo o aviso é projetado.");
  } else {
    const diasCumpridos = Math.min(PERIODO_TRABALHADO_MAX, duracao);
    fimCumprido = somarDias(p.dataComunicacao, diasCumpridos);
    diasProjetados = duracao - diasCumpridos;
    if (diasProjetados > 0)
      avisos.push(
        `Os ${diasProjetados} dias proporcionais foram tratados como indenizados (cumprimento limitado a 30 dias). Exigir o trabalho desses dias depende de convenção coletiva ou análise jurídica.`,
      );
    if (p.reducao === "sete_dias")
      periodoReducao = { inicio: somarDias(fimCumprido, -(DIAS_AUSENCIA_LEGAL - 1)), fim: fimCumprido };

    for (let n = 1; n <= diasCumpridos; n++) {
      const data = somarDias(p.dataComunicacao, n);
      const habitual = jornadaDe(data);
      const ausencia = !!periodoReducao && data >= periodoReducao.inicio;
      let classificacao: ClassificacaoDia;
      let prevista = 0;
      if (ausencia) classificacao = "ausencia_legal_aviso"; // prevalece sobre folga regular: dia corrido
      else if (habitual === 0) classificacao = "folga_regular";
      else {
        classificacao = "trabalho_previsto";
        prevista = p.reducao === "duas_horas" ? Math.max(0, habitual - REDUCAO_DIARIA) : habitual;
        if (prevista === 0) classificacao = "folga_regular";
      }
      calendario.push({ data, numero: n, classificacao, jornadaHabitual: habitual, jornadaPrevista: prevista, minutosCompensados: 0 });
    }

    // Folgas compensatórias em ordem cronológica, consumindo saldo; nunca dupla contagem.
    const porData = new Map(calendario.map((d) => [d.data, d]));
    const vistas = new Set<string>();
    let saldo = saldoInicial;
    const pedidas = [...(p.folgasCompensatorias ?? [])].sort();
    for (const f of pedidas) {
      if (!parse(f)) { rejeitadas.push({ data: f, motivo: "data_invalida" }); continue; }
      if (vistas.has(f)) { rejeitadas.push({ data: f, motivo: "duplicada" }); continue; }
      vistas.add(f);
      const dia = porData.get(f);
      if (!dia) { rejeitadas.push({ data: f, motivo: "fora_do_periodo_trabalhado" }); continue; }
      if (dia.classificacao === "ausencia_legal_aviso") { rejeitadas.push({ data: f, motivo: "dia_de_ausencia_legal" }); continue; }
      if (dia.classificacao !== "trabalho_previsto") { rejeitadas.push({ data: f, motivo: "dia_sem_jornada" }); continue; }
      if (dia.jornadaPrevista > saldo) { rejeitadas.push({ data: f, motivo: "excede_saldo" }); continue; }
      saldo -= dia.jornadaPrevista;
      compensados += dia.jornadaPrevista;
      dia.minutosCompensados = dia.jornadaPrevista;
      dia.jornadaPrevista = 0;
      dia.classificacao = "folga_compensatoria";
      aceitas.push(f);
    }
    if (aceitas.length || (p.folgasCompensatorias ?? []).length)
      avisos.push("Folgas compensatórias são hipotéticas: dependem de acordo entre as partes e não quitam o banco automaticamente.");
  }

  const trabalho = calendario.filter((d) => d.classificacao === "trabalho_previsto");
  const ultimo = trabalho.length ? trabalho[trabalho.length - 1].data : null;
  if (p.modalidade === "trabalhado" && !ultimo) avisos.push("Não há jornadas previstas no período do aviso.");

  // Quitação: 10 dias a partir do término do contrato (art. 477 §6º).
  // Trabalhado: fim do período cumprido; indenizado: afastamento na data da comunicação.
  const baseQuitacao = fimCumprido ?? p.dataComunicacao;
  // Função canônica única: 10º dia corrido bruto; sugestão recua ao útil anterior.
  const prazo = prazoLegalRescisao(baseQuitacao);
  const sugestao = prazoPagamentoRescisao(baseQuitacao, feriados);

  return {
    anosCompletos: anos,
    duracaoLegalDias: duracao,
    diasProporcionais: duracao - 30,
    inicioAviso: inicio,
    fimPeriodoCumprido: fimCumprido,
    terminoProjetado,
    diasProjetadosIndenizados: diasProjetados,
    periodoReducao,
    calendario,
    ultimoComparecimento: ultimo,
    jornadasRestantes: trabalho.length,
    minutosCompensados: compensados,
    saldoResidualMinutos: saldoInicial - compensados,
    folgasAceitas: aceitas,
    folgasRejeitadas: rejeitadas,
    baseQuitacao,
    prazoQuitacao: prazo,
    sugestaoPagamentoDiaUtilAnterior: sugestao,
    dispensadoDeComparecerDesde: p.modalidade === "indenizado" ? inicio : null,
    avisos,
  };
}
