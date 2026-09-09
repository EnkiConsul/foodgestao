// ------------------------------------------------------------------
// Domínio: DP → pendências de documentos por competência (contracheque,
// folha de ponto e adiantamento).
//
// Regras:
// - A cobrança começa uma competência ANTES do mês em que a unidade foi
//   cadastrada no sistema. Importar algo mais antigo é livre, mas não é cobrado.
// - Cada competência em falta gera sua própria pendência.
// - A data limite é configurável: contracheque e folha de ponto vencem num dia
//   do mês seguinte à competência; o adiantamento vence dentro do próprio mês.
// - Antes da data limite a pendência já aparece (como "a importar"); o atraso
//   negativo é o que a classifica como próxima em `pendencias.ts`.
// ------------------------------------------------------------------

/** Competência no formato "YYYY-MM". */
export type Competencia = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function competenciaDe(iso: string): Competencia {
  return iso.slice(0, 7);
}

export function somarMeses(comp: Competencia, meses: number): Competencia {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5, 7));
  const total = ano * 12 + (mes - 1) + meses;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Primeira competência cobrada: uma antes do cadastro da unidade. */
export function primeiraCompetenciaCobrada(cadastroISO: string): Competencia {
  return somarMeses(competenciaDe(cadastroISO), -1);
}

/**
 * Competências a verificar, da mais antiga para a mais recente.
 * `ultima` é a competência final (inclusive) — normalmente o mês anterior
 * (contracheque/ponto) ou o mês vigente (adiantamento).
 */
export function competenciasParaCobrar(args: {
  cadastroISO: string;
  ultima: Competencia;
  /** Limite de segurança para não gerar listas enormes. */
  maximo?: number;
}): Competencia[] {
  const { cadastroISO, ultima } = args;
  const maximo = args.maximo ?? 24;
  let atual = primeiraCompetenciaCobrada(cadastroISO);
  const out: Competencia[] = [];
  while (atual <= ultima && out.length < maximo) {
    out.push(atual);
    atual = somarMeses(atual, 1);
  }
  // Quando o cadastro é antigo demais, mantém as competências mais recentes.
  if (atual <= ultima) {
    const todas: Competencia[] = [];
    let c = ultima;
    for (let i = 0; i < maximo; i++) {
      todas.unshift(c);
      c = somarMeses(c, -1);
    }
    return todas;
  }
  return out;
}

/** Intervalo de datas (ISO) da competência, para consultar `referencia_data`. */
export function intervaloCompetencia(comp: Competencia): { inicio: string; fim: string } {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5, 7));
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return { inicio: `${comp}-01`, fim: `${comp}-${pad(ultimoDia)}` };
}

function diaValido(comp: Competencia, dia: number): string {
  const ano = Number(comp.slice(0, 4));
  const mes = Number(comp.slice(5, 7));
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return `${comp}-${pad(Math.min(Math.max(dia, 1), ultimoDia))}`;
}

/** Data limite no mês seguinte à competência (contracheque, folha de ponto). */
export function limiteMesSeguinte(comp: Competencia, dia: number): string {
  return diaValido(somarMeses(comp, 1), dia);
}

/** Data limite dentro do próprio mês da competência (adiantamento). */
export function limiteNoMes(comp: Competencia, dia: number): string {
  return diaValido(comp, dia);
}

/** Dias de atraso: positivo já venceu, zero vence hoje, negativo ainda vai vencer. */
export function atrasoEmDias(vencimentoISO: string, hojeISO: string): number {
  const a = new Date(`${hojeISO}T12:00:00`).getTime();
  const b = new Date(`${vencimentoISO}T12:00:00`).getTime();
  return Math.round((a - b) / 86400000);
}

export const MES_NOME = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "julho/2026" para o subtítulo da pendência. */
export function competenciaLabel(comp: Competencia): string {
  return `${MES_NOME[Number(comp.slice(5, 7)) - 1]}/${comp.slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// Elegibilidade de documentos por colaborador/competência.
// Fonte única compartilhada entre a Conferência de Documentos e as pendências.
// ---------------------------------------------------------------------------

export const REGIMES_ASSALARIADOS = new Set(["clt", "intermitente", "temporario", "aprendiz"]);

export type DocTipoColaborador = "contracheque" | "adiantamento" | "ponto";

export type ColabElegibilidade = {
  id: string;
  regime?: string | null;
  ativo?: boolean | null;
  vinculo_label?: string | null;
  possui_folha_ponto?: boolean | null;
  optante_adiantamento?: boolean | null;
  data_admissao?: string | null;
  data_desligamento?: string | null;
};

/** Sócio não recebe contracheque (recebe recibo de pró-labore). */
export function isSocio(c: ColabElegibilidade): boolean {
  return String(c.vinculo_label ?? "").toLowerCase().includes("sócio");
}

/**
 * O colaborador deve ter este documento nesta competência?
 * Não considera datas de admissão/desligamento — combine com `ativoNaCompetencia`.
 */
export function elegivelDocumento(
  tipo: DocTipoColaborador,
  c: ColabElegibilidade,
  opts: { unidadeTemRelogio?: boolean } = {},
): boolean {
  if (tipo === "contracheque") {
    return REGIMES_ASSALARIADOS.has(String(c.regime ?? "").toLowerCase()) && !isSocio(c);
  }
  if (tipo === "adiantamento") return c.optante_adiantamento === true;
  return opts.unidadeTemRelogio === true && c.possui_folha_ponto !== false;
}
