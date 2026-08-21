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

/** Rótulos personalizados por empresa (formato antigo): { almoco: "Turno do almoço" }. */
export type CategoriaLabels = Record<string, string>;

/** Categoria de turno sob controle da empresa. */
export interface CategoriaTurnoItem {
  codigo: string;
  nome: string;
  ordem: number;
}

/** Lista padrão sugerida quando a empresa nunca personalizou nada. */
export function categoriasPadrao(): CategoriaTurnoItem[] {
  return CATEGORIAS_TURNO.map((c, i) => ({ codigo: c.v, nome: c.label, ordem: i }));
}

/** Código estável para categoria criada pela empresa. */
export function codigoCategoriaCustom(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return `custom_${slug || Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Lê o valor guardado em dp_config_dp.turno_categoria_labels aceitando os dois
 * formatos: o antigo `{ codigo: nome }` (só rótulos) e o novo array completo.
 */
export function normalizarCategorias(raw: unknown): CategoriaTurnoItem[] {
  if (Array.isArray(raw)) {
    const lista = raw
      .map((item, i) => {
        const o = (item ?? {}) as Record<string, unknown>;
        const codigo = typeof o.codigo === "string" ? o.codigo.trim() : "";
        const nome = typeof o.nome === "string" ? o.nome.trim() : "";
        if (!codigo || !nome) return null;
        const ordem = typeof o.ordem === "number" ? o.ordem : i;
        return { codigo, nome, ordem } satisfies CategoriaTurnoItem;
      })
      .filter((x): x is CategoriaTurnoItem => !!x);
    if (lista.length === 0) return categoriasPadrao();
    return lista
      .sort((a, b) => a.ordem - b.ordem)
      .map((c, i) => ({ ...c, ordem: i }));
  }
  if (raw && typeof raw === "object") {
    const overrides = raw as Record<string, unknown>;
    return categoriasPadrao().map((c) => {
      const v = overrides[c.codigo];
      return typeof v === "string" && v.trim() ? { ...c, nome: v.trim() } : c;
    });
  }
  return categoriasPadrao();
}

/** Normaliza nomes/ordem antes de gravar. */
export function serializarCategorias(lista: CategoriaTurnoItem[]): CategoriaTurnoItem[] {
  return lista
    .map((c, i) => ({ codigo: c.codigo, nome: c.nome.trim(), ordem: i }))
    .filter((c) => !!c.codigo && !!c.nome);
}

export type FonteCategorias = CategoriaTurnoItem[] | CategoriaLabels | null | undefined;

function comoLista(fonte: FonteCategorias): CategoriaTurnoItem[] {
  if (!fonte) return categoriasPadrao();
  return normalizarCategorias(fonte);
}

/** Rótulo da categoria respeitando o nome definido pela empresa. */
export function categoriaLabel(categoria: string | null | undefined, fonte?: FonteCategorias): string {
  if (!categoria) return "Turno";
  const item = comoLista(fonte).find((c) => c.codigo === categoria);
  return item?.nome || CATEGORIA_LABEL[categoria] || categoria;
}

/** Lista de categorias da empresa no formato do seletor. */
export function categoriasTurno(fonte?: FonteCategorias) {
  return comoLista(fonte).map((c) => ({ v: c.codigo, label: c.nome }));
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
  overrides?: FonteCategorias,
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

/** Um intervalo de funcionamento no dia (ex.: almoço 08:30→18:30). */
export interface HorarioFuncionamentoPeriodo {
  nome?: string | null;
  hora_abertura: string | null;
  hora_fechamento: string | null;
}

export interface HorarioFuncionamentoDia {
  dia_semana: number;
  aberto: boolean;
  /** Um ou mais períodos no mesmo dia. */
  periodos?: HorarioFuncionamentoPeriodo[];
  observacoes?: string | null;
  // Compatibilidade com o formato de período único.
  hora_abertura?: string | null;
  hora_fechamento?: string | null;
  fecha_no_dia_seguinte?: boolean;
}

/** Períodos do dia, aceitando também o formato antigo de período único. */
export function periodosDoDia(h: HorarioFuncionamentoDia): HorarioFuncionamentoPeriodo[] {
  if (h.periodos && h.periodos.length > 0) return h.periodos;
  if (h.hora_abertura || h.hora_fechamento) {
    return [{ nome: null, hora_abertura: h.hora_abertura ?? null, hora_fechamento: h.hora_fechamento ?? null }];
  }
  return [];
}

export function periodoVazio(nome?: string | null): HorarioFuncionamentoPeriodo {
  return { nome: nome ?? null, hora_abertura: null, hora_fechamento: null };
}

/** Dia sem horário salvo: fechado e sem período — nada é sugerido. */
export function funcionamentoVazio(dia: number): HorarioFuncionamentoDia {
  return {
    dia_semana: dia,
    aberto: false,
    periodos: [],
    observacoes: null,
  };
}

/** Um período só vale para o funcionamento quando tem abertura e fechamento. */
export function periodoCompleto(p: HorarioFuncionamentoPeriodo): boolean {
  return !!p.hora_abertura && !!p.hora_fechamento;
}

export function formatarPeriodo(p: HorarioFuncionamentoPeriodo): string {
  if (!p.hora_abertura || !p.hora_fechamento) return "Sem horário definido";
  const suf = turnoViraODia(p.hora_abertura, p.hora_fechamento) ? " (+1)" : "";
  return `${hhmm(p.hora_abertura)} → ${hhmm(p.hora_fechamento)}${suf}`;
}

export function formatarFuncionamento(h: HorarioFuncionamentoDia): string {
  if (!h.aberto) return "Fechado";
  const periodos = periodosDoDia(h).filter((p) => p.hora_abertura && p.hora_fechamento);
  if (periodos.length === 0) return "Sem horário definido";
  return periodos.map(formatarPeriodo).join(" · ");
}

const DIA_CURTO_FUNC: Record<number, string> = {
  0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb",
};
const ORDEM_FUNC = [1, 2, 3, 4, 5, 6, 0];

/**
 * Resumo curto do funcionamento da semana agrupando dias vizinhos com o mesmo
 * horário: "Seg–Sex 08:30 → 18:30 · Sáb 11:00 → 23:00".
 */
export function resumoFuncionamentoSemana(dias: HorarioFuncionamentoDia[]): string {
  const porDia = new Map(dias.map((d) => [d.dia_semana, d]));
  const blocos: { inicio: number; fim: number; texto: string }[] = [];

  ORDEM_FUNC.forEach((dia) => {
    const d = porDia.get(dia);
    if (!d || !d.aberto) return;
    const texto = formatarFuncionamento(d);
    const ultimo = blocos[blocos.length - 1];
    const vizinho = ultimo && ORDEM_FUNC.indexOf(ultimo.fim) === ORDEM_FUNC.indexOf(dia) - 1;
    if (ultimo && vizinho && ultimo.texto === texto) {
      ultimo.fim = dia;
      return;
    }
    blocos.push({ inicio: dia, fim: dia, texto });
  });

  if (blocos.length === 0) return "";
  return blocos
    .map((b) => {
      const faixa = b.inicio === b.fim
        ? DIA_CURTO_FUNC[b.inicio]
        : `${DIA_CURTO_FUNC[b.inicio]}–${DIA_CURTO_FUNC[b.fim]}`;
      return `${faixa} ${b.texto}`;
    })
    .join(" · ");
}




function cabeNoPeriodo(
  turno: Pick<TurnoHorario, "entrada" | "saida">,
  p: HorarioFuncionamentoPeriodo,
): { ok: boolean; motivo: string | null } | null {
  if (!p.hora_abertura || !p.hora_fechamento) return null;
  const abre = paraMinutos(p.hora_abertura);
  const fecha0 = paraMinutos(p.hora_fechamento);
  const entrada = paraMinutos(turno.entrada);
  const saida0 = paraMinutos(turno.saida);
  if (abre === null || fecha0 === null || entrada === null || saida0 === null) return null;

  const fecha = fecha0 <= abre ? fecha0 + 24 * 60 : fecha0;
  const saida = saida0 <= entrada ? saida0 + 24 * 60 : saida0;

  if (entrada < abre) return { ok: false, motivo: "O turno começa antes da abertura da unidade." };
  if (saida > fecha) return { ok: false, motivo: "O turno termina depois do fechamento da unidade." };
  return { ok: true, motivo: null };
}

/**
 * Aviso operacional (nunca bloqueio): o turno cabe em algum período de
 * funcionamento do dia? Retorna null quando não há como avaliar.
 */
export function turnoForaDoFuncionamento(
  turno: Pick<TurnoHorario, "entrada" | "saida">,
  funcionamento: HorarioFuncionamentoDia | null | undefined,
): string | null {
  if (!funcionamento) return null;
  if (!funcionamento.aberto) return "A unidade está fechada neste dia.";

  const avaliacoes = periodosDoDia(funcionamento)
    .map((p) => cabeNoPeriodo(turno, p))
    .filter((r): r is { ok: boolean; motivo: string | null } => !!r);

  if (avaliacoes.length === 0) return null;
  if (avaliacoes.some((a) => a.ok)) return null;
  return avaliacoes[0].motivo;
}

