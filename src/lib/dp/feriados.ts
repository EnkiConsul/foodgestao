/**
 * Regras puras do calendário de feriados da unidade.
 *
 * O banco é a fonte autoritativa (`dp_feriados_resolver`); estas funções
 * espelham a mesma matemática para montar a lista da tela sem ida ao servidor.
 */

export type FeriadoTipo = "especifica" | "anual" | "relativa";

export type FeriadoRegra = {
  id: string;
  nome: string;
  tipo: FeriadoTipo;
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
  ativo?: boolean | null;
  observacao?: string | null;
};

export const FERIADO_TIPO_LABEL: Record<FeriadoTipo, string> = {
  especifica: "Data específica",
  anual: "Todo ano na mesma data",
  relativa: "Data que muda de ano para ano",
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
};

/** Todos os feriados ativos do ano, já resolvidos em datas e ordenados. */
export function feriadosDoAno(regras: FeriadoRegra[], ano: number): FeriadoResolvido[] {
  const out: FeriadoResolvido[] = [];
  for (const r of regras) {
    if (r.ativo === false) continue;
    const data = dataDoFeriadoNoAno(r, ano);
    if (!data) continue;
    out.push({ data, nome: r.nome, regraId: r.id, tipo: r.tipo });
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
  if (regra.tipo === "anual") return `Todo ano em ${regra.dia} de ${mes}`;
  const ord = ORDINAIS.find((o) => o.valor === regra.ordinal)?.label ?? "";
  const dow = DIAS_SEMANA[regra.dia_semana ?? 0] ?? "";
  return `Todo ano no ${ord} ${dow} de ${mes}`;
}

/** Feriados nacionais de data fixa, para a unidade não começar vazia. */
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
