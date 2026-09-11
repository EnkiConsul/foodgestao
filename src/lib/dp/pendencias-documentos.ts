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

export type DocTipoColaborador = "contracheque" | "adiantamento" | "ponto" | "rescisao";

/** Tipos gravados em dp_documentos que satisfazem a pendência de rescisão. */
export const DOC_TIPOS_RESCISAO = ["trct", "demonstrativo_rescisorio"] as const;

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
  return String(c.vinculo_label ?? "").toLowerCase().includes("sóci");
}

/** Competência do desligamento ("YYYY-MM"), quando houver data. */
export function competenciaDoDesligamento(c: ColabElegibilidade): Competencia | null {
  const d = String(c.data_desligamento ?? "").slice(0, 10);
  return d ? competenciaDe(d) : null;
}

/** Foi desligado dentro da competência informada. */
export function desligadoNaCompetencia(c: ColabElegibilidade, comp: Competencia): boolean {
  return competenciaDoDesligamento(c) === comp;
}

export type ElegibilidadeOpts = {
  unidadeTemRelogio?: boolean;
  /** Dia do adiantamento da unidade (quando ela paga adiantamento). */
  diaAdiantamento?: number | null;
  /** Empresa que emite contracheque separado também no mês do desligamento. */
  exigirContrachequeMesDesligamento?: boolean;
  /**
   * Adiantamento: optante NA COMPETÊNCIA segundo o histórico de solicitações
   * (ativar/cancelar com data). Quando informado, sobrepõe o flag do cadastro.
   */
  optanteNaCompetencia?: boolean | null;
  /**
   * Intermitente: o gestor confirmou que a pessoa trabalhou na competência?
   * null = sem resposta; true = trabalhou; false = não trabalhou.
   */
  intermitenteTrabalho?: boolean | null;
  /** Intermitente sem nenhum registro de trabalho na competência
   * (ponto, convocação aceita ou escala publicada). */
  intermitenteSemRegistros?: boolean;
  /**
   * Afastado (licença/atestado) em todos os dias trabalháveis da competência:
   * não há ponto a bater, então a folha de ponto não é exigida.
   */
  afastadoMesInteiro?: boolean;
};


/** Intermitente sem evidência de trabalho e sem confirmação do gestor. */
export function intermitenteIncertoNaCompetencia(
  c: ColabElegibilidade,
  opts: ElegibilidadeOpts,
): boolean {
  return (
    String(c.regime ?? "").toLowerCase() === "intermitente" &&
    opts.intermitenteSemRegistros === true &&
    opts.intermitenteTrabalho !== true
  );
}

/**
 * O colaborador deve ter este documento nesta competência?
 * Não considera admissão/desligamento fora da competência — combine com
 * `ativoNaCompetencia`.
 *
 * Mês do desligamento: por padrão o pagamento vem no acerto da rescisão, então
 * o contracheque não é cobrado e a rescisão (TRCT/demonstrativo) passa a ser.
 */
export function elegivelDocumento(
  tipo: DocTipoColaborador,
  c: ColabElegibilidade,
  opts: ElegibilidadeOpts & { competencia?: Competencia | null } = {},
): boolean {
  const comp = opts.competencia ?? null;
  const desligadoNoMes = comp ? desligadoNaCompetencia(c, comp) : false;
  const assalariado = REGIMES_ASSALARIADOS.has(String(c.regime ?? "").toLowerCase()) && !isSocio(c);

  if (tipo === "rescisao") {
    return assalariado && desligadoNoMes;
  }
  // Intermitente sem registro de trabalho na competência: não cobra ponto nem
  // contracheque até o gestor confirmar que trabalhou (alerta separado).
  const intermitenteIncerto = intermitenteIncertoNaCompetencia(c, opts);

  if (tipo === "contracheque") {
    if (intermitenteIncerto) return false;
    if (desligadoNoMes && !opts.exigirContrachequeMesDesligamento) return false;
    return assalariado;
  }
  if (tipo === "adiantamento") {
    const optante = opts.optanteNaCompetencia ?? c.optante_adiantamento;
    if (optante !== true) return false;
    const dia = opts.diaAdiantamento ?? null;
    // Admitido no mês depois do dia do pagamento: não há adiantamento nesta
    // competência (a primeira competência com adiantamento é a seguinte).
    const admissao = String(c.data_admissao ?? "").slice(0, 10);
    if (comp && dia && admissao && admissao.slice(0, 7) === comp) {
      if (Number(admissao.slice(8, 10)) > dia) return false;
    }
    // Desligado antes do dia do adiantamento não recebe adiantamento no mês.
    const desligamento = String(c.data_desligamento ?? "").slice(0, 10);
    if (desligadoNoMes && dia && desligamento) {
      return Number(desligamento.slice(8, 10)) >= dia;
    }
    return true;
  }
  if (intermitenteIncerto) return false;
  // Mês 100% coberto por licença/afastamento: sem marcações a apresentar.
  if (opts.afastadoMesInteiro === true) return false;
  return opts.unidadeTemRelogio === true && c.possui_folha_ponto !== false;
}

