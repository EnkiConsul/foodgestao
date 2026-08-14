// ------------------------------------------------------------------
// Domínio: DP → Turnos e horário de funcionamento (Fase 1)
// Funções puras. Nenhuma regra de carga semanal aqui: um turno isolado
// NÃO representa uma semana de trabalho, portanto nunca valida 44h.
// ------------------------------------------------------------------

import { paraMinutos, hhmm, viraODia, duracaoBrutaMinutos } from "@/lib/dp/jornada-utils";

export interface TurnoHorario {
  entrada: string;
  saida: string;
  intervalo_minutos: number;
}

/** Snapshot copiado para o item de escala/convocação (Fases 3 e 5). */
export interface TurnoSnapshot {
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  termina_no_dia_seguinte: boolean;
  carga_prevista_horas: number;
}

export type CategoriaTurno =
  | "abertura"
  | "almoco"
  | "jantar"
  | "fechamento"
  | "delivery"
  | "administrativo"
  | "personalizado";

export const CATEGORIAS_TURNO: { v: CategoriaTurno; label: string }[] = [
  { v: "abertura", label: "Abertura" },
  { v: "almoco", label: "Almoço" },
  { v: "jantar", label: "Jantar" },
  { v: "fechamento", label: "Fechamento" },
  { v: "delivery", label: "Delivery" },
  { v: "administrativo", label: "Administrativo" },
  { v: "personalizado", label: "Personalizado" },
];

export const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS_TURNO.map((c) => [c.v, c.label]),
);

/** Rótulos personalizados por empresa: { almoco: "Turno do almoço" }. */
export type CategoriaLabels = Record<string, string>;

/** Rótulo da categoria respeitando o nome personalizado da empresa. */
export function categoriaLabel(
  categoria: string | null | undefined,
  overrides?: CategoriaLabels | null,
): string {
  if (!categoria) return "Turno";
  const custom = overrides?.[categoria]?.trim();
  return custom || CATEGORIA_LABEL[categoria] || categoria;
}

/** Lista de categorias já com os rótulos personalizados aplicados. */
export function categoriasTurno(overrides?: CategoriaLabels | null) {
  return CATEGORIAS_TURNO.map((c) => ({ v: c.v, label: categoriaLabel(c.v, overrides) }));
}

/** Cores sugeridas para identificar o turno na grade da escala. */
export const CORES_TURNO = [
  "#EB6119",
  "#0F1B3D",
  "#2E7D32",
  "#0288D1",
  "#8E24AA",
  "#C62828",
  "#F9A825",
  "#455A64",
] as const;

export const DEFAULT_INTERVALOS = [0, 30, 60, 120];


/** O turno atravessa a meia-noite? */
export function turnoViraODia(entrada: string, saida: string): boolean {
  return viraODia(entrada, saida);
}

/** Carga líquida em horas (duração bruta menos o intervalo), arredondada em 2 casas. */
export function cargaLiquidaHoras(t: TurnoHorario): number {
  const bruto = duracaoBrutaMinutos(t.entrada, t.saida);
  const liquido = Math.max(0, bruto - Math.max(0, t.intervalo_minutos || 0));
  return Math.round((liquido / 60) * 100) / 100;
}

/** Texto curto do turno: "17:00 → 00:30 (+1)". */
export function formatarFaixaTurno(t: Pick<TurnoHorario, "entrada" | "saida">): string {
  const entrada = hhmm(t.entrada);
  const saida = hhmm(t.saida);
  return turnoViraODia(entrada, saida) ? `${entrada} → ${saida} (+1)` : `${entrada} → ${saida}`;
}

/** Gera o snapshot imutável de horário a partir do turno. */
export function turnoSnapshot(t: TurnoHorario): TurnoSnapshot {
  const entrada = hhmm(t.entrada);
  const saida = hhmm(t.saida);
  return {
    entrada,
    saida,
    intervalo_minutos: Math.max(0, t.intervalo_minutos || 0),
    termina_no_dia_seguinte: turnoViraODia(entrada, saida),
    carga_prevista_horas: cargaLiquidaHoras({ entrada, saida, intervalo_minutos: t.intervalo_minutos }),
  };
}

/** Sugere a categoria operacional a partir do horário de entrada. */
export function sugerirCategoria(entrada: string): CategoriaTurno {
  const min = paraMinutos(entrada);
  if (min === null) return "personalizado";
  if (min < 10 * 60) return "abertura";
  if (min < 15 * 60) return "almoco";
  if (min < 21 * 60) return "jantar";
  return "fechamento";
}

/** Nome padrão do turno derivado da categoria e do horário: "Jantar 17:00–23:00". */
export function nomeSugeridoTurno(
  categoria: string | null | undefined,
  entrada: string,
  saida: string,
  overrides?: CategoriaLabels | null,
): string {
  const cat = categoria || sugerirCategoria(entrada);
  const label = categoriaLabel(cat, overrides);
  return `${label} ${hhmm(entrada)}–${hhmm(saida)}`;
}

/** Intervalo mínimo (minutos) exigido pelo art. 71 da CLT para a carga do dia. */
export function intervaloMinimoLegal(cargaBrutaHoras: number): number {
  if (cargaBrutaHoras > 6) return 60;
  if (cargaBrutaHoras > 4) return 15;
  return 0;
}

export interface AlertaIntervalo {
  campo: "intervalo_minutos";
  minimo: number;
  informado: number;
  mensagem: string;
}

/**
 * O intervalo informado está abaixo do mínimo legal? Nunca bloqueia:
 * exige ciência registrada do responsável (art. 71 da CLT).
 */
export function intervaloAbaixoDoLegal(t: TurnoHorario): AlertaIntervalo | null {
  const e = paraMinutos(t.entrada);
  const s = paraMinutos(t.saida);
  if (e === null || s === null || e === s) return null;
  const bruto = duracaoBrutaMinutos(t.entrada, t.saida);
  const informado = Math.max(0, t.intervalo_minutos || 0);
  if (informado >= bruto) return null;
  const minimo = intervaloMinimoLegal((bruto - informado) / 60);
  if (minimo === 0 || informado >= minimo) return null;
  return {
    campo: "intervalo_minutos",
    minimo,
    informado,
    mensagem:
      `O art. 71 da CLT exige ${minimo} minutos de intervalo para esta duração de jornada, ` +
      `e o turno prevê ${informado === 0 ? "nenhum intervalo" : `${informado} minutos`}. ` +
      "Manter assim é menos protetivo que o padrão legal e exige registro de ciência do responsável.",
  };
}

export interface ValidacaoTurno {
  campo: "nome" | "entrada" | "saida" | "intervalo_minutos" | "vigencia";
  nivel: "erro" | "aviso";
  mensagem: string;
}

/**
 * Valida apenas o que faz sentido em um turno isolado.
 * Limite semanal e DSR pertencem à escala, nunca ao cadastro do turno.
 */
export function validarTurno(input: {
  nome: string;
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
}): ValidacaoTurno[] {
  const erros: ValidacaoTurno[] = [];
  if (!input.nome?.trim()) {
    erros.push({ campo: "nome", nivel: "erro", mensagem: "Dê um nome ao turno (ex.: Jantar)." });
  }
  const e = paraMinutos(input.entrada);
  const s = paraMinutos(input.saida);
  if (e === null) erros.push({ campo: "entrada", nivel: "erro", mensagem: "Informe o horário de entrada." });
  if (s === null) erros.push({ campo: "saida", nivel: "erro", mensagem: "Informe o horário de saída." });
  if (e !== null && s !== null && e === s) {
    erros.push({ campo: "saida", nivel: "erro", mensagem: "Entrada e saída não podem ser iguais." });
  }
  const intervalo = input.intervalo_minutos ?? 0;
  if (intervalo < 0) {
    erros.push({ campo: "intervalo_minutos", nivel: "erro", mensagem: "O intervalo não pode ser negativo." });
  }
  if (e !== null && s !== null) {
    const bruto = duracaoBrutaMinutos(input.entrada, input.saida);
    if (intervalo >= bruto) {
      erros.push({
        campo: "intervalo_minutos",
        nivel: "erro",
        mensagem: "O intervalo é maior que a duração do turno.",
      });
    }
    const liquidoHoras = (bruto - intervalo) / 60;
    if (liquidoHoras > 6 && intervalo < 60) {
      erros.push({
        campo: "intervalo_minutos",
        nivel: "aviso",
        mensagem: "Turnos acima de 6 horas normalmente exigem 1 hora de intervalo.",
      });
    }
    if (liquidoHoras > 4 && liquidoHoras <= 6 && intervalo < 15) {
      erros.push({
        campo: "intervalo_minutos",
        nivel: "aviso",
        mensagem: "Turnos entre 4 e 6 horas normalmente exigem 15 minutos de intervalo.",
      });
    }
  }
  if (input.vigencia_inicio && input.vigencia_fim && input.vigencia_fim < input.vigencia_inicio) {
    erros.push({ campo: "vigencia", nivel: "erro", mensagem: "O fim da vigência é anterior ao início." });
  }
  return erros;
}

export function turnoTemErro(validacoes: ValidacaoTurno[]): boolean {
  return validacoes.some((v) => v.nivel === "erro");
}

// ------------------------------------------------------------------
// Horário de funcionamento da unidade
// ------------------------------------------------------------------

export interface HorarioFuncionamentoDia {
  dia_semana: number;
  aberto: boolean;
  hora_abertura: string | null;
  hora_fechamento: string | null;
  fecha_no_dia_seguinte: boolean;
  observacoes?: string | null;
}

export function funcionamentoVazio(dia: number): HorarioFuncionamentoDia {
  return {
    dia_semana: dia,
    aberto: true,
    hora_abertura: "11:00",
    hora_fechamento: "23:00",
    fecha_no_dia_seguinte: false,
    observacoes: null,
  };
}

export function formatarFuncionamento(h: HorarioFuncionamentoDia): string {
  if (!h.aberto) return "Fechado";
  if (!h.hora_abertura || !h.hora_fechamento) return "Sem horário definido";
  const suf = h.fecha_no_dia_seguinte || turnoViraODia(h.hora_abertura, h.hora_fechamento) ? " (+1)" : "";
  return `${hhmm(h.hora_abertura)} → ${hhmm(h.hora_fechamento)}${suf}`;
}

/**
 * Aviso operacional (nunca bloqueio): o turno cabe dentro do funcionamento do dia?
 * Retorna null quando não há como avaliar.
 */
export function turnoForaDoFuncionamento(
  turno: Pick<TurnoHorario, "entrada" | "saida">,
  funcionamento: HorarioFuncionamentoDia | null | undefined,
): string | null {
  if (!funcionamento) return null;
  if (!funcionamento.aberto) return "A unidade está fechada neste dia.";
  if (!funcionamento.hora_abertura || !funcionamento.hora_fechamento) return null;

  const abre = paraMinutos(funcionamento.hora_abertura);
  const fecha0 = paraMinutos(funcionamento.hora_fechamento);
  const entrada = paraMinutos(turno.entrada);
  const saida0 = paraMinutos(turno.saida);
  if (abre === null || fecha0 === null || entrada === null || saida0 === null) return null;

  const fecha = fecha0 <= abre ? fecha0 + 24 * 60 : fecha0;
  const saida = saida0 <= entrada ? saida0 + 24 * 60 : saida0;

  if (entrada < abre) return "O turno começa antes da abertura da unidade.";
  if (saida > fecha) return "O turno termina depois do fechamento da unidade.";
  return null;
}
