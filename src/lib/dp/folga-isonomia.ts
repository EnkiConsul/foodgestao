// Domínio: DP → Folgas diferenciadas × Princípio da Isonomia.
// Classifica o enquadramento sindical entre quem recebe a exceção e os colegas
// da mesma unidade que seguem a regra padrão, e monta o alerta com a base legal.

export const BASE_LEGAL_ISONOMIA = "Art. 5º, caput, e Art. 7º, XXX, da Constituição Federal; Art. 461 da CLT";
export const JUSTIFICATIVA_ISONOMIA_MIN = 15;

export type CenarioIsonomia = "mesmo_enquadramento" | "sem_sindicato" | "enquadramento_diferente";

export interface PessoaEnquadramento {
  id: string;
  sindicato_id: string | null;
}

export interface AlertaIsonomia {
  cenario: CenarioIsonomia;
  titulo: string;
  mensagem: string;
  afirmativo: boolean;
  sindicatosAlvo: (string | null)[];
  sindicatosColegas: (string | null)[];
  colegasNaRegraPadrao: number;
}

const unicos = (v: (string | null)[]) => Array.from(new Set(v));

/**
 * O patronal é o da unidade (igual para todos), por isso a diferença de
 * enquadramento só pode vir do sindicato laboral de cada pessoa.
 */
export function classificarIsonomia(alvo: PessoaEnquadramento[], colegas: PessoaEnquadramento[]): AlertaIsonomia {
  const sa = unicos(alvo.map((p) => p.sindicato_id ?? null));
  const sc = unicos(colegas.map((p) => p.sindicato_id ?? null));
  const todos = unicos([...sa, ...sc]);
  let cenario: CenarioIsonomia;
  if (todos.every((s) => s === null)) cenario = "sem_sindicato";
  else if (todos.length === 1) cenario = "mesmo_enquadramento";
  else cenario = "enquadramento_diferente";

  const afirmativo = cenario !== "enquadramento_diferente";
  const mensagem = afirmativo
    ? `Princípio da Isonomia (${BASE_LEGAL_ISONOMIA}): colaboradores da mesma unidade e mesmo enquadramento sindical devem ter as mesmas condições de descanso. Esta diferenciação gera risco de questionamento por tratamento desigual e precisa de motivo objetivo documentado.`
    : `Atenção ao Princípio da Isonomia (${BASE_LEGAL_ISONOMIA}): há enquadramento sindical diferente entre os envolvidos. A diferença pode ser válida se vier da Convenção Coletiva aplicável. Confirme que o descanso concedido decorre da CCT ou de justificativa contratual documentada.`;

  return {
    cenario,
    afirmativo,
    titulo: afirmativo ? "Risco de tratamento desigual" : "Enquadramento sindical diferente",
    mensagem,
    sindicatosAlvo: sa,
    sindicatosColegas: sc,
    colegasNaRegraPadrao: colegas.length,
  };
}

export const cienciaIsonomiaValida = (ciente: boolean, justificativa: string) =>
  ciente && justificativa.trim().length >= JUSTIFICATIVA_ISONOMIA_MIN;

/** Equivalência em semanas por domingo para comparar com a lei e a unidade. */
export function semanasEquivalentes(modo: "semanas" | "por_mes", qtd: number): number {
  return modo === "semanas" ? qtd : 4.33 / qtd;
}

export function domingosEquivalentes(modo: "semanas" | "por_mes", qtd: number): number {
  return modo === "semanas" ? Math.max(1, Math.min(4, Math.round(4.33 / qtd))) : qtd;
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DIAS_SEMANA = DIAS;

export function rotuloFolgaDiferenciada(modo: "semanas" | "por_mes" | null | undefined, qtd: number, dias?: number[] | null): string {
  const freq = modo === "semanas" ? (qtd === 1 ? "toda semana" : `a cada ${qtd} semanas`) : `${qtd} por mês`;
  const d = dias && dias.length ? dias.slice().sort().map((x) => DIAS[x]).join(" e ") : "dias da unidade";
  return `${d}, ${freq}`;
}
