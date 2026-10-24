/**
 * Regras puras do calendário de feriados da unidade.
 *
 * O banco é a fonte autoritativa (`dp_feriados_resolver`); estas funções
 * espelham a mesma matemática para montar a lista da tela sem ida ao servidor.
 */

export type FeriadoTipo = "especifica" | "anual" | "relativa" | "movel";
export type FeriadoCategoria = "nacional" | "estadual" | "municipal" | "sindicato";
export const FERIADO_CATEGORIA_LABEL: Record<FeriadoCategoria, string> = {
  nacional: "Nacional", estadual: "Estadual", municipal: "Municipal", sindicato: "Sindicato (CCT)",
};
export type FeriadoMovel = "carnaval" | "corpus_christi" | "sexta_feira_santa";
export const FERIADOS_MOVEIS: Record<FeriadoMovel, { nome: string; deslocamento: number }> = {
  carnaval: { nome: "Carnaval", deslocamento: -47 },
  corpus_christi: { nome: "Corpus Christi", deslocamento: 60 },
  sexta_feira_santa: { nome: "Sexta-feira Santa", deslocamento: -2 },
};

export type FeriadoRegra = {
  id: string;
  nome: string;
  tipo: FeriadoTipo;
  categoria?: FeriadoCategoria | null;
  codigo_movel?: FeriadoMovel | null;
  /** Tipo "especifica": data completa ISO (YYYY-MM-DD). */
  data?: string | null;
  /** Tipo "anual": dia do mês. */
  dia?: number | null;
  /** Tipos "anual" e "relativa": mês (1–12). */
  mes?: number | null;
  /** Tipo "relativa": 1..5 = n-ésima ocorrência; -1 = última. */
  ordinal?: number | null;
  /** Tipo "relativa": 0 = domingo … 6 = sábado. */
  dia_semana?: number | null;
  /** Tipos "anual" e "relativa": ano a partir do qual o feriado passa a valer (opcional). */
  ano_inicio?: number | null;
  ativo?: boolean | null;
  observacao?: string | null;
};

export const FERIADO_TIPO_LABEL: Record<FeriadoTipo, string> = {
  especifica: "Data específica",
  anual: "Todo ano na mesma data",
  relativa: "Dia da semana em um mês",
  movel: "Feriado com data móvel",
};

export const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

export const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export const ORDINAIS: { valor: number; label: string }[] = [
  { valor: 1, label: "primeiro" },
  { valor: 2, label: "segundo" },
  { valor: 3, label: "terceiro" },
  { valor: 4, label: "quarto" },
  { valor: 5, label: "quinto" },
  { valor: -1, label: "último" },
];

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

const dowDe = (ano: number, mes: number, dia: number) =>
  new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();

/** Cômputo gregoriano de Meeus/Jones/Butcher, sem serviço externo ou tarefa anual. */
export function dataFeriadoMovel(codigo: FeriadoMovel, ano: number): string | null {
  if (!Number.isInteger(ano) || ano < 1583 || ano > 9999) return null;
  const feriado = FERIADOS_MOVEIS[codigo];
  if (!feriado) return null;
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114;
  const data = new Date(Date.UTC(ano, Math.floor(n / 31) - 1, n % 31 + 1));
  data.setUTCDate(data.getUTCDate() + feriado.deslocamento);
  return iso(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());
}

/**
 * Data em que a regra cai no ano informado. Retorna null quando a regra não
 * existe naquele ano (ex.: 29/02 fora de ano bissexto, quinta sexta-feira
 * inexistente, ou data específica de outro ano).
 */
export function dataDoFeriadoNoAno(regra: FeriadoRegra, ano: number): string | null {
  if (regra.tipo === "especifica") {
    if (!regra.data) return null;
    return regra.data.startsWith(`${ano}-`) ? regra.data : null;
  }

  if (regra.ano_inicio != null && ano < regra.ano_inicio) return null;
  if (regra.tipo === "movel") return regra.codigo_movel ? dataFeriadoMovel(regra.codigo_movel, ano) : null;

  const mes = regra.mes ?? 0;
  if (mes < 1 || mes > 12) return null;

  if (regra.tipo === "anual") {
    const dia = regra.dia ?? 0;
    if (dia < 1 || dia > diasNoMes(ano, mes)) return null;
    return iso(ano, mes, dia);
  }

  const dow = regra.dia_semana;
  const ordinal = regra.ordinal;
  if (dow == null || ordinal == null) return null;

  if (ordinal === -1) {
    const ultimo = diasNoMes(ano, mes);
    const delta = (dowDe(ano, mes, ultimo) - dow + 7) % 7;
    return iso(ano, mes, ultimo - delta);
  }

  const delta = (dow - dowDe(ano, mes, 1) + 7) % 7;
  const dia = 1 + delta + (ordinal - 1) * 7;
  if (dia > diasNoMes(ano, mes)) return null;
  return iso(ano, mes, dia);
}

export type FeriadoResolvido = {
  data: string;
  nome: string;
  regraId: string;
  tipo: FeriadoTipo;
  categoria?: FeriadoCategoria | null;
};

/** Todos os feriados ativos do ano, já resolvidos em datas e ordenados. */
export function feriadosDoAno(regras: FeriadoRegra[], ano: number): FeriadoResolvido[] {
  const out: FeriadoResolvido[] = [];
  for (const r of regras) {
    if (r.ativo === false) continue;
    const data = dataDoFeriadoNoAno(r, ano);
    if (!data) continue;
    out.push({ data, nome: r.nome, regraId: r.id, tipo: r.tipo, categoria: categoriaFeriado(r) });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
}

/** Frase de apoio explicando quando a regra cai. */
export function descricaoRegra(regra: FeriadoRegra): string {
  if (regra.tipo === "especifica") {
    if (!regra.data) return "Data não informada";
    const [a, m, d] = regra.data.split("-");
    return `Somente em ${d}/${m}/${a}`;
  }
  const mes = MESES[(regra.mes ?? 1) - 1] ?? "";
  const desde = regra.ano_inicio ? `, a partir de ${regra.ano_inicio}` : "";
  if (regra.tipo === "movel") return `Data móvel calculada todo ano${desde}`;
  if (regra.tipo === "anual") return `Todo ano em ${regra.dia} de ${mes}${desde}`;
  const ord = ORDINAIS.find((o) => o.valor === regra.ordinal)?.label ?? "";
  const dow = DIAS_SEMANA[regra.dia_semana ?? 0] ?? "";
  return `Todo ano no ${ord} ${dow} de ${mes}${desde}`;
}

/** Feriados nacionais de data fixa, para a unidade não começar vazia.
 * Feriados religiosos, incluindo Sexta-feira Santa, dependem de lei municipal
 * (Lei 9.093/1995, art. 2º) e não entram na inclusão automática de nacionais.
 */
export const FERIADOS_NACIONAIS_FIXOS: { nome: string; dia: number; mes: number }[] = [
  { nome: "Confraternização Universal", dia: 1, mes: 1 },
  { nome: "Tiradentes", dia: 21, mes: 4 },
  { nome: "Dia do Trabalho", dia: 1, mes: 5 },
  { nome: "Independência do Brasil", dia: 7, mes: 9 },
  { nome: "Nossa Senhora Aparecida", dia: 12, mes: 10 },
  { nome: "Finados", dia: 2, mes: 11 },
  { nome: "Proclamação da República", dia: 15, mes: 11 },
  { nome: "Consciência Negra", dia: 20, mes: 11 },
  { nome: "Natal", dia: 25, mes: 12 },
];

/** Conjunto de datas (YYYY-MM-DD) dos feriados ativos nos anos informados. */
export function datasDeFeriados(regras: FeriadoRegra[], anos: number[]): Set<string> {
  const out = new Set<string>();
  for (const ano of anos) for (const f of feriadosDoAno(regras, ano)) out.add(f.data);
  return out;
}

/** Regra que não é um dos feriados nacionais fixos (municipal, estadual ou móvel). */
export function categoriaFeriado(regra: Pick<FeriadoRegra, "tipo" | "dia" | "mes" | "categoria">): FeriadoCategoria {
  if (regra.categoria) return regra.categoria;
  return regra.tipo === "anual" && FERIADOS_NACIONAIS_FIXOS.some((n) => n.dia === regra.dia && n.mes === regra.mes) ? "nacional" : "municipal";
}

export function ehFeriadoLocal(regra: Pick<FeriadoRegra, "tipo" | "dia" | "mes" | "codigo_movel" | "categoria">): boolean {
  if (regra.categoria) return regra.categoria !== "nacional";
  // Os três móveis são escolhidos pela unidade conforme a regra local/CCT;
  // a Sexta-feira Santa não é uma exceção federal a essa classificação.
  if (regra.tipo === "movel") return true;
  if (regra.tipo !== "anual") return true;
  return !FERIADOS_NACIONAIS_FIXOS.some((n) => n.dia === regra.dia && n.mes === regra.mes);
}

/** A unidade precisa cadastrar feriados locais ou confirmar que não tem. */
export function faltaFeriadoLocal(
  regras: Pick<FeriadoRegra, "tipo" | "dia" | "mes" | "codigo_movel" | "ativo" | "categoria">[],
  cienteEm: string | null | undefined,
): boolean {
  if (cienteEm) return false;
  return !regras.some((r) => r.ativo !== false && ehFeriadoLocal(r));
}
