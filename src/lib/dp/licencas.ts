import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

/**
 * Licenças longas (maternidade/paternidade) e demais afastamentos.
 *
 * Convivem com o tipo "atestado" nas solicitações: entram já aprovadas quando
 * registradas pelo gestor, contam como afastamento na Operação e no VA/VT e
 * geram pendência de retorno perto do fim previsto.
 */

export type TipoLicenca = "licenca_maternidade" | "licenca_paternidade";

export const TIPOS_LICENCA: readonly TipoLicenca[] = [
  "licenca_maternidade",
  "licenca_paternidade",
];

/** Tipos de solicitação tratados como afastamento (atestado + licenças). */
export const TIPOS_AFASTAMENTO = ["atestado", ...TIPOS_LICENCA] as const;
export type TipoAfastamento = (typeof TIPOS_AFASTAMENTO)[number];

export const TIPO_AFASTAMENTO_LABEL: Record<TipoAfastamento, string> = {
  atestado: "Atestado",
  licenca_maternidade: "Licença-maternidade",
  licenca_paternidade: "Licença-paternidade",
};

/** Duração legal padrão (editável no cadastro). */
export const DURACAO_PADRAO_DIAS: Record<TipoLicenca, number> = {
  licenca_maternidade: 120,
  licenca_paternidade: 5,
};

/** Dias de antecedência do lembrete de retorno. */
export const LEMBRETE_RETORNO_DIAS = 30;

export function isTipoLicenca(tipo: string | null | undefined): tipo is TipoLicenca {
  return tipo === "licenca_maternidade" || tipo === "licenca_paternidade";
}

export function isTipoAfastamento(tipo: string | null | undefined): tipo is TipoAfastamento {
  return !!tipo && (TIPOS_AFASTAMENTO as readonly string[]).includes(tipo);
}

export function labelAfastamento(tipo: string | null | undefined): string {
  if (isTipoAfastamento(tipo)) return TIPO_AFASTAMENTO_LABEL[tipo];
  return tipo ?? "Afastamento";
}

/**
 * Sugere a data final a partir do início e da duração padrão da licença.
 * Retorna null quando o tipo não tem duração padrão ou o início é inválido.
 */
export function sugestaoDataFim(tipo: string, dataInicioISO: string): string | null {
  if (!isTipoLicenca(tipo) || !dataInicioISO) return null;
  const inicio = parseISO(dataInicioISO);
  if (Number.isNaN(inicio.getTime())) return null;
  return format(addDays(inicio, DURACAO_PADRAO_DIAS[tipo] - 1), "yyyy-MM-dd");
}

export interface LicencaAtiva {
  colaborador_id: string;
  tipo: string;
  data_alvo: string;
  data_fim: string | null;
}

/** Verdadeiro quando a licença cobre a data informada (hoje por padrão). */
export function licencaCobre(licenca: LicencaAtiva, data: Date = new Date()): boolean {
  const alvo = parseISO(licenca.data_alvo);
  const fim = licenca.data_fim ? parseISO(licenca.data_fim) : alvo;
  const dia = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  return alvo <= dia && dia <= fim;
}

/**
 * Situação do retorno de uma licença aprovada:
 * - "vencido": a data final prevista já passou;
 * - "lembrete": faltam até LEMBRETE_RETORNO_DIAS para o fim;
 * - "ok": licença em curso, fora da janela de lembrete;
 * - null: licença ainda não iniciou.
 */
export function situacaoRetorno(
  licenca: LicencaAtiva,
  hoje: Date = new Date(),
): "vencido" | "lembrete" | "ok" | null {
  if (!licenca.data_fim) return null;
  const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const inicio = parseISO(licenca.data_alvo);
  if (dia < inicio) return null;
  const fim = parseISO(licenca.data_fim);
  const restantes = differenceInCalendarDays(fim, dia);
  if (restantes < 0) return "vencido";
  if (restantes <= LEMBRETE_RETORNO_DIAS) return "lembrete";
  return "ok";
}

/**
 * A licença cobre TODOS os dias da competência em que a pessoa poderia
 * trabalhar? Quando sim, não há ponto a bater no mês e a folha de ponto deixa
 * de ser exigida daquela pessoa naquela competência.
 *
 * A janela considerada é a interseção da competência com o vínculo
 * (admissão/desligamento), para não cobrar dias anteriores à admissão.
 */
export function afastamentoCobreCompetencia(args: {
  competencia: string; // "YYYY-MM"
  afastamentoInicio: string;
  afastamentoFim: string | null;
  admissao?: string | null;
  desligamento?: string | null;
}): boolean {
  const comp = String(args.competencia ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(comp)) return false;
  const inicioLic = String(args.afastamentoInicio ?? "").slice(0, 10);
  if (!inicioLic) return false;
  const fimLic = String(args.afastamentoFim ?? inicioLic).slice(0, 10);

  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5, 7));
  const primeiro = `${comp}-01`;
  const ultimo = `${comp}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;

  const admissao = String(args.admissao ?? "").slice(0, 10);
  const desligamento = String(args.desligamento ?? "").slice(0, 10);
  const inicioJanela = admissao && admissao > primeiro ? admissao : primeiro;
  const fimJanela = desligamento && desligamento < ultimo ? desligamento : ultimo;
  if (inicioJanela > fimJanela) return false;

  return inicioLic <= inicioJanela && fimLic >= fimJanela;
}
