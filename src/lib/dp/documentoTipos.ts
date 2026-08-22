/**
 * Catálogo único de naturezas de documento do Pessoas 360°.
 *
 * Usado pela importação em massa (detecção automática), pelo histórico,
 * pelo portal do colaborador e pelas edge functions (espelhado lá).
 */

export type DpDocTipo =
  | "contracheque"
  | "contracheque_13"
  | "contracheque_ferias"
  | "adiantamento"
  | "ponto"
  | "aviso_ferias"
  | "recibo_ferias"
  | "informe_rendimentos"
  | "ferias"
  | "atestado"
  | "disciplinar"
  | "contrato"
  | "sindicato"
  | "outros";

export interface DpDocTipoDef {
  value: DpDocTipo;
  label: string;
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
  {
    value: "contracheque",
    label: "Contracheque Mensal",
    importavel: true,
    exigeAceite: true,
    keywords: ["contracheque", "holerite", "recibo de pagamento", "demonstrativo de pagamento", "folha mensal"],
    badgeClass: "border-emerald-300 text-emerald-700",
  },
  {
    value: "contracheque_13",
    label: "Contracheque 13º",
    importavel: true,
    exigeAceite: true,
    keywords: ["13o salario", "13º salário", "decimo terceiro", "décimo terceiro", "gratificacao natalina"],
    badgeClass: "border-teal-300 text-teal-700",
  },
  {
    value: "contracheque_ferias",
    label: "Contracheque Férias",
    importavel: true,
    exigeAceite: true,
    keywords: ["contracheque de ferias", "folha de ferias", "pagamento de ferias"],
    badgeClass: "border-sky-300 text-sky-700",
  },
  {
    value: "adiantamento",
    label: "Adiantamento Salarial",
    importavel: true,
    exigeAceite: true,
    keywords: ["adiantamento", "vale salarial", "antecipacao salarial"],
    badgeClass: "border-violet-300 text-violet-700",
  },
  {
    value: "ponto",
    label: "Folha de Ponto",
    importavel: true,
    exigeAceite: true,
    keywords: ["folha de ponto", "espelho de ponto", "cartao ponto", "registro de ponto", "marcacoes"],
    badgeClass: "border-amber-300 text-amber-700",
  },
  {
    value: "aviso_ferias",
    label: "Aviso de Férias",
    importavel: true,
    exigeAceite: true,
    keywords: ["aviso de ferias", "comunicado de ferias"],
    badgeClass: "border-cyan-300 text-cyan-700",
  },
  {
    value: "recibo_ferias",
    label: "Recibo de Férias",
    importavel: true,
    exigeAceite: true,
    keywords: ["recibo de ferias", "quitacao de ferias"],
    badgeClass: "border-blue-300 text-blue-700",
  },
  {
    value: "informe_rendimentos",
    label: "Informe de Rendimentos",
    importavel: true,
    exigeAceite: true,
    keywords: ["informe de rendimentos", "comprovante de rendimentos", "imposto de renda", "dirf"],
    badgeClass: "border-indigo-300 text-indigo-700",
  },
  {
    value: "ferias",
    label: "Férias (Outros)",
    importavel: true,
    exigeAceite: true,
    keywords: ["ferias"],
    badgeClass: "border-sky-300 text-sky-700",
  },
  {
    value: "atestado",
    label: "Atestado",
    importavel: true,
    exigeAceite: true,
    keywords: ["atestado", "cid", "afastamento medico"],
    badgeClass: "border-blue-300 text-blue-700",
  },
  {
    value: "disciplinar",
    label: "Disciplinar",
    importavel: true,
    exigeAceite: true,
    keywords: ["advertencia", "suspensao", "disciplinar"],
    badgeClass: "border-orange-300 text-orange-700",
  },
  {
    value: "contrato",
    label: "Contrato",
    importavel: true,
    exigeAceite: true,
    keywords: ["contrato de trabalho", "termo de contrato"],
    badgeClass: "border-slate-300 text-slate-700",
  },
  {
    value: "sindicato",
    label: "Negociação Sindical",
    importavel: false,
    exigeAceite: false,
    keywords: ["convencao coletiva", "acordo coletivo", "cct", "act"],
    badgeClass: "border-rose-300 text-rose-700",
  },
  {
    value: "outros",
    label: "Outros",
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
    "adiantamento",
    "ponto",
    "atestado",
    "disciplinar",
    "contrato",
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
