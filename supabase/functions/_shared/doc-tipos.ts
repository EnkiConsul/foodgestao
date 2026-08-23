// Catálogo de naturezas de documento (espelho de src/lib/dp/documentoTipos.ts).

export type DocTipo =
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

export const DOC_TIPO_LABEL: Record<string, string> = {
  contracheque: "Contracheque Mensal",
  adiantamento: "Adiantamento Salarial",
  contracheque_13: "13º Salário",
  contracheque_ferias: "Férias (Pagamento)",
  plr: "PLR",
  outros_pagamentos: "Outros Pagamentos",
  ponto: "Espelho de Ponto",
  banco_horas: "Banco de Horas",
  ajuste_jornada: "Ajuste de Jornada",
  aviso_ferias: "Aviso de Férias",
  recibo_ferias: "Recibo de Férias",
  outros_ferias: "Outros (Férias)",
  contrato: "Contrato",
  ficha_registro: "Ficha de Registro",
  termos: "Termos",
  outros_admissao: "Outros (Admissão)",
  aviso_previo: "Aviso Prévio",
  trct: "TRCT",
  demonstrativo_rescisorio: "Demonstrativo Rescisório",
  outros_desligamento: "Outros (Desligamento)",
  informe_rendimentos: "Informe de Rendimentos",
  outros_fiscais: "Outros (Fiscais)",
  atestado: "Atestado",
  disciplinar: "Disciplinar",
  ferias: "Férias",
  sindicato: "Negociação Sindical",
  outros: "Documento",
};

/** Tipos que pedem aceite digital do colaborador. */
export const DOC_TIPO_EXIGE_ACEITE: Record<string, boolean> = Object.fromEntries(
  Object.keys(DOC_TIPO_LABEL).map((k) => [k, k !== "sindicato" && k !== "outros"]),
);

const KEYWORDS: Array<[DocTipo, string[]]> = [
  ["contracheque_13", ["13o salario", "13 salario", "decimo terceiro", "gratificacao natalina"]],
  ["contracheque_ferias", ["contracheque de ferias", "folha de ferias", "pagamento de ferias", "contracheque ferias"]],
  ["aviso_ferias", ["aviso de ferias", "comunicado de ferias"]],
  ["recibo_ferias", ["recibo de ferias", "quitacao de ferias"]],
  ["informe_rendimentos", ["informe de rendimentos", "comprovante de rendimentos", "imposto de renda", "dirf"]],
  ["plr", ["plr", "participacao nos lucros", "participacao nos resultados"]],
  ["adiantamento", ["adiantamento", "antecipacao salarial", "vale salarial"]],
  ["banco_horas", ["banco de horas", "extrato de horas", "compensacao de horas"]],
  ["ajuste_jornada", ["ajuste de jornada", "acordo de compensacao", "alteracao de jornada"]],
  ["ponto", ["folha de ponto", "espelho de ponto", "cartao ponto", "registro de ponto"]],
  ["aviso_previo", ["aviso previo"]],
  ["trct", ["trct", "termo de rescisao do contrato de trabalho"]],
  ["demonstrativo_rescisorio", ["demonstrativo rescisorio", "calculo rescisorio", "rescisao"]],
  ["atestado", ["atestado medico", "atestado"]],
  ["disciplinar", ["advertencia", "suspensao disciplinar", "disciplinar"]],
  ["ficha_registro", ["ficha de registro", "ficha de empregado"]],
  ["contrato", ["contrato de trabalho"]],
  ["termos", ["termo de responsabilidade", "termo de ciencia", "termo de adesao", "termo de compromisso"]],
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

/**
 * Assinatura normalizada do documento (chave do aprendizado por empresa).
 * Espelha assinaturaDocumento() do front.
 */
export function assinaturaDocumento(nomeArquivo?: string | null, ocr?: string | null): string {
  const nome = norm(nomeArquivo ?? "")
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[0-9]+/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .trim()
    .slice(0, 60);
  const cabecalho = norm(ocr ?? "")
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

/** Indícios textuais de que o documento já vem assinado pelo colaborador. */
const ASSINATURA_KEYS: string[] = [
  "assinado digitalmente",
  "assinatura eletronica",
  "assinatura digital",
  "icp-brasil",
  "icp brasil",
  "docusign",
  "clicksign",
  "d4sign",
  "zapsign",
  "autentique",
  "gov.br",
  "assinatura do empregado",
  "assinatura do colaborador",
  "assinatura do funcionario",
  "assinatura do trabalhador",
  "ciente e de acordo",
];

/**
 * Detecta se a página já contém assinatura do colaborador.
 * Usa a linha `ASSINADO: SIM/NAO` devolvida pelo OCR e, como reforço,
 * palavras-chave de assinatura manuscrita ou eletrônica.
 */
export function detectarAssinatura(ocr: string | null | undefined): {
  detectada: boolean;
  evidencia: string | null;
} {
  const texto = ocr ?? "";
  const linha = texto.match(/ASSINADO:\s*(SIM|NAO|N[ÃA]O)/i);
  const t = norm(texto);
  const chave = ASSINATURA_KEYS.find((k) => t.includes(norm(k))) ?? null;

  if (linha && /^s/i.test(linha[1])) {
    return { detectada: true, evidencia: chave ?? "assinatura identificada na página" };
  }
  if (chave) return { detectada: true, evidencia: chave };
  return { detectada: false, evidencia: null };
}
