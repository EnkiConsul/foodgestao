// ------------------------------------------------------------------
// Domínio: DP → Vale-alimentação (período de corte e valor a depositar)
//
// Fonte única de:
//  - período coberto pelo depósito e período conferido para descontos,
//    a partir do dia de pagamento e dos dias de antecedência do corte;
//  - contagem dos dias previstos (escala publicada ou jornada habitual),
//    já retirando as folgas marcadas no calendário;
//  - contagem dos dias pagos e não trabalhados no período anterior
//    (falta, folga extra, atestado/licença, férias);
//  - valor a depositar.
//
// Funções puras — nenhuma tela recalcula isso inline.
// ------------------------------------------------------------------

/** Antecedência padrão do corte, em dias, para a empresa se organizar. */
export const DIAS_CORTE_PADRAO = 5;
/** Dia de pagamento assumido quando a empresa não informou. */
export const DIA_PAGAMENTO_PADRAO = 25;

export type MotivoDesconto = "falta" | "folga_extra" | "atestado" | "ferias";

export const MOTIVO_DESCONTO_LABEL: Record<MotivoDesconto, string> = {
  falta: "Falta",
  folga_extra: "Folga extra",
  atestado: "Atestado/licença",
  ferias: "Férias",
};

export interface RegrasDescontoVa {
  falta: boolean;
  folga_extra: boolean;
  atestado: boolean;
  ferias: boolean;
}

export const REGRAS_DESCONTO_PADRAO: RegrasDescontoVa = {
  falta: true,
  folga_extra: true,
  atestado: false,
  ferias: true,
};

export interface PeriodoVa {
  /** Data em que o depósito é feito (ISO). */
  pagamento: string;
  /** Fechamento do cálculo (ISO) — alguns dias antes do pagamento. */
  corte: string;
  /** Período coberto pelo depósito. */
  cobertura: { inicio: string; fim: string };
  /** Período conferido para descontar dias pagos e não trabalhados. */
  conferencia: { inicio: string; fim: string };
}

const pad = (n: number) => String(n).padStart(2, "0");

export const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const utc = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes, dia));

const somarDias = (isoData: string, dias: number) => {
  const [a, m, d] = isoData.split("-").map(Number);
  return iso(utc(a, m - 1, d + dias));
};

/** Último dia do mês, para dias de pagamento maiores que o mês (ex.: 31/02). */
const diaValido = (ano: number, mes: number, dia: number) => {
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return Math.min(Math.max(1, dia), ultimo);
};

/**
 * Datas do ciclo do VA. `competencia` é o mês do pagamento (ISO, dia ignorado).
 *
 * Ex.: pagamento dia 25 e corte de 5 dias em agosto/2026 →
 * corte 20/08, cobertura 21/08 a 20/09, conferência 21/07 a 20/08.
 */
export function periodoVaDe(
  diaPagamento: number | null | undefined,
  diasCorte: number | null | undefined,
  competencia: string,
): PeriodoVa {
  const [ano, mes] = competencia.split("-").map(Number);
  const dia = diaValido(ano, mes - 1, Number(diaPagamento) || DIA_PAGAMENTO_PADRAO);
  const corteDias = Math.max(
    0,
    diasCorte == null || !Number.isFinite(Number(diasCorte)) ? DIAS_CORTE_PADRAO : Number(diasCorte),
  );

  const pagamento = iso(utc(ano, mes - 1, dia));
  const corte = somarDias(pagamento, -corteDias);

  const coberturaInicio = somarDias(corte, 1);
  const [ca, cm, cd] = corte.split("-").map(Number);
  const corteSeguinte = iso(utc(ca, cm, diaValido(ca, cm, cd)));
  const cortePassado = iso(utc(ca, cm - 2, diaValido(ca, cm - 2, cd)));

  return {
    pagamento,
    corte,
    cobertura: { inicio: coberturaInicio, fim: corteSeguinte },
    conferencia: { inicio: somarDias(cortePassado, 1), fim: corte },
  };
}

/** Dias do intervalo (inclusive), em ISO. */
export function diasDoIntervalo(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let atual = inicio;
  let guarda = 0;
  while (atual <= fim && guarda < 400) {
    out.push(atual);
    atual = somarDias(atual, 1);
    guarda += 1;
  }
  return out;
}

export const dowDe = (isoData: string) => {
  const [a, m, d] = isoData.split("-").map(Number);
  return utc(a, m - 1, d).getUTCDay();
};

export interface DiaEscala {
  data: string;
  /** `trabalho` conta como dia previsto; os demais tipos não. */
  tipo: string;
}

export interface FolgaMarcada {
  data: string;
  /** `normal`, `extra`, `ferias`, `abono`, `licenca`. */
  tipo: string;
  extra?: boolean | null;
  /** `pendente`, `aprovada`, `recusada`, `cancelada`. */
  status?: string | null;
}

export interface DiasPrevistosInput {
  periodo: { inicio: string; fim: string };
  /** Itens da escala publicada, quando existir. */
  escala?: DiaEscala[];
  /** Dias da semana trabalhados na jornada habitual (0=domingo). */
  dowTrabalhados?: number[];
  /** Folgas marcadas no calendário (dominicais, extras, férias...). */
  folgas?: FolgaMarcada[];
}

export interface DiasPrevistosResultado {
  dias: number;
  /** Dias retirados por folga já marcada no calendário. */
  folgasDescontadas: number;
  /** Quantas dessas folgas ainda aguardam aprovação. */
  folgasPendentes: number;
  origem: "escala" | "jornada";
}

const folgaValida = (f: FolgaMarcada) =>
  !f.status || (f.status !== "recusada" && f.status !== "cancelada");

/**
 * Dias de trabalho previstos no período: usa a escala publicada quando houver,
 * senão a jornada habitual. As folgas já marcadas no calendário saem da conta —
 * não se paga VA em dia que já se sabe que não haverá trabalho.
 */
export function contarDiasPrevistos(input: DiasPrevistosInput): DiasPrevistosResultado {
  const dias = diasDoIntervalo(input.periodo.inicio, input.periodo.fim);
  const escala = (input.escala ?? []).filter((e) => e.data >= input.periodo.inicio && e.data <= input.periodo.fim);
  const usaEscala = escala.length > 0;

  const previstos = usaEscala
    ? escala.filter((e) => e.tipo === "trabalho").map((e) => e.data)
    : dias.filter((d) => (input.dowTrabalhados ?? []).includes(dowDe(d)));

  const folgasNoPeriodo = (input.folgas ?? []).filter(
    (f) => folgaValida(f) && f.data >= input.periodo.inicio && f.data <= input.periodo.fim,
  );
  const porData = new Map(folgasNoPeriodo.map((f) => [f.data, f]));

  const restantes = previstos.filter((d) => !porData.has(d));
  const descontadas = previstos.length - restantes.length;
  const pendentes = previstos.filter((d) => porData.get(d)?.status === "pendente").length;

  return {
    dias: restantes.length,
    folgasDescontadas: descontadas,
    folgasPendentes: pendentes,
    origem: usaEscala ? "escala" : "jornada",
  };
}

export interface DiasDescontaveisInput {
  periodo: { inicio: string; fim: string };
  regras: RegrasDescontoVa;
  /** Dias previstos de trabalho no período conferido (escala ou jornada). */
  diasPrevistos: string[];
  /** Datas com ponto registrado (qualquer marcação). */
  diasComPonto?: string[];
  /** A empresa controla ponto deste colaborador? Sem ponto não se acusa falta. */
  usaPonto?: boolean;
  folgas?: FolgaMarcada[];
  /** Intervalos de férias gozadas. */
  ferias?: { inicio: string; fim: string }[];
}

export interface DiasDescontaveisResultado {
  dias: number;
  porMotivo: Record<MotivoDesconto, number>;
  detalhe: { data: string; motivo: MotivoDesconto }[];
}

/**
 * Dias pagos no período anterior em que o colaborador não trabalhou, conforme
 * as regras marcadas pela empresa. Cada dia entra uma única vez.
 */
export function contarDiasDescontaveis(input: DiasDescontaveisInput): DiasDescontaveisResultado {
  const dentro = (d: string) => d >= input.periodo.inicio && d <= input.periodo.fim;
  const previstos = new Set(input.diasPrevistos.filter(dentro));
  const comPonto = new Set(input.diasComPonto ?? []);
  const marcados = new Map<string, MotivoDesconto>();

  const marcar = (data: string, motivo: MotivoDesconto) => {
    if (!dentro(data) || marcados.has(data)) return;
    marcados.set(data, motivo);
  };

  for (const intervalo of input.ferias ?? []) {
    if (!input.regras.ferias) break;
    for (const d of diasDoIntervalo(intervalo.inicio, intervalo.fim)) {
      if (previstos.has(d)) marcar(d, "ferias");
    }
  }

  for (const f of input.folgas ?? []) {
    if (!folgaValida(f) || f.status === "pendente") continue;
    const extra = f.tipo === "extra" || f.extra === true;
    if (extra && input.regras.folga_extra) marcar(f.data, "folga_extra");
    else if (f.tipo === "licenca" && input.regras.atestado) marcar(f.data, "atestado");
    else if (f.tipo === "ferias" && input.regras.ferias) marcar(f.data, "ferias");
  }

  if (input.regras.falta && input.usaPonto) {
    for (const d of previstos) {
      if (!comPonto.has(d)) marcar(d, "falta");
    }
  }

  const porMotivo: Record<MotivoDesconto, number> = {
    falta: 0,
    folga_extra: 0,
    atestado: 0,
    ferias: 0,
  };
  for (const motivo of marcados.values()) porMotivo[motivo] += 1;

  return {
    dias: marcados.size,
    porMotivo,
    detalhe: [...marcados.entries()]
      .map(([data, motivo]) => ({ data, motivo }))
      .sort((a, b) => a.data.localeCompare(b.data)),
  };
}

export interface DepositoVaInput {
  diasPrevistos: number;
  diasDescontados: number;
  valorDia: number;
  /** Desconto do colaborador no mês (já calculado pelas regras do benefício). */
  descontoColaborador?: number;
  /** Ajuste manual do gestor, quando informado, substitui os dias calculados. */
  diasAjustados?: number | null;
}

export interface DepositoVa {
  diasPagos: number;
  bruto: number;
  desconto: number;
  depositar: number;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Valor a depositar: (previstos − descontados) × valor do dia, menos o desconto. */
export function calcularVaDeposito(input: DepositoVaInput): DepositoVa {
  const calculado = Math.max(0, (Number(input.diasPrevistos) || 0) - (Number(input.diasDescontados) || 0));
  const diasPagos =
    input.diasAjustados == null ? calculado : Math.max(0, Number(input.diasAjustados) || 0);
  const bruto = round2(diasPagos * (Number(input.valorDia) || 0));
  const desconto = Math.min(bruto, round2(Math.max(0, Number(input.descontoColaborador) || 0)));
  return { diasPagos, bruto, desconto, depositar: round2(bruto - desconto) };
}
