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

/** Licenças curtas da CLT (art. 473) — faltas abonadas por lei. */
export const TIPOS_LICENCA_CURTA = [
  "licenca_luto",
  "licenca_casamento",
  "doacao_sangue",
  "alistamento_eleitoral",
  "servico_militar",
  "vestibular",
  "comparecimento_judicial",
  "acompanhamento_consulta",
  "exame_preventivo",
] as const;
export type TipoLicencaCurta = (typeof TIPOS_LICENCA_CURTA)[number];

/** Tipos de solicitação tratados como afastamento (atestado + licenças). */
export const TIPOS_AFASTAMENTO = ["atestado", ...TIPOS_LICENCA, ...TIPOS_LICENCA_CURTA] as const;
export type TipoAfastamento = (typeof TIPOS_AFASTAMENTO)[number];

export const TIPO_AFASTAMENTO_LABEL: Record<TipoAfastamento, string> = {
  atestado: "Atestado",
  licenca_maternidade: "Licença-maternidade",
  licenca_paternidade: "Licença-paternidade",
  licenca_luto: "Licença luto / falecimento",
  licenca_casamento: "Licença casamento",
  doacao_sangue: "Doação de sangue",
  alistamento_eleitoral: "Alistamento eleitoral",
  servico_militar: "Serviço militar",
  vestibular: "Vestibular / Enem",
  comparecimento_judicial: "Comparecimento à Justiça",
  acompanhamento_consulta: "Acompanhamento em consulta",
  exame_preventivo: "Exame preventivo de câncer",
};

/** Duração legal padrão em dias (editável no cadastro). */
export const DURACAO_PADRAO_DIAS: Record<TipoLicenca, number> & Partial<Record<TipoLicencaCurta, number>> = {
  licenca_maternidade: 120,
  licenca_paternidade: 5,
  licenca_luto: 2,
  licenca_casamento: 3,
  doacao_sangue: 1,
  alistamento_eleitoral: 2,
  vestibular: 1,
  comparecimento_judicial: 1,
  acompanhamento_consulta: 1,
  exame_preventivo: 1,
};

export interface FundamentoLegal {
  artigo: string;
  prazo: string;
  contagem: string;
  /** Boa prática: oferecer outra folga se a licença cair sobre a folga (inclusive de fim de semana). */
  remarcarFolga: boolean;
  observacao: string;
}

/** Embasamento legal exibido ao gestor no cadastro da ausência. */
export const FUNDAMENTO_LEGAL: Record<TipoAfastamento, FundamentoLegal> = {
  atestado: {
    artigo: "Lei 605/1949, art. 6º, §1º, f; CLT art. 473",
    prazo: "Conforme o atestado (até 15 dias pela empresa; depois, INSS)",
    contagem: "Dias corridos",
    remarcarFolga: false,
    observacao: "Folga que coincide com o atestado não gera nova folga; o DSR é mantido.",
  },
  licenca_maternidade: {
    artigo: "CF art. 7º, XVIII; CLT art. 392",
    prazo: "120 dias (180 em empresa do Empresa Cidadã)",
    contagem: "Dias corridos",
    remarcarFolga: false,
    observacao: "Folgas dentro do período são absorvidas pela licença.",
  },
  licenca_paternidade: {
    artigo: "CF art. 7º, XIX; ADCT art. 10, §1º",
    prazo: "5 dias (20 em empresa do Empresa Cidadã)",
    contagem: "Dias corridos a partir do nascimento",
    remarcarFolga: true,
    observacao: "Por ser curta, a boa prática é remarcar a folga que cair no período.",
  },
  licenca_luto: {
    artigo: "CLT art. 473, I",
    prazo: "2 dias consecutivos (cônjuge, pais, filhos, irmãos ou dependente)",
    contagem: "Dias consecutivos a partir do óbito",
    remarcarFolga: true,
    observacao: "Convenção coletiva pode ampliar o prazo — confira a da unidade.",
  },
  licenca_casamento: {
    artigo: "CLT art. 473, II",
    prazo: "3 dias consecutivos",
    contagem: "Dias consecutivos a partir do casamento",
    remarcarFolga: true,
    observacao: "Convenção coletiva pode ampliar o prazo — confira a da unidade.",
  },
  doacao_sangue: {
    artigo: "CLT art. 473, IV",
    prazo: "1 dia a cada 12 meses",
    contagem: "Dia da doação, com comprovante",
    remarcarFolga: true,
    observacao: "Exija o comprovante do hemocentro.",
  },
  alistamento_eleitoral: {
    artigo: "CLT art. 473, V",
    prazo: "Até 2 dias, consecutivos ou não",
    contagem: "Dias do alistamento",
    remarcarFolga: true,
    observacao: "Vale para alistamento ou transferência de título.",
  },
  servico_militar: {
    artigo: "CLT art. 473, VI; Lei 4.375/1964, art. 65",
    prazo: "Período das exigências do serviço militar",
    contagem: "Dias de convocação comprovados",
    remarcarFolga: true,
    observacao: "Exija o documento da junta militar.",
  },
  vestibular: {
    artigo: "CLT art. 473, VII",
    prazo: "Dias de prova",
    contagem: "Dias de exame, com comprovante",
    remarcarFolga: true,
    observacao: "Vale para vestibular e Enem para ingresso no ensino superior.",
  },
  comparecimento_judicial: {
    artigo: "CLT art. 473, VIII e IX",
    prazo: "Tempo necessário para comparecer em juízo",
    contagem: "Dia da audiência, com comprovante",
    remarcarFolga: true,
    observacao: "Inclui testemunha, jurado e representante sindical em reunião oficial.",
  },
  acompanhamento_consulta: {
    artigo: "CLT art. 473, X e XI",
    prazo: "Até 6 consultas da gestante; 1 dia por ano por filho até 6 anos",
    contagem: "Dia da consulta, com comprovante",
    remarcarFolga: true,
    observacao: "Acompanhar esposa/companheira grávida ou filho pequeno.",
  },
  exame_preventivo: {
    artigo: "CLT art. 473, XII",
    prazo: "Até 3 dias a cada 12 meses",
    contagem: "Dias de exame, com comprovante",
    remarcarFolga: true,
    observacao: "Exames preventivos de câncer devidamente comprovados.",
  },
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

/** Até 15 dias a empresa paga (Atestado); a partir do 16º dia é benefício do INSS (Lei 8.213/91, art. 60). */
export const LIMITE_DIAS_ATESTADO_EMPRESA = 15;

/** Dias corridos do afastamento (início e fim inclusive). */
export function diasCorridos(inicio: string, fim?: string | null): number {
  return differenceInCalendarDays(parseISO(fim || inicio), parseISO(inicio)) + 1;
}

/** Rótulo pelo tipo e pela duração: atestado com mais de 15 dias vira "Licença INSS". */
export function rotuloAfastamento(tipo: string | null | undefined, inicio?: string | null, fim?: string | null): string {
  if (tipo === "atestado" && inicio && diasCorridos(inicio, fim) > LIMITE_DIAS_ATESTADO_EMPRESA) return "Licença INSS";
  if (tipo === "suspensao") return "Suspensão";
  return labelAfastamento(tipo);
}

/** Duração padrão do tipo, quando existir. */
export function duracaoPadrao(tipo: string | null | undefined): number | null {
  if (!tipo) return null;
  return (DURACAO_PADRAO_DIAS as Record<string, number | undefined>)[tipo] ?? null;
}

/**
 * Sugere a data final a partir do início e da duração padrão da licença.
 * Retorna null quando o tipo não tem duração padrão ou o início é inválido.
 */
export function sugestaoDataFim(tipo: string, dataInicioISO: string): string | null {
  const dias = duracaoPadrao(tipo);
  if (!dias || !dataInicioISO) return null;
  const inicio = parseISO(dataInicioISO);
  if (Number.isNaN(inicio.getTime())) return null;
  return format(addDays(inicio, dias - 1), "yyyy-MM-dd");
}

/** Datas (ISO) do período que caem em sábado ou domingo. */
export function fimDeSemanaNoPeriodo(inicioISO: string, fimISO: string | null | undefined): string[] {
  if (!inicioISO) return [];
  const ini = parseISO(inicioISO);
  const fim = parseISO(fimISO || inicioISO);
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime()) || fim < ini) return [];
  const out: string[] = [];
  for (let d = ini, i = 0; d <= fim && i < 400; d = addDays(d, 1), i++) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) out.push(format(d, "yyyy-MM-dd"));
  }
  return out;
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
