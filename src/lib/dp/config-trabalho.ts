// ------------------------------------------------------------------
// Domínio: DP → Configuração de trabalho do colaborador (Fase 2)
//
// A configuração responde "como este colaborador trabalha por padrão":
// em quais dias, com qual turno em cada dia e como é a folga semanal.
// A escala (Fase 3) nasce desta configuração, nunca o contrário.
//
// Funções puras — nenhuma dependência de React ou Supabase.
// ------------------------------------------------------------------

import { LIMITE_SEMANAL, DIAS_SEMANA, ORDEM_EXIBICAO, formatarHoras } from "@/lib/dp/jornada-utils";
import { cargaLiquidaHoras, formatarFaixaTurno, type TurnoHorario } from "@/lib/dp/turno-utils";
import { contratoPolicy } from "@/lib/dp/contrato-policy";

/** Turno resolvido para um dia da configuração (turno do dia ou o turno padrão). */
export interface TurnoResolvido extends TurnoHorario {
  id: string;
  nome: string;
  cor?: string | null;
}

export interface DiaConfig {
  dow: number;
  trabalha: boolean;
  /** Turno específico do dia. Quando ausente, vale o turno padrão da configuração. */
  turno_id: string | null;
  /** Horário próprio deste dia (exceção). Quando ausente, vale o horário do turno. */
  entrada?: string | null;
  saida?: string | null;
  intervalo_minutos?: number | null;
}

export interface ConfigTrabalho {
  turno_padrao_id: string | null;
  folga_variavel: boolean;
  folga_fixa_dow: number | null;
  dias: DiaConfig[];
}

export const DOW_LABEL = Object.fromEntries(DIAS_SEMANA.map((d) => [d.v, d.longo])) as Record<number, string>;
export const DOW_CURTO = Object.fromEntries(DIAS_SEMANA.map((d) => [d.v, d.curto])) as Record<number, string>;

/** Semana em branco: todos os dias marcados como trabalhados, sem turno específico. */
export function diasPadrao(): DiaConfig[] {
  return ORDEM_EXIBICAO.map((dow) => ({ dow, trabalha: true, turno_id: null }));
}

/** O dia tem horário próprio gravado (exceção)? */
export function temHorarioProprio(dia: DiaConfig): boolean {
  return !!dia.entrada && !!dia.saida;
}

/** Aplica a folga fixa sobre a semana, garantindo 7 dias e ordem de exibição. */
export function normalizarDias(dias: DiaConfig[], folgaFixaDow?: number | null): DiaConfig[] {
  return ORDEM_EXIBICAO.map((dow) => {
    const atual = dias.find((d) => d.dow === dow);
    const base: DiaConfig = atual
      ? {
        dow,
        trabalha: atual.trabalha,
        turno_id: atual.turno_id,
        entrada: atual.entrada ? String(atual.entrada).slice(0, 5) : null,
        saida: atual.saida ? String(atual.saida).slice(0, 5) : null,
        intervalo_minutos: atual.intervalo_minutos ?? null,
      }
      : { dow, trabalha: true, turno_id: null, entrada: null, saida: null, intervalo_minutos: null };
    if (folgaFixaDow != null && dow === folgaFixaDow) return { ...base, trabalha: false };
    return base;
  });
}

/** Dias de folga derivados dos switches da semana — fonte única da folga fixa. */
export function folgaFixaDerivada(dias: DiaConfig[]): number[] {
  return dias.filter((d) => !d.trabalha).map((d) => d.dow);
}

/**
 * Turno efetivo do dia: o horário próprio do dia (quando houver) sobre o turno
 * específico do dia, senão o turno padrão da configuração.
 */
export function turnoDoDia(
  dia: DiaConfig,
  turnoPadraoId: string | null,
  turnos: TurnoResolvido[],
): TurnoResolvido | null {
  if (!dia.trabalha) return null;
  const id = dia.turno_id ?? turnoPadraoId;
  const base = id ? turnos.find((t) => t.id === id) ?? null : null;
  if (temHorarioProprio(dia)) {
    return {
      id: base?.id ?? `dia:${dia.dow}`,
      nome: base ? `${base.nome} (horário deste dia)` : `Horário de ${DOW_LABEL[dia.dow]}`,
      cor: base?.cor ?? null,
      entrada: String(dia.entrada).slice(0, 5),
      saida: String(dia.saida).slice(0, 5),
      intervalo_minutos: dia.intervalo_minutos ?? base?.intervalo_minutos ?? 0,
    };
  }
  return base;
}

/** De onde saiu o horário que vale para o dia. */
export type OrigemHorarioDia = "proprio" | "turno_do_dia" | "base";

export interface DetalheCargaDia {
  dow: number;
  trabalha: boolean;
  turno: TurnoResolvido | null;
  origem: OrigemHorarioDia | null;
  minutos: number;
}

/**
 * Quebra da carga semanal por dia. Existe para o total ser auditável na tela:
 * um dia sem horário próprio herda o horário base e essa herança precisa ficar
 * visível, senão a diferença no total fica sem explicação.
 */
export function detalharCargaSemanal(
  config: ConfigTrabalho,
  turnos: TurnoResolvido[],
): DetalheCargaDia[] {
  return config.dias.map((dia) => {
    const turno = turnoDoDia(dia, config.turno_padrao_id, turnos);
    const origem: OrigemHorarioDia | null = !dia.trabalha
      ? null
      : temHorarioProprio(dia)
        ? "proprio"
        : dia.turno_id
          ? "turno_do_dia"
          : "base";
    return {
      dow: dia.dow,
      trabalha: dia.trabalha,
      turno,
      origem: turno ? origem : null,
      minutos: turno ? Math.round(cargaLiquidaHoras(turno) * 60) : 0,
    };
  });
}

/** Carga semanal em minutos — soma sem arredondar dia a dia. */
export function cargaSemanalMinutos(config: ConfigTrabalho, turnos: TurnoResolvido[]): number {
  return detalharCargaSemanal(config, turnos).reduce((acc, d) => acc + d.minutos, 0);
}

/**
 * Carga semanal prevista em horas. Acumula minutos e arredonda só no fim: somar
 * horas já arredondadas por dia gerava desvio de minutos no total da semana.
 */
export function cargaSemanalConfig(config: ConfigTrabalho, turnos: TurnoResolvido[]): number {
  return Math.round((cargaSemanalMinutos(config, turnos) / 60) * 100) / 100;
}

export interface BaseDivergente {
  /** Faixa usada pela maioria dos dias trabalhados. */
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  /** Faixa do horário base atual. */
  baseEntrada: string;
  baseSaida: string;
  /** Dias que herdam o horário base e mudariam com o ajuste. */
  diasHerdando: number[];
  /** Quantos dias usam a faixa dominante. */
  diasDominante: number;
}

/**
 * O horário base ficou defasado em relação à semana? Acontece quando a loja
 * mudou de horário, os dias foram atualizados um a um e o base continuou antigo:
 * o dia que herda o base passa a contar horas a menos sem ninguém perceber.
 */
export function baseDivergenteDosDias(
  config: ConfigTrabalho,
  turnos: TurnoResolvido[],
): BaseDivergente | null {
  const detalhes = detalharCargaSemanal(config, turnos);
  const herdando = detalhes.filter((d) => d.origem === "base");
  if (herdando.length === 0) return null;

  const base = herdando[0].turno;
  if (!base) return null;

  const proprios = detalhes.filter((d) => d.origem && d.origem !== "base" && d.turno);
  if (proprios.length === 0) return null;

  const contagem = new Map<string, { turno: TurnoResolvido; n: number }>();
  for (const d of proprios) {
    const t = d.turno!;
    const chave = `${t.entrada}-${t.saida}-${t.intervalo_minutos ?? 0}`;
    const atual = contagem.get(chave);
    if (atual) atual.n += 1;
    else contagem.set(chave, { turno: t, n: 1 });
  }
  const dominante = [...contagem.values()].sort((a, b) => b.n - a.n)[0];
  if (!dominante) return null;

  const igual = dominante.turno.entrada === base.entrada
    && dominante.turno.saida === base.saida
    && (dominante.turno.intervalo_minutos ?? 0) === (base.intervalo_minutos ?? 0);
  if (igual) return null;

  return {
    entrada: dominante.turno.entrada,
    saida: dominante.turno.saida,
    intervalo_minutos: dominante.turno.intervalo_minutos ?? 0,
    baseEntrada: base.entrada,
    baseSaida: base.saida,
    diasHerdando: herdando.map((d) => d.dow),
    diasDominante: dominante.n,
  };
}

export function diasTrabalhados(config: ConfigTrabalho): number[] {
  return config.dias.filter((d) => d.trabalha).map((d) => d.dow);
}

export function diasDeFolga(config: ConfigTrabalho): number[] {
  return config.dias.filter((d) => !d.trabalha).map((d) => d.dow);
}

export interface ValidacaoConfig {
  campo: "dias" | "turno" | "folga" | "carga" | "vigencia";
  nivel: "erro" | "aviso";
  mensagem: string;
}

/**
 * Valida a configuração conforme o contrato do colaborador.
 * Contratos sem validação celetista (PJ/MEI/intermitente) não recebem
 * bloqueio de carga nem exigência de folga semanal.
 */
export function validarConfigTrabalho(
  config: ConfigTrabalho,
  turnos: TurnoResolvido[],
  opts?: { regime?: string | null; vigenciaInicio?: string | null; vigenciaFim?: string | null },
): ValidacaoConfig[] {
  const policy = contratoPolicy(opts?.regime);
  const out: ValidacaoConfig[] = [];
  const trabalhados = diasTrabalhados(config);

  if (trabalhados.length === 0) {
    out.push({ campo: "dias", nivel: "erro", mensagem: "Marque ao menos um dia de trabalho." });
  }

  const semTurno = config.dias.filter(
    (d) => d.trabalha && !turnoDoDia(d, config.turno_padrao_id, turnos),
  );
  if (semTurno.length > 0) {
    out.push({
      campo: "turno",
      nivel: "erro",
      mensagem: `Informe o horário de trabalho em: ${semTurno.map((d) => DOW_CURTO[d.dow]).join(", ")}.`,
    });
  }

  if (policy.exigeFolgaSemanal && !config.folga_variavel && diasDeFolga(config).length === 0) {
    out.push({
      campo: "folga",
      nivel: "erro",
      mensagem: "Defina ao menos um dia de folga na semana ou marque a folga como variável conforme a escala.",
    });
  }

  if (policy.validaCargaSemanal) {
    const carga = cargaSemanalConfig(config, turnos);
    if (carga > LIMITE_SEMANAL) {
      out.push({
        campo: "carga",
        nivel: "erro",
        mensagem: `Carga semanal de ${formatarHoras(carga)} excede o teto da CLT (${LIMITE_SEMANAL}h) em ${formatarHoras(carga - LIMITE_SEMANAL)}.`,
      });
    } else if (carga === LIMITE_SEMANAL) {
      out.push({
        campo: "carga",
        nivel: "aviso",
        mensagem: `Carga semanal de ${formatarHoras(carga)}: é o teto da CLT. Qualquer hora além disso vira hora extra.`,
      });
    } else if (carga > LIMITE_SEMANAL - 4) {
      out.push({
        campo: "carga",
        nivel: "aviso",
        mensagem: `Carga semanal de ${formatarHoras(carga)}: faltam ${formatarHoras(LIMITE_SEMANAL - carga)} para o teto semanal da CLT (${LIMITE_SEMANAL}h).`,
      });
    }
  }


  if (opts?.vigenciaInicio && opts?.vigenciaFim && opts.vigenciaFim < opts.vigenciaInicio) {
    out.push({ campo: "vigencia", nivel: "erro", mensagem: "O fim da vigência é anterior ao início." });
  }

  return out;
}

export function configTemErro(v: ValidacaoConfig[]): boolean {
  return v.some((x) => x.nivel === "erro");
}

/** Texto curto para listas: "Seg–Sáb · 17:00 → 23:00 · folga: domingo". */
export function resumoConfigTexto(config: ConfigTrabalho, turnos: TurnoResolvido[]): string {
  const trabalhados = diasTrabalhados(config);
  if (trabalhados.length === 0) return "Nenhum dia de trabalho definido";

  const partes: string[] = [
    trabalhados.map((d) => DOW_CURTO[d]).join(", "),
  ];

  const usados = new Map<string, TurnoResolvido>();
  for (const dia of config.dias) {
    const t = turnoDoDia(dia, config.turno_padrao_id, turnos);
    if (t) usados.set(t.id, t);
  }
  if (usados.size === 1) {
    const t = [...usados.values()][0];
    partes.push(formatarFaixaTurno(t));
  } else if (usados.size > 1) {
    partes.push(`${usados.size} turnos diferentes`);
  }

  const folgas = diasDeFolga(config);
  if (config.folga_variavel) partes.push("folga variável conforme escala");
  else if (folgas.length) partes.push(`folga: ${folgas.map((d) => DOW_CURTO[d]).join(", ")}`);

  return partes.join(" · ");
}

// ------------------------------------------------------------------
// Horário por dia (edição direta na tela do colaborador)
// ------------------------------------------------------------------

export interface HorarioDia {
  entrada: string;
  saida: string;
  intervalo_minutos: number;
}

/**
 * Horário efetivo mostrado no dia: o horário próprio, quando houver, senão o
 * horário base do colaborador. A tela edita sempre este valor.
 */
export function horarioEfetivoDia(dia: DiaConfig, base: HorarioDia): HorarioDia {
  return {
    entrada: dia.entrada ? String(dia.entrada).slice(0, 5) : base.entrada,
    saida: dia.saida ? String(dia.saida).slice(0, 5) : base.saida,
    intervalo_minutos: dia.intervalo_minutos ?? base.intervalo_minutos ?? 0,
  };
}

/** O dia difere do horário base do colaborador? */
export function diaDivergeDoBase(dia: DiaConfig, base: HorarioDia): boolean {
  if (!temHorarioProprio(dia)) return false;
  const h = horarioEfetivoDia(dia, base);
  return h.entrada !== base.entrada
    || h.saida !== base.saida
    || (h.intervalo_minutos ?? 0) !== (base.intervalo_minutos ?? 0);
}

/** Grava um horário próprio no dia informado. */
export function definirHorarioNoDia(
  dias: DiaConfig[],
  dow: number,
  horario: HorarioDia,
): DiaConfig[] {
  return dias.map((d) => (d.dow === dow
    ? {
      ...d,
      entrada: horario.entrada || null,
      saida: horario.saida || null,
      intervalo_minutos: horario.intervalo_minutos ?? 0,
    }
    : d));
}

/**
 * Repete o horário de um dia nos dias escolhidos. Dias de folga passam a
 * trabalhar com o horário copiado — é o que o usuário espera ao marcá-los.
 */
export function copiarHorarioEntreDias(
  dias: DiaConfig[],
  origemDow: number,
  destinos: number[],
  base: HorarioDia,
): DiaConfig[] {
  const origem = dias.find((d) => d.dow === origemDow);
  if (!origem) return dias;
  const h = horarioEfetivoDia(origem, base);
  const alvo = new Set(destinos.filter((d) => d !== origemDow));
  return dias.map((d) => (alvo.has(d.dow)
    ? {
      ...d,
      trabalha: true,
      entrada: h.entrada || null,
      saida: h.saida || null,
      intervalo_minutos: h.intervalo_minutos ?? 0,
    }
    : d));
}

// ------------------------------------------------------------------
// Grade semanal da unidade
//
// Horário diferente em alguns dias da semana é padrão da operação, não exceção
// pessoal: cada horário vira um horário da loja (dp_turnos) e a grade guarda
// qual horário vale em cada dia.
// ------------------------------------------------------------------

/**
 * O horário próprio do dia é o horário da loja?
 *
 * Não basta existir um turno com esse horário: ao salvar, o sistema cria um
 * turno para qualquer horário digitado, então a simples existência tornaria
 * todo horário exclusivo em "horário da loja". Vale o uso real: quantos colegas
 * da unidade trabalham nesse mesmo horário.
 */
export function diaEhHorarioDaLoja(
  dia: DiaConfig,
  usosPorHorario: Map<string, number>,
  minimoColegas = 1,
): boolean {
  return colegasNoHorarioDoDia(dia, usosPorHorario) >= minimoColegas;
}

/** Quantos colegas usam o horário próprio deste dia (0 quando não há horário). */
export function colegasNoHorarioDoDia(dia: DiaConfig, usosPorHorario: Map<string, number>): number {
  if (!temHorarioProprio(dia)) return 0;
  const e = String(dia.entrada).slice(0, 5);
  const s = String(dia.saida).slice(0, 5);
  const i = Math.max(0, dia.intervalo_minutos ?? 0);
  return usosPorHorario.get(`${e}|${s}|${i}`) ?? 0;
}


export interface GradeDiaSemana {
  dow: number;
  trabalha: boolean;
  turno_id: string | null;
}

/**
 * Traduz uma grade semanal na semana do colaborador: o horário mais usado nos
 * dias trabalhados vira o horário base e os demais dias ficam com o horário da
 * loja do próprio dia.
 */
export function semanaDaGrade(
  grade: GradeDiaSemana[],
  turnos: TurnoResolvido[],
  baseAtual: HorarioDia,
): { dias: DiaConfig[]; base: HorarioDia } {
  const turnoDe = (id: string | null) => (id ? turnos.find((t) => t.id === id) ?? null : null);

  const contagem = new Map<string, number>();
  for (const d of grade) {
    if (!d.trabalha || !d.turno_id) continue;
    contagem.set(d.turno_id, (contagem.get(d.turno_id) ?? 0) + 1);
  }
  const dominanteId = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const dominante = turnoDe(dominanteId);
  const base: HorarioDia = dominante
    ? {
      entrada: String(dominante.entrada).slice(0, 5),
      saida: String(dominante.saida).slice(0, 5),
      intervalo_minutos: dominante.intervalo_minutos ?? 0,
    }
    : baseAtual;

  const dias: DiaConfig[] = ORDEM_EXIBICAO.map((dow) => {
    const g = grade.find((x) => x.dow === dow);
    if (!g || !g.trabalha) {
      return { dow, trabalha: false, turno_id: null, entrada: null, saida: null, intervalo_minutos: null };
    }
    const t = turnoDe(g.turno_id);
    if (!t || g.turno_id === dominanteId) {
      return { dow, trabalha: true, turno_id: null, entrada: null, saida: null, intervalo_minutos: null };
    }
    return {
      dow,
      trabalha: true,
      turno_id: t.id,
      entrada: String(t.entrada).slice(0, 5),
      saida: String(t.saida).slice(0, 5),
      intervalo_minutos: t.intervalo_minutos ?? 0,
    };
  });

  return { dias, base };
}

/**
 * Caminho inverso: a semana montada na tela do colaborador vira uma grade,
 * usando os horários da loja equivalentes a cada dia.
 */
export function gradeDaSemana(
  dias: DiaConfig[],
  base: HorarioDia,
  turnos: TurnoResolvido[],
  turnoBaseId: string | null,
): GradeDiaSemana[] {
  const idPorHorario = (h: HorarioDia): string | null => {
    const achado = turnos.find(
      (t) => String(t.entrada).slice(0, 5) === h.entrada
        && String(t.saida).slice(0, 5) === h.saida
        && (t.intervalo_minutos ?? 0) === (h.intervalo_minutos ?? 0),
    );
    return achado?.id ?? null;
  };
  return ORDEM_EXIBICAO.map((dow) => {
    const dia = dias.find((d) => d.dow === dow);
    if (!dia || !dia.trabalha) return { dow, trabalha: false, turno_id: null };
    if (!temHorarioProprio(dia)) return { dow, trabalha: true, turno_id: turnoBaseId ?? idPorHorario(base) };
    return { dow, trabalha: true, turno_id: dia.turno_id ?? idPorHorario(horarioEfetivoDia(dia, base)) };
  });
}


// ------------------------------------------------------------------
// Horário padrão derivado da semana
//
// A tela do colaborador cadastra apenas o horário de cada dia. O "horário
// padrão" (turno principal gravado na vigência, lido por escala, ponto e folha)
// passa a ser o horário que mais se repete nos dias trabalhados.
// ------------------------------------------------------------------

const chaveHorario = (h: HorarioDia) =>
  `${h.entrada}|${h.saida}|${h.intervalo_minutos ?? 0}`;

/**
 * Horário que mais se repete nos dias trabalhados. Empate resolvido pelo dia
 * que aparece primeiro na semana. Sem nenhum dia preenchido, vale o fallback.
 */
export function horarioPadraoDaSemana(dias: DiaConfig[], fallback: HorarioDia): HorarioDia {
  const contagem = new Map<string, { horario: HorarioDia; quantidade: number; ordem: number }>();
  ORDEM_EXIBICAO.forEach((dow, ordem) => {
    const dia = dias.find((d) => d.dow === dow);
    if (!dia?.trabalha || !temHorarioProprio(dia)) return;
    const h: HorarioDia = {
      entrada: String(dia.entrada).slice(0, 5),
      saida: String(dia.saida).slice(0, 5),
      intervalo_minutos: dia.intervalo_minutos ?? 0,
    };
    const chave = chaveHorario(h);
    const atual = contagem.get(chave);
    if (atual) atual.quantidade += 1;
    else contagem.set(chave, { horario: h, quantidade: 1, ordem });
  });
  const vencedor = [...contagem.values()].sort(
    (a, b) => b.quantidade - a.quantidade || a.ordem - b.ordem,
  )[0];
  return vencedor?.horario ?? fallback;
}

/**
 * Materializa o horário nos dias trabalhados que ainda não têm horário próprio.
 * Devolve a mesma referência quando não há nada a preencher (evita re-render).
 */
export function preencherDiasComHorario(dias: DiaConfig[], base: HorarioDia): DiaConfig[] {
  if (!base.entrada || !base.saida) return dias;
  let mudou = false;
  const out = dias.map((d) => {
    if (!d.trabalha || temHorarioProprio(d)) return d;
    mudou = true;
    return {
      ...d,
      entrada: base.entrada,
      saida: base.saida,
      intervalo_minutos: base.intervalo_minutos ?? 0,
    };
  });
  return mudou ? out : dias;
}
