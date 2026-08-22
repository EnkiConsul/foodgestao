// Catálogo de naturezas de documento (espelho de src/lib/dp/documentoTipos.ts).

export type DocTipo =
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

export const DOC_TIPO_LABEL: Record<string, string> = {
  contracheque: "Contracheque",
  contracheque_13: "Contracheque 13º",
  contracheque_ferias: "Contracheque Férias",
  adiantamento: "Adiantamento Salarial",
  ponto: "Folha de Ponto",
  aviso_ferias: "Aviso de Férias",
  recibo_ferias: "Recibo de Férias",
  informe_rendimentos: "Informe de Rendimentos",
  ferias: "Férias",
  atestado: "Atestado",
  disciplinar: "Disciplinar",
  contrato: "Contrato",
  sindicato: "Negociação Sindical",
  outros: "Documento",
};

/** Tipos que pedem aceite digital do colaborador. */
export const DOC_TIPO_EXIGE_ACEITE: Record<string, boolean> = {
  contracheque: true,
  contracheque_13: true,
  contracheque_ferias: true,
  adiantamento: true,
  ponto: true,
  aviso_ferias: true,
  recibo_ferias: true,
  informe_rendimentos: true,
  ferias: true,
  atestado: true,
  disciplinar: true,
  contrato: true,
  sindicato: false,
  outros: false,
};

const KEYWORDS: Array<[DocTipo, string[]]> = [
  ["contracheque_13", ["13o salario", "13 salario", "decimo terceiro", "gratificacao natalina"]],
  ["contracheque_ferias", ["contracheque de ferias", "folha de ferias", "pagamento de ferias", "contracheque ferias"]],
  ["aviso_ferias", ["aviso de ferias", "comunicado de ferias"]],
  ["recibo_ferias", ["recibo de ferias", "quitacao de ferias"]],
  ["informe_rendimentos", ["informe de rendimentos", "comprovante de rendimentos", "imposto de renda", "dirf"]],
  ["adiantamento", ["adiantamento", "antecipacao salarial", "vale salarial"]],
  ["ponto", ["folha de ponto", "espelho de ponto", "cartao ponto", "registro de ponto"]],
  ["atestado", ["atestado medico", "atestado"]],
  ["disciplinar", ["advertencia", "suspensao disciplinar", "disciplinar"]],
  ["contrato", ["contrato de trabalho"]],
  ["sindicato", ["convencao coletiva", "acordo coletivo"]],
  ["contracheque", ["contracheque", "holerite", "recibo de pagamento", "demonstrativo de pagamento"]],
  ["ferias", ["ferias"]],
];

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Heurística por palavras-chave (nome do arquivo ou texto OCR). */
export function detectTipoFromText(texto: string | null | undefined): DocTipo | null {
  if (!texto) return null;
  const t = norm(texto);
  for (const [tipo, keys] of KEYWORDS) {
    if (keys.some((k) => t.includes(norm(k)))) return tipo;
  }
  return null;
}

/** Lê a linha `NATUREZA: xxx` que o OCR devolve. */
export function parseNaturezaLine(ocr: string): DocTipo | null {
  const m = ocr.match(/NATUREZA:\s*([a-z_0-9º\s]+)/i);
  if (!m) return null;
  const raw = norm(m[1]).trim().replace(/\s+/g, "_");
  const direto = Object.keys(DOC_TIPO_LABEL).find((k) => k === raw);
  if (direto) return direto as DocTipo;
  return detectTipoFromText(m[1]);
}
