/** Tipos de vínculo aceitos na admissão (mesmos valores canônicos do banco). */
export const REGIMES_ADMISSAO: { value: string; label: string }[] = [
  { value: "clt", label: "Fixo (CLT)" },
  { value: "intermitente", label: "Intermitente" },
  { value: "estagio", label: "Estágio" },
  { value: "temporario", label: "Temporário" },
  { value: "pj", label: "Prestador PJ" },
  { value: "mei", label: "MEI" },
  { value: "freelancer", label: "Freelancer" },
];

export const rotuloRegime = (v?: string | null) =>
  REGIMES_ADMISSAO.find((r) => r.value === v)?.label ?? (v ?? "");
