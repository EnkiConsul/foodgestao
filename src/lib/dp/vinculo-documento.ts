// ------------------------------------------------------------------
// Domínio: DP → natureza do documento gerado na pré-admissão por vínculo.
//
// Cada vínculo tem uma natureza jurídica própria: um prestador PJ nunca pode
// receber um PDF intitulado "Ficha de Admissão" (vira prova de vínculo de
// emprego numa audiência), e o exame admissional (ASO, NR-7 / art. 168 CLT)
// só se aplica a empregados CLT e intermitentes.
// Função pura — sem React, sem Supabase. Espelhada no servidor em
// `supabase/functions/_shared/vinculo-documento.ts` (mantenha os dois iguais).
// ------------------------------------------------------------------

/** Regimes com vínculo de emprego: exigem ASO e ficha de registro. */
export function regimeEhEmprego(regime?: string | null): boolean {
  const r = String(regime ?? "clt").trim().toLowerCase();
  return r === "clt" || r === "intermitente";
}

export interface DocumentoVinculo {
  /** Nome do documento no cabeçalho e na faixa de situação do PDF. */
  titulo: string;
  /** Slug usado no nome do arquivo baixado. */
  slug: string;
  /** Se o fluxo exige exame admissional (ASO) antes da liberação. */
  aso: boolean;
}

const PADRAO_CLT: DocumentoVinculo = { titulo: "Ficha de Admissão", slug: "ficha-admissao", aso: true };

const POR_REGIME: Record<string, DocumentoVinculo> = {
  clt: PADRAO_CLT,
  intermitente: PADRAO_CLT,
  estagio: { titulo: "Ficha de Estagiário", slug: "ficha-estagiario", aso: false },
  pj: { titulo: "Cadastro de Prestador PJ", slug: "cadastro-prestador-pj", aso: false },
  mei: { titulo: "Cadastro de Prestador PJ", slug: "cadastro-prestador-pj", aso: false },
  freelancer: { titulo: "Ficha de Profissional Eventual", slug: "ficha-profissional-eventual", aso: false },
  temporario: { titulo: "Ficha de Trabalhador Temporário", slug: "ficha-temporario", aso: false },
};

/** Documento correto para o vínculo; desconhecido cai no padrão CLT. */
export function documentoPorVinculo(regime?: string | null): DocumentoVinculo {
  return POR_REGIME[String(regime ?? "clt").trim().toLowerCase()] ?? PADRAO_CLT;
}
