// ------------------------------------------------------------------
// Domínio: DP → Convocações (novo fluxo: grupo → ocorrência → oferta)
// Lógica PURA de planejamento. Serve para preview, organização visual,
// avisos e diagnóstico ANTES da publicação.
//
// ATENÇÃO: NADA aqui é autoridade de segurança nem de elegibilidade
// definitiva. A publicação (Bloco 2) revalida tudo no backend.
// ------------------------------------------------------------------

import type { RegimeTrabalho } from "@/lib/dp/contrato-policy";

export type ModalidadeConvocacao = "individual" | "aberta";
export type HorarioModo = "horario_unico" | "jornada_individual";
export type Compatibilidade = "integral" | "incompativel";
export type UnidadeRemuneracao = "hora" | "diaria";

/** Regimes convocáveis (espelha a política central dp_regime_convocavel). */
export const REGIMES_CONVOCAVEIS: RegimeTrabalho[] = ["intermitente", "freelancer"] as RegimeTrabalho[];

export function regimeConvocavel(regime: string | null | undefined): boolean {
  if (!regime) return false;
  return (REGIMES_CONVOCAVEIS as string[]).includes(regime);
}

// ---------------------------------------------------------------- datas

export const MINUTOS_DIA = 1440;

/** "HH:MM" → minutos. Aceita "HH:MM:SS". */
export function minutosDoHorario(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Janela em minutos absolutos a partir da meia-noite do dia da ocorrência. */
export function janelaMinutos(args: {
  entrada: string;
  saida: string;
  termina_no_dia_seguinte?: boolean | null;
}): { inicio: number; fim: number } | null {
  const inicio = minutosDoHorario(args.entrada);
  const saida = minutosDoHorario(args.saida);
  if (inicio == null || saida == null) return null;
  const viraDia = args.termina_no_dia_seguinte === true || saida <= inicio;
  const fim = viraDia ? saida + MINUTOS_DIA : saida;
  if (fim <= inicio) return null;
  return { inicio, fim };
}

/** Carga prevista em horas, descontando o intervalo. */
export function cargaPrevistaHoras(args: {
  entrada: string;
  saida: string;
  intervalo_minutos?: number | null;
  termina_no_dia_seguinte?: boolean | null;
}): number {
  const janela = janelaMinutos(args);
  if (!janela) return 0;
  const bruto = janela.fim - janela.inicio;
  const liquido = bruto - Math.max(0, Number(args.intervalo_minutos ?? 0));
  if (liquido <= 0) return 0;
  return Math.round((liquido / 60) * 100) / 100;
}

/**
 * Compatibilidade: só existe "integral" ou "incompativel".
 * A jornada ofertada precisa cobrir integralmente a necessidade.
 */
export function compatibilidadeIntegral(
  necessidade: { entrada: string; saida: string; termina_no_dia_seguinte?: boolean | null },
  oferta: { entrada: string; saida: string; termina_no_dia_seguinte?: boolean | null } | null,
): Compatibilidade {
  if (!oferta) return "incompativel";
  const n = janelaMinutos(necessidade);
  const o = janelaMinutos(oferta);
  if (!n || !o) return "incompativel";
  return o.inicio <= n.inicio && o.fim >= n.fim ? "integral" : "incompativel";
}

/** Dias corridos entre hoje e a data da ocorrência (pode ser negativo). */
export function antecedenciaDias(dataISO: string, agora: Date = new Date()): number {
  const [y, m, d] = dataISO.split("-").map(Number);
  const alvo = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  return Math.round((alvo - hoje) / 86400000);
}

export const ANTECEDENCIA_REFERENCIA_DIAS = 3;

export function foraDaAntecedencia(
  dataISO: string,
  minimoDias: number = ANTECEDENCIA_REFERENCIA_DIAS,
  agora: Date = new Date(),
): boolean {
  return antecedenciaDias(dataISO, agora) < minimoDias;
}

/** Dia útil na V1: segunda a sexta. Feriados ignorados por decisão de produto. */
export function ehDiaUtil(d: Date): boolean {
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

/** Soma dias úteis preservando a hora do dia (sexta 18h + 1 = segunda 18h). */
export function adicionarDiasUteis(base: Date, dias: number): Date {
  const out = new Date(base.getTime());
  let restantes = Math.max(0, Math.floor(dias));
  while (restantes > 0) {
    out.setDate(out.getDate() + 1);
    if (ehDiaUtil(out)) restantes -= 1;
  }
  return out;
}

/**
 * Dois prazos independentes:
 * - prazo_resposta: N dias úteis após a disponibilização;
 * - encerramento_operacional: início previsto da ocorrência.
 * O prazo de resposta NUNCA é encurtado porque a ocorrência começa antes.
 */
export function prazosDaOferta(args: {
  disponibilizadaEm: Date;
  prazoDiasUteis: number;
  inicioPrevisto: Date;
}): { prazo_resposta: Date; encerramento_operacional: Date; encerra_primeiro: "prazo_resposta" | "inicio_ocorrencia" } {
  const prazo = adicionarDiasUteis(args.disponibilizadaEm, args.prazoDiasUteis);
  return {
    prazo_resposta: prazo,
    encerramento_operacional: args.inicioPrevisto,
    encerra_primeiro:
      prazo.getTime() <= args.inicioPrevisto.getTime() ? "prazo_resposta" : "inicio_ocorrencia",
  };
}

// ---------------------------------------------------------------- Option A

export interface OcorrenciaOrdenavel {
  id: string;
  data: string;
  necessidade_entrada: string;
  necessidade_saida: string;
  cargo_id: string;
}

/** Ordem determinística da disputa: data → entrada → saída → cargo → id. */
export function ordenarOcorrencias<T extends OcorrenciaOrdenavel>(lista: T[]): T[] {
  return [...lista].sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.necessidade_entrada.localeCompare(b.necessidade_entrada) ||
      a.necessidade_saida.localeCompare(b.necessidade_saida) ||
      a.cargo_id.localeCompare(b.cargo_id) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Option A (V1): uma pessoa ocupa no máximo uma oportunidade por data.
 * A primeira ocorrência elegível (ordem determinística) reserva a pessoa.
 * Preview apenas — o backend refaz a reserva com lock no Bloco 2.
 */
export function reservarPorOptionA<T extends OcorrenciaOrdenavel>(
  ocorrencias: T[],
  candidatosPorOcorrencia: Map<string, string[]>,
): { reservas: Map<string, string[]>; conflitos: { ocorrencia_id: string; colaborador_id: string }[] } {
  const reservas = new Map<string, string[]>();
  const conflitos: { ocorrencia_id: string; colaborador_id: string }[] = [];
  const tomadosPorData = new Map<string, Set<string>>();

  for (const oc of ordenarOcorrencias(ocorrencias)) {
    const tomados = tomadosPorData.get(oc.data) ?? new Set<string>();
    const aceitos: string[] = [];
    for (const colaboradorId of candidatosPorOcorrencia.get(oc.id) ?? []) {
      if (tomados.has(colaboradorId)) {
        conflitos.push({ ocorrencia_id: oc.id, colaborador_id: colaboradorId });
        continue;
      }
      tomados.add(colaboradorId);
      aceitos.push(colaboradorId);
    }
    tomadosPorData.set(oc.data, tomados);
    reservas.set(oc.id, aceitos);
  }

  return { reservas, conflitos };
}

// ---------------------------------------------------------------- remuneração

export interface RemuneracaoDiagnostico {
  elegivel: boolean;
  unidade: UnidadeRemuneracao | null;
  valor_unitario: number | null;
  mensagem: string | null;
}

/**
 * V1: nunca converter salário mensal, nunca usar o piso do cargo como
 * hora/diária. Freelancer mensalista não é elegível a convocações.
 */
export function diagnosticarRemuneracao(colaborador: {
  nome?: string | null;
  regime: string | null | undefined;
  forma_pagamento: string | null | undefined;
  valor_hora: number | null | undefined;
  valor_diaria: number | null | undefined;
}): RemuneracaoDiagnostico {
  const nome = colaborador.nome?.trim() || "O trabalhador";

  if (!regimeConvocavel(colaborador.regime)) {
    return {
      elegivel: false,
      unidade: null,
      valor_unitario: null,
      mensagem: `${nome} não tem vínculo convocável (apenas intermitente ou freelancer).`,
    };
  }

  const forma = colaborador.forma_pagamento ?? null;

  if (forma === "diarista") {
    const valor = Number(colaborador.valor_diaria ?? 0);
    if (!(valor > 0)) {
      return {
        elegivel: false,
        unidade: "diaria",
        valor_unitario: null,
        mensagem: `${nome} é diarista e ainda não tem valor da diária cadastrado.`,
      };
    }
    return { elegivel: true, unidade: "diaria", valor_unitario: valor, mensagem: null };
  }

  if (forma === "horista") {
    const valor = Number(colaborador.valor_hora ?? 0);
    if (!(valor > 0)) {
      return {
        elegivel: false,
        unidade: "hora",
        valor_unitario: null,
        mensagem: `${nome} é horista e ainda não tem valor da hora cadastrado.`,
      };
    }
    return { elegivel: true, unidade: "hora", valor_unitario: valor, mensagem: null };
  }

  if (colaborador.regime === "intermitente") {
    const valor = Number(colaborador.valor_hora ?? 0);
    if (!(valor > 0)) {
      return {
        elegivel: false,
        unidade: "hora",
        valor_unitario: null,
        mensagem: `${nome} é intermitente e precisa de valor da hora cadastrado.`,
      };
    }
    return { elegivel: true, unidade: "hora", valor_unitario: valor, mensagem: null };
  }

  return {
    elegivel: false,
    unidade: null,
    valor_unitario: null,
    mensagem: `${nome} está como mensalista — configure hora ou diária para convocar.`,
  };
}

/** Valor previsto da oferta (informativo; não gera folha nem financeiro). */
export function valorPrevisto(
  diagnostico: RemuneracaoDiagnostico,
  quantidadePrevista: number,
): number | null {
  if (!diagnostico.elegivel || diagnostico.valor_unitario == null) return null;
  const qtd = diagnostico.unidade === "diaria" ? 1 : Math.max(0, quantidadePrevista);
  return Math.round(diagnostico.valor_unitario * qtd * 100) / 100;
}

// ---------------------------------------------------------------- elegibilidade (preview)

export interface CandidatoPreview {
  colaborador_id: string;
  nome: string;
  regime: string | null;
  compatibilidade: Compatibilidade;
  elegivel: boolean;
  motivos: string[];
  remuneracao: RemuneracaoDiagnostico;
}

export interface ColaboradorParaPreview {
  id: string;
  nome: string;
  regime: string | null;
  ativo: boolean | null;
  cargo_id: string | null;
  unidade_id: string | null;
  forma_pagamento: string | null;
  valor_hora: number | null;
  valor_diaria: number | null;
  /** Jornada habitual resolvida para o dia (quando houver). */
  jornada: { entrada: string; saida: string; termina_no_dia_seguinte?: boolean | null } | null;
}

/**
 * Pré-análise de elegibilidade (preview). NÃO é autoridade de segurança:
 * o backend revalida empresa, vínculo, papel, conflitos e regras no Bloco 2.
 */
export function avaliarCandidatos(args: {
  colaboradores: ColaboradorParaPreview[];
  cargoId: string;
  unidadeId: string;
  necessidade: { entrada: string; saida: string; termina_no_dia_seguinte?: boolean | null };
  horarioModo: HorarioModo;
  indisponiveis?: Set<string>;
  jaAlocados?: Set<string>;
}): CandidatoPreview[] {
  const out: CandidatoPreview[] = [];

  for (const c of args.colaboradores) {
    const motivos: string[] = [];

    if (c.ativo === false) motivos.push("Cadastro inativo");
    if (!regimeConvocavel(c.regime)) motivos.push("Vínculo não convocável");
    if (c.cargo_id !== args.cargoId) motivos.push("Cargo diferente do solicitado");
    if (c.unidade_id && c.unidade_id !== args.unidadeId) motivos.push("Outra unidade");
    if (args.indisponiveis?.has(c.id)) motivos.push("Marcou indisponibilidade nesta data");
    if (args.jaAlocados?.has(c.id)) motivos.push("Já tem alocação nesta data");

    const ofertada =
      args.horarioModo === "horario_unico" ? args.necessidade : c.jornada;

    if (args.horarioModo === "jornada_individual" && !c.jornada) {
      motivos.push("Sem jornada cadastrada para esta data");
    }

    const compat = compatibilidadeIntegral(args.necessidade, ofertada ?? null);
    if (compat !== "integral") motivos.push("Jornada não cobre integralmente a necessidade");

    const remuneracao = diagnosticarRemuneracao({
      nome: c.nome,
      regime: c.regime,
      forma_pagamento: c.forma_pagamento,
      valor_hora: c.valor_hora,
      valor_diaria: c.valor_diaria,
    });
    if (!remuneracao.elegivel && remuneracao.mensagem) motivos.push(remuneracao.mensagem);

    out.push({
      colaborador_id: c.id,
      nome: c.nome,
      regime: c.regime,
      compatibilidade: compat,
      elegivel: motivos.length === 0,
      motivos,
      remuneracao,
    });
  }

  return out.sort((a, b) => Number(b.elegivel) - Number(a.elegivel) || a.nome.localeCompare(b.nome));
}

// ---------------------------------------------------------------- cobertura

export interface CoberturaDoDia {
  minimo: number | null;
  confirmados: number;
  aguardando: number;
  faltam: number | null;
}

/**
 * Pendente NUNCA conta como confirmado. Sem mínimo cadastrado, "faltam" é nulo.
 */
export function coberturaDoDia(args: {
  minimo?: number | null;
  confirmados: number;
  aguardando: number;
}): CoberturaDoDia {
  const minimo = args.minimo != null && args.minimo > 0 ? args.minimo : null;
  return {
    minimo,
    confirmados: args.confirmados,
    aguardando: args.aguardando,
    faltam: minimo == null ? null : Math.max(0, minimo - args.confirmados),
  };
}

// ---------------------------------------------------------------- validação estrutural do rascunho

export interface RascunhoGrupo {
  unidade_id: string | null;
  competencia: string | null;
  modalidade: ModalidadeConvocacao | null;
}

export interface RascunhoOcorrencia {
  id: string;
  cargo_id: string | null;
  data: string | null;
  necessidade_entrada: string | null;
  necessidade_saida: string | null;
  /** Virada de dia da NECESSIDADE (janela que a operação precisa cobrir). */
  necessidade_termina_no_dia_seguinte: boolean;
  horario_modo: HorarioModo;
  entrada: string | null;
  saida: string | null;
  intervalo_minutos: number | null;
  /** Virada de dia do HORÁRIO OFERTADO (campo próprio no schema). */
  termina_no_dia_seguinte: boolean;
  vagas: number;
  colaborador_alvo_id: string | null;
  /** updated_at da linha já gravada — habilita controle otimista na edição. */
  expected_updated_at?: string | null;
}


const COMPETENCIA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** O grupo só pode ser gravado quando tiver unidade, competência e modalidade. */
export function grupoPersistivel(g: RascunhoGrupo): boolean {
  return !!g.unidade_id && !!g.competencia && COMPETENCIA_RE.test(g.competencia) && !!g.modalidade;
}

/**
 * A ocorrência só pode ser gravada quando estiver estruturalmente completa —
 * inclusive a coerência de horário exigida pelo banco e o alvo do Individual.
 * Nunca inventar modalidade nem horário só para conseguir gravar.
 */
export function ocorrenciaPersistivel(
  o: RascunhoOcorrencia,
  modalidade: ModalidadeConvocacao | null,
): boolean {
  if (!o.cargo_id || !o.data || !o.necessidade_entrada || !o.necessidade_saida) return false;
  if (!janelaMinutos({
    entrada: o.necessidade_entrada,
    saida: o.necessidade_saida,
    termina_no_dia_seguinte: o.necessidade_termina_no_dia_seguinte,
  })) return false;
  if (!(o.vagas >= 1)) return false;

  if (o.horario_modo === "horario_unico") {
    if (!o.entrada || !o.saida || o.intervalo_minutos == null) return false;
    if (cargaPrevistaHoras({
      entrada: o.entrada,
      saida: o.saida,
      intervalo_minutos: o.intervalo_minutos,
      termina_no_dia_seguinte: o.necessidade_termina_no_dia_seguinte,
    }) <= 0) return false;
  }

  if (modalidade === "individual") {
    if (!o.colaborador_alvo_id) return false;
    if (o.vagas !== 1) return false;
  }
  if (modalidade === "aberta" && o.colaborador_alvo_id) return false;

  return true;
}

/** Payload da ocorrência conforme o modo de horário (sem campos fictícios). */
export function payloadHorario(o: RascunhoOcorrencia) {
  if (o.horario_modo === "jornada_individual") {
    return {
      horario_modo: "jornada_individual" as const,
      entrada: null,
      saida: null,
      intervalo_minutos: null,
      termina_no_dia_seguinte: null,
      carga_prevista_horas: null,
    };
  }
  return {
    horario_modo: "horario_unico" as const,
    entrada: o.entrada,
    saida: o.saida,
    intervalo_minutos: o.intervalo_minutos ?? 0,
    termina_no_dia_seguinte: o.necessidade_termina_no_dia_seguinte,
    carga_prevista_horas: cargaPrevistaHoras({
      entrada: o.entrada!,
      saida: o.saida!,
      intervalo_minutos: o.intervalo_minutos,
      termina_no_dia_seguinte: o.necessidade_termina_no_dia_seguinte,
    }),
  };
}
