/**
 * Catálogo único de naturezas de documento do Pessoas 360°.
 *
 * Usado pela importação em massa (detecção automática), pelo histórico,
 * pelo portal do colaborador e pelas edge functions (espelhado lá).
 */

export type DpDocGrupo =
  | "remuneracao"
  | "jornada"
  | "ferias"
  | "admissao"
  | "desligamento"
  | "fiscais"
  | "outros";

export const DP_DOC_GRUPO_LABEL: Record<DpDocGrupo, string> = {
  remuneracao: "Remuneração",
  jornada: "Jornada",
  ferias: "Férias",
  admissao: "Admissão",
  desligamento: "Desligamento",
  fiscais: "Fiscais / Anuais",
  outros: "Outros",
};

export const DP_DOC_GRUPO_ORDEM: DpDocGrupo[] = [
  "remuneracao",
  "jornada",
  "ferias",
  "admissao",
  "desligamento",
  "fiscais",
  "outros",
];

export type DpDocTipo =
  | "contracheque"
  | "adiantamento"
  | "contracheque_13"
  | "contracheque_ferias"
  | "plr"
  | "outros_pagamentos"
  | "ponto"
  | "banco_horas"
  | "ajuste_jornada"
  | "aviso_ferias"
  | "recibo_ferias"
  | "outros_ferias"
  | "contrato"
  | "ficha_registro"
  | "termos"
  | "outros_admissao"
  | "aviso_previo"
  | "trct"
  | "demonstrativo_rescisorio"
  | "outros_desligamento"
  | "informe_rendimentos"
  | "outros_fiscais"
  | "atestado"
  | "disciplinar"
  | "ferias"
  | "sindicato"
  | "outros";

export interface DpDocTipoDef {
  value: DpDocTipo;
  label: string;
  grupo: DpDocGrupo;
  /** Exibido no seletor de importação em massa. */
  importavel: boolean;
  /** Pede aceite digital do colaborador por padrão. */
  exigeAceite: boolean;
  /** Palavras-chave para heurística por nome do arquivo/OCR. */
  keywords: string[];
  /** Classe de badge (borda + texto). */
  badgeClass: string;
}

export const DP_DOC_TIPOS: DpDocTipoDef[] = [
  // ---------- Remuneração ----------
  {
    value: "contracheque",
    label: "Contracheque Mensal",
    grupo: "remuneracao",
    importavel: true,
    exigeAceite: true,
    keywords: ["contracheque", "holerite", "recibo de pagamento", "demonstrativo de pagamento", "folha mensal"],
    badgeClass: "border-emerald-300 text-emerald-700",
  },
  {
    value: "adiantamento",
    label: "Adiantamento Salarial",
    grupo: "remuneracao",
    importavel: true,
    exigeAceite: true,
    keywords: ["adiantamento", "vale salarial", "antecipacao salarial"],
    badgeClass: "border-violet-300 text-violet-700",
  },
  {
    value: "contracheque_13",
    label: "13º Salário",
    grupo: "remuneracao",
    importavel: true,
    exigeAceite: true,
    keywords: ["13o salario", "13º salário", "decimo terceiro", "décimo terceiro", "gratificacao natalina"],
    badgeClass: "border-teal-300 text-teal-700",
  },
  {
    value: "contracheque_ferias",
    label: "Férias (Pagamento)",
    grupo: "remuneracao",
    importavel: true,
    exigeAceite: true,
    keywords: ["contracheque de ferias", "folha de ferias", "pagamento de ferias"],
    badgeClass: "border-sky-300 text-sky-700",
  },
  {
    value: "plr",
    label: "PLR",
    grupo: "remuneracao",
    importavel: true,
    exigeAceite: true,
    keywords: ["plr", "participacao nos lucros", "participacao nos resultados"],
    badgeClass: "border-lime-300 text-lime-700",
  },
  {
    value: "outros_pagamentos",
    label: "Outros Pagamentos",
    grupo: "remuneracao",
    importavel: true,
    exigeAceite: true,
    keywords: ["recibo de bonus", "premiacao", "abono"],
    badgeClass: "border-emerald-200 text-emerald-600",
  },

  // ---------- Jornada ----------
  {
    value: "ponto",
    label: "Espelho de Ponto",
    grupo: "jornada",
    importavel: true,
    exigeAceite: true,
    keywords: ["folha de ponto", "espelho de ponto", "cartao ponto", "registro de ponto", "marcacoes"],
    badgeClass: "border-amber-300 text-amber-700",
  },
  {
    value: "banco_horas",
    label: "Banco de Horas",
    grupo: "jornada",
    importavel: true,
    exigeAceite: true,
    keywords: ["banco de horas", "extrato de horas", "compensacao de horas"],
    badgeClass: "border-amber-200 text-amber-600",
  },
  {
    value: "ajuste_jornada",
    label: "Ajuste de Jornada",
    grupo: "jornada",
    importavel: true,
    exigeAceite: true,
    keywords: ["ajuste de jornada", "acordo de compensacao", "alteracao de jornada"],
    badgeClass: "border-orange-200 text-orange-600",
  },

  // ---------- Férias ----------
  {
    value: "aviso_ferias",
    label: "Aviso de Férias",
    grupo: "ferias",
    importavel: true,
    exigeAceite: true,
    keywords: ["aviso de ferias", "comunicado de ferias"],
    badgeClass: "border-cyan-300 text-cyan-700",
  },
  {
    value: "recibo_ferias",
    label: "Recibo de Férias",
    grupo: "ferias",
    importavel: true,
    exigeAceite: true,
    keywords: ["recibo de ferias", "quitacao de ferias"],
    badgeClass: "border-blue-300 text-blue-700",
  },
  {
    value: "outros_ferias",
    label: "Outros (Férias)",
    grupo: "ferias",
    importavel: true,
    exigeAceite: true,
    keywords: [],
    badgeClass: "border-cyan-200 text-cyan-600",
  },
  {
    value: "ferias",
    label: "Férias (Legado)",
    grupo: "ferias",
    importavel: false,
    exigeAceite: true,
    keywords: ["ferias"],
    badgeClass: "border-cyan-200 text-cyan-600",
  },

  // ---------- Admissão ----------
  {
    value: "contrato",
    label: "Contrato",
    grupo: "admissao",
    importavel: true,
    exigeAceite: true,
    keywords: ["contrato de trabalho", "termo de contrato"],
    badgeClass: "border-slate-300 text-slate-700",
  },
  {
    value: "ficha_registro",
    label: "Ficha de Registro",
    grupo: "admissao",
    importavel: true,
    exigeAceite: true,
    keywords: ["ficha de registro", "ficha de empregado"],
    badgeClass: "border-slate-300 text-slate-600",
  },
  {
    value: "termos",
    label: "Termos",
    grupo: "admissao",
    importavel: true,
    exigeAceite: true,
    keywords: ["termo de responsabilidade", "termo de ciencia", "termo de adesao", "termo de compromisso"],
    badgeClass: "border-zinc-300 text-zinc-600",
  },
  {
    value: "outros_admissao",
    label: "Outros (Admissão)",
    grupo: "admissao",
    importavel: true,
    exigeAceite: true,
    keywords: [],
    badgeClass: "border-zinc-200 text-zinc-600",
  },

  // ---------- Desligamento ----------
  {
    value: "aviso_previo",
    label: "Aviso Prévio",
    grupo: "desligamento",
    importavel: true,
    exigeAceite: true,
    keywords: ["aviso previo"],
    badgeClass: "border-rose-300 text-rose-700",
  },
  {
    value: "trct",
    label: "TRCT",
    grupo: "desligamento",
    importavel: true,
    exigeAceite: true,
    keywords: ["trct", "termo de rescisao do contrato de trabalho"],
    badgeClass: "border-red-300 text-red-700",
  },
  {
    value: "demonstrativo_rescisorio",
    label: "Demonstrativo Rescisório",
    grupo: "desligamento",
    importavel: true,
    exigeAceite: true,
    keywords: ["demonstrativo rescisorio", "calculo rescisorio", "rescisao"],
    badgeClass: "border-red-200 text-red-600",
  },
  {
    value: "outros_desligamento",
    label: "Outros (Desligamento)",
    grupo: "desligamento",
    importavel: true,
    exigeAceite: true,
    keywords: [],
    badgeClass: "border-rose-200 text-rose-600",
  },

  // ---------- Fiscais / Anuais ----------
  {
    value: "informe_rendimentos",
    label: "Informe de Rendimentos",
    grupo: "fiscais",
    importavel: true,
    exigeAceite: true,
    keywords: ["informe de rendimentos", "comprovante de rendimentos", "imposto de renda", "dirf"],
    badgeClass: "border-indigo-300 text-indigo-700",
  },
  {
    value: "outros_fiscais",
    label: "Outros (Fiscais)",
    grupo: "fiscais",
    importavel: true,
    exigeAceite: true,
    keywords: [],
    badgeClass: "border-indigo-200 text-indigo-600",
  },

  // ---------- Outros ----------
  {
    value: "atestado",
    label: "Atestado",
    grupo: "outros",
    importavel: true,
    exigeAceite: true,
    keywords: ["atestado", "cid", "afastamento medico"],
    badgeClass: "border-blue-300 text-blue-700",
  },
  {
    value: "disciplinar",
    label: "Disciplinar",
    grupo: "outros",
    importavel: true,
    exigeAceite: true,
    keywords: ["advertencia", "suspensao", "disciplinar"],
    badgeClass: "border-orange-300 text-orange-700",
  },
  {
    value: "sindicato",
    label: "Negociação Sindical",
    grupo: "outros",
    importavel: false,
    exigeAceite: false,
    keywords: ["convencao coletiva", "acordo coletivo", "cct", "act"],
    badgeClass: "border-rose-300 text-rose-700",
  },
  {
    value: "outros",
    label: "Outros",
    grupo: "outros",
    importavel: true,
    exigeAceite: false,
    keywords: [],
    badgeClass: "border-muted-foreground/40 text-muted-foreground",
  },
];

export const DP_DOC_TIPO_MAP: Record<string, DpDocTipoDef> = Object.fromEntries(
  DP_DOC_TIPOS.map((t) => [t.value, t]),
) as Record<string, DpDocTipoDef>;

export const DP_DOC_TIPOS_IMPORTAVEIS = DP_DOC_TIPOS.filter((t) => t.importavel);

/** Grupos com seus tipos, na ordem de exibição da barra de naturezas. */
export const DP_DOC_GRUPOS: Array<{ grupo: DpDocGrupo; label: string; tipos: DpDocTipoDef[] }> =
  DP_DOC_GRUPO_ORDEM.map((g) => ({
    grupo: g,
    label: DP_DOC_GRUPO_LABEL[g],
    tipos: DP_DOC_TIPOS.filter((t) => t.grupo === g),
  }));

export function docTipoLabel(tipo?: string | null): string {
  if (!tipo) return "Outros";
  return DP_DOC_TIPO_MAP[tipo]?.label ?? tipo;
}

export function docTipoBadgeClass(tipo?: string | null): string {
  return DP_DOC_TIPO_MAP[tipo ?? ""]?.badgeClass ?? "border-muted-foreground/40 text-muted-foreground";
}

export function docTipoExigeAceite(tipo?: string | null): boolean {
  return DP_DOC_TIPO_MAP[tipo ?? ""]?.exigeAceite ?? false;
}

export function docTipoGrupo(tipo?: string | null): DpDocGrupo {
  return DP_DOC_TIPO_MAP[tipo ?? ""]?.grupo ?? "outros";
}

export function tiposDoGrupo(grupo: DpDocGrupo): string[] {
  return DP_DOC_TIPOS.filter((t) => t.grupo === grupo).map((t) => t.value);
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Heurística de natureza a partir de um texto livre (nome do arquivo ou OCR).
 * Retorna null quando nada é reconhecido com segurança.
 */
export function detectarTipoDocumento(texto: string | null | undefined): DpDocTipo | null {
  if (!texto) return null;
  const t = normalizar(texto);

  // Ordem importa: específicos antes dos genéricos.
  const ordem: DpDocTipo[] = [
    "contracheque_13",
    "contracheque_ferias",
    "aviso_ferias",
    "recibo_ferias",
    "informe_rendimentos",
    "plr",
    "adiantamento",
    "banco_horas",
    "ajuste_jornada",
    "ponto",
    "aviso_previo",
    "trct",
    "demonstrativo_rescisorio",
    "atestado",
    "disciplinar",
    "ficha_registro",
    "contrato",
    "termos",
    "sindicato",
    "contracheque",
    "ferias",
  ];
  for (const tipo of ordem) {
    const def = DP_DOC_TIPO_MAP[tipo];
    if (def?.keywords.some((k) => t.includes(normalizar(k)))) return tipo;
  }
  return null;
}

/**
 * Assinatura normalizada de um documento, usada como chave do aprendizado.
 * Combina o padrão do nome do arquivo (sem números/datas) com o cabeçalho do texto.
 */
export function assinaturaDocumento(nomeArquivo?: string | null, ocr?: string | null): string {
  const nome = normalizar(nomeArquivo ?? "")
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[0-9]+/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .trim()
    .slice(0, 60);
  const cabecalho = normalizar(ocr ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ")
    .replace(/[0-9]+/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .trim()
    .slice(0, 90);
  return [nome, cabecalho].filter(Boolean).join(" | ");
}
