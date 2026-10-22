/**
 * Motor puro de simulação de aviso prévio e término de vínculo.
 *
 * Sem banco, sem rede, sem relógio: tudo vem dos parâmetros. Nunca grava,
 * nunca solicita folga, nunca registra desligamento.
 *
 * Cobertura por motivo (regime CLT):
 * - dispensa_sem_justa_causa: aviso proporcional (30 + 3/ano, teto 90),
 *   cumprimento limitado a 30 dias, redução do art. 488 (2h/dia ou 7 dias).
 * - pedido_demissao: 30 dias fixos (art. 487 §2º), SEM redução do art. 488;
 *   a empresa pode dispensar o cumprimento (liberalidade) com término na data
 *   acordada — descontar ou não o aviso é decisão registrada, sem prova de
 *   novo emprego (Súmula 276 só se aplica ao aviso dado pelo EMPREGADOR).
 * - acordo_mutuo (art. 484-A, I, "a"): a redução pela metade vale SÓ para o
 *   aviso indenizado. Trabalhado: 30 dias cumpridos, sem redução do art. 488
 *   (redação específica para dispensa pelo empregador); eventual projeção
 *   proporcional depende de validação jurídica e não é calculada.
 * - dispensa_com_justa_causa, termino_contrato, abandono_emprego,
 *   aposentadoria, falecimento, outro: sem aviso prévio; a data informada é o
 *   término do vínculo e o prazo de quitação conta dela (art. 477 §6º).
 *
 * Fontes: CLT arts. 477 §6º, 484-A, 487, 488; Lei 12.506/2011; Súmulas 276 e
 * 380 TST; CC art. 132. Minutos inteiros; datas ISO "AAAA-MM-DD" em UTC.
 */

import { prazoLegalRescisao, prazoPagamentoRescisao } from "./desligamento-datas.ts";

export type ModalidadeAviso = "trabalhado" | "indenizado";
export type ReducaoArt488 = "duas_horas" | "sete_dias";

export type MotivoDesligamentoCalc =
  | "dispensa_sem_justa_causa"
  | "pedido_demissao"
  | "acordo_mutuo"
  | "dispensa_com_justa_causa"
  | "termino_contrato"
  | "abandono_emprego"
  | "aposentadoria"
  | "falecimento"
  | "outro";

/** Motivos sem aviso prévio: a data da comunicação é o próprio término. */
export const MOTIVOS_SEM_AVISO: ReadonlySet<MotivoDesligamentoCalc> = new Set([
  "dispensa_com_justa_causa",
  "termino_contrato",
  "abandono_emprego",
  "aposentadoria",
  "falecimento",
  "outro",
]);

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
  /** Motivo do desligamento; padrão: dispensa sem justa causa pela empresa. */
  motivo?: MotivoDesligamentoCalc;
  /** Obrigatória quando trabalhado na dispensa pela empresa (art. 488). Não se aplica ao pedido de demissão. */
  reducao?: ReducaoArt488 | null;
  /**
   * Pedido de demissão com dispensa do cumprimento: data acordada do término
   * (entre a comunicação e o fim dos 30 dias). Vazio = término na comunicação.
   */
  dataTerminoAcordada?: string | null;
  /**
   * Pedido de demissão dispensado: a empresa optou por descontar o aviso.
   * Só registro — não altera datas nem calcula valores.
   */
  descontarAviso?: boolean;
  /** Jornada em minutos por dia da semana, índice 0 = domingo. 0 = sem expediente. */
  jornadaSemanal: [number, number, number, number, number, number, number];
  /** Ajustes pontuais de jornada (escala), sobrepõem a semana. */
  excecoesJornada?: { data: string; minutos: number }[];
  /** Feriados — sem expediente. */
  feriados?: string[];
  /** Datas de folga compensatória (hipotéticas na calculadora; aprovadas no servidor). */
  folgasCompensatorias?: string[];
  /** Saldo positivo do banco de horas, em minutos. */
  saldoBancoMinutos?: number;
}

export interface ResultadoDesligamento {
  motivo: MotivoDesligamentoCalc;
  /** true nos motivos sem aviso prévio: a comunicação é o término. */
  semAviso: boolean;
  /** true no pedido de demissão em que a empresa dispensou o cumprimento. */
  avisoDispensado: boolean;
  /** Pedido dispensado: opção de desconto registrada (null nos demais). */
  descontarAviso: boolean | null;
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
  /** Data efetiva de término do vínculo (fim do cumprimento, data acordada ou comunicação). */
  dataEfetiva: string;
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
  /** Indenizado/dispensado: data a partir da qual o empregado fica dispensado de comparecer (D+1). Null no trabalhado. */
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
/** Diferença em dias corridos (b - a). */
const diffDias = (a: string, b: string) => Math.round((parse(b)!.getTime() - parse(a)!.getTime()) / 86_400_000);

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
const DIAS_PEDIDO_DEMISSAO = 30;

export function simularDesligamento(p: ParametrosDesligamento): ResultadoOuErro {
  const motivo: MotivoDesligamentoCalc = p.motivo ?? "dispensa_sem_justa_causa";
  if (!parse(p.dataAdmissao)) return { erro: "Data de admissão inválida." };
  if (!parse(p.dataComunicacao)) return { erro: "Data de comunicação inválida." };
  if (p.dataComunicacao < p.dataAdmissao) return { erro: "A comunicação não pode ser anterior à admissão." };
  if (p.jornadaSemanal.length !== 7 || p.jornadaSemanal.some((m) => !Number.isInteger(m) || m < 0 || m > 1440))
    return { erro: "Jornada semanal inválida." };
  if (motivo === "pedido_demissao" && p.reducao)
    return { erro: "A redução do art. 488 (2 horas ou 7 dias) não se aplica ao pedido de demissão." };
  if (motivo === "acordo_mutuo" && p.reducao)
    return { erro: "A redução do art. 488 tem redação específica para a dispensa pelo empregador e não se aplica automaticamente ao acordo mútuo. Se as partes combinaram redução, registre com validação jurídica." };
  if (motivo !== "pedido_demissao" && p.modalidade === "trabalhado" && !p.reducao && !MOTIVOS_SEM_AVISO.has(motivo))
    return { erro: "Informe a redução do art. 488: duas horas diárias ou sete dias corridos." };
  const saldoInicial = Math.max(0, Math.round(p.saldoBancoMinutos ?? 0));
  const feriados = new Set(p.feriados ?? []);
  const anos = anosCompletos(p.dataAdmissao, p.dataComunicacao);
  const inicio = somarDias(p.dataComunicacao, 1); // Súmula 380: exclui o dia da comunicação, sem adiar

  const fechar = (r: Omit<ResultadoDesligamento, "motivo" | "prazoQuitacao" | "sugestaoPagamentoDiaUtilAnterior">): ResultadoDesligamento => ({
    motivo,
    ...r,
    prazoQuitacao: prazoLegalRescisao(r.baseQuitacao),
    sugestaoPagamentoDiaUtilAnterior: prazoPagamentoRescisao(r.baseQuitacao, feriados),
  });

  // ---- Motivos sem aviso prévio: a data informada é o término do vínculo.
  if (MOTIVOS_SEM_AVISO.has(motivo)) {
    const avisosSemAviso = ["Sem aviso prévio neste motivo: a data informada é o término do vínculo e o prazo de quitação conta dela."];
    if (motivo === "abandono_emprego" || motivo === "aposentadoria" || motivo === "outro")
      avisosSemAviso.push(
        "Este motivo exige determinação factual ou jurídica (ex.: abandono caracterizado, aposentadoria que de fato encerra o vínculo). A data-base informada foi confirmada pelo responsável; sem essa confirmação, o registro é recusado.",
      );
    return fechar({
      semAviso: true,
      avisoDispensado: false,
      descontarAviso: null,
      anosCompletos: anos,
      duracaoLegalDias: 0,
      diasProporcionais: 0,
      inicioAviso: p.dataComunicacao,
      fimPeriodoCumprido: null,
      terminoProjetado: p.dataComunicacao,
      diasProjetadosIndenizados: 0,
      periodoReducao: null,
      calendario: [],
      ultimoComparecimento: null,
      jornadasRestantes: 0,
      minutosCompensados: 0,
      saldoResidualMinutos: saldoInicial,
      folgasAceitas: [],
      folgasRejeitadas: [],
      dataEfetiva: p.dataComunicacao,
      baseQuitacao: p.dataComunicacao,
      dispensadoDeComparecerDesde: null,
      avisos: ["Sem aviso prévio neste motivo: a data informada é o término do vínculo e o prazo de quitação conta dela."],
    });
  }

  // ---- Duração do aviso por motivo.
  const proporcional = duracaoAvisoProporcional(anos);
  const duracao =
    motivo === "pedido_demissao" ? DIAS_PEDIDO_DEMISSAO
    : motivo === "acordo_mutuo" ? Math.ceil(proporcional / 2) // art. 484-A: metade
    : proporcional;
  const terminoProjetado = somarDias(p.dataComunicacao, duracao);
  const avisos: string[] = [];

  // ---- Pedido de demissão com dispensa do cumprimento concedida pela empresa.
  if (motivo === "pedido_demissao" && p.modalidade === "indenizado") {
    const acordada = p.dataTerminoAcordada ?? null;
    if (acordada && !parse(acordada)) return { erro: "Data de término acordada inválida." };
    if (acordada && acordada < p.dataComunicacao) return { erro: "O término acordado não pode ser anterior ao pedido." };
    if (acordada && acordada > terminoProjetado) return { erro: "O término acordado não pode passar do fim dos 30 dias de aviso." };
    const efetiva = acordada ?? p.dataComunicacao;
    for (const f of p.folgasCompensatorias ?? []) void f; // sem jornadas: folgas não se aplicam
    avisos.push(
      "A dispensa do cumprimento é liberalidade da empresa e não exige comprovação de novo emprego.",
      p.descontarAviso
        ? "Desconto do aviso registrado: o desconto no pedido de demissão é tema controverso — confirme com a contabilidade ou o jurídico antes de aplicar."
        : "Sem desconto do aviso: opção registrada pela empresa. O tratamento das verbas depende de conferência da contabilidade; a AVETO calcula datas do processo.",
    );
    return fechar({
      semAviso: false,
      avisoDispensado: true,
      descontarAviso: p.descontarAviso === true,
      anosCompletos: anos,
      duracaoLegalDias: duracao,
      diasProporcionais: 0,
      inicioAviso: inicio,
      fimPeriodoCumprido: null,
      terminoProjetado,
      diasProjetadosIndenizados: diffDias(efetiva, terminoProjetado),
      periodoReducao: null,
      calendario: [],
      ultimoComparecimento: null,
      jornadasRestantes: 0,
      minutosCompensados: 0,
      saldoResidualMinutos: saldoInicial,
      folgasAceitas: [],
      folgasRejeitadas: (p.folgasCompensatorias ?? []).map((f) => ({ data: f, motivo: "aviso_indenizado" as const })),
      dataEfetiva: efetiva,
      baseQuitacao: efetiva,
      dispensadoDeComparecerDesde: inicio,
      avisos,
    });
  }

  const excecoes = new Map((p.excecoesJornada ?? []).map((e) => [e.data, Math.max(0, Math.round(e.minutos))]));

  // Precedência: escala explícita do dia (trabalho > 0 ou folga = 0) vale sobre
  // o feriado — food service trabalha em feriado. Sem escala, feriado = sem jornada.
  // Só afeta o último comparecimento; prazo e sugestão seguem o calendário de feriados.
  const jornadaDe = (iso: string) => {
    if (excecoes.has(iso)) return excecoes.get(iso)!;
    if (feriados.has(iso)) return 0;
    return p.jornadaSemanal[diaSemana(iso)];
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
    // Dispensa pela empresa: cumprimento limitado a 30 dias (proporcional indenizado).
    // Pedido de demissão e acordo mútuo: cumpre-se a duração apurada, sem teto de 30.
    const diasCumpridos = motivo === "dispensa_sem_justa_causa" ? Math.min(PERIODO_TRABALHADO_MAX, duracao) : duracao;
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
      avisos.push("Folgas compensatórias dependem de acordo entre as partes e não quitam o banco automaticamente.");
  }

  const trabalho = calendario.filter((d) => d.classificacao === "trabalho_previsto");
  const ultimo = trabalho.length ? trabalho[trabalho.length - 1].data : null;
  if (p.modalidade === "trabalhado" && !ultimo) avisos.push("Não há jornadas previstas no período do aviso.");

  // Quitação: 10 dias a partir do término do contrato (art. 477 §6º).
  // Trabalhado: fim do período cumprido; indenizado: afastamento na data da comunicação.
  const baseQuitacao = fimCumprido ?? p.dataComunicacao;

  return fechar({
    semAviso: false,
    avisoDispensado: false,
    descontarAviso: null,
    anosCompletos: anos,
    duracaoLegalDias: duracao,
    diasProporcionais: Math.max(0, duracao - 30),
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
    dataEfetiva: baseQuitacao,
    baseQuitacao,
    dispensadoDeComparecerDesde: p.modalidade === "indenizado" ? inicio : null,
    avisos,
  });
}
