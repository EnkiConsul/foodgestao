/**
 * Exame admissional (ASO) — NR-7 e art. 168 da CLT. Regras puras usadas pela
 * revisão do gestor; o servidor revalida tudo ao salvar e ao enviar.
 */
export type AsoModo = "agendado" | "realizado" | "dispensado";

export interface AsoDados {
  modo?: AsoModo;
  clinica?: string;
  endereco?: string;
  maps_url?: string;
  data?: string;
  hora?: string;
  telefone?: string;
  orientacoes?: string;
  data_realizacao?: string;
  medico?: string;
  crm?: string;
  parecer?: "apto" | "inapto";
  arquivo_path?: string;
  arquivo_nome?: string;
  base_legal?: string;
  justificativa?: string;
  dispensado_em?: string;
}

export const ASO_JUSTIFICATIVA_MIN = 15;

export const BASES_LEGAIS_DISPENSA = [
  { value: "nr1_me_epp_gr12", label: "NR-1 (item 1.8.4): ME/EPP com grau de risco 1 ou 2, sem riscos ocupacionais declarados" },
  { value: "nr7_exame_recente", label: "NR-7: exame ocupacional válido feito há menos de 135 dias (GR 1-2) ou 90 dias (GR 3-4)" },
  { value: "convencao_coletiva", label: "Previsão expressa em convenção ou acordo coletivo vigente" },
];

const MAPS = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i;
export const linkMapsValido = (url: string) => !url.trim() || MAPS.test(url.trim());

/** Só libera a contabilidade com ASO Apto anexado ou dispensa formalizada. */
export function asoLiberaContabilidade(aso: AsoDados | null | undefined): boolean {
  if (!aso) return false;
  if (aso.modo === "dispensado") return !!aso.base_legal && (aso.justificativa ?? "").trim().length >= ASO_JUSTIFICATIVA_MIN;
  return aso.modo === "realizado" && aso.parecer === "apto" && !!aso.arquivo_path;
}

const dataBr = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso ?? "");

export function mensagemAgendamentoAso(opts: { nome: string; cargo?: string; empresa?: string; aso: AsoDados }): string {
  const { aso } = opts;
  const primeiro = opts.nome.trim().split(/\s+/)[0] ?? "";
  const nome = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : "";
  const linhas = [
    `Olá, ${nome}! Seu exame admissional${opts.cargo ? ` para a vaga de ${opts.cargo}` : ""}${opts.empresa ? ` na ${opts.empresa}` : ""} foi agendado:`,
    "",
    `📅 Data: ${dataBr(aso.data)}${aso.hora ? ` às ${aso.hora}` : ""}`,
    `📍 Clínica: ${aso.clinica ?? ""}`,
    aso.endereco ? `🏠 Endereço: ${aso.endereco}` : null,
    aso.maps_url ? `🗺️ Como chegar: ${aso.maps_url}` : null,
    aso.telefone ? `📞 Contato da clínica: ${aso.telefone}` : null,
    aso.orientacoes ? `ℹ️ Orientações: ${aso.orientacoes}` : null,
    "",
    "Leve um documento original com foto.",
  ];
  return linhas.filter((l) => l !== null).join("\n");
}
