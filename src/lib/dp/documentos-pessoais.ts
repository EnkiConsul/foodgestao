/**
 * Documentos pessoais e filiação do colaborador.
 *
 * Todos os campos são opcionais: servem para completar o cadastro (em especial
 * quando vêm da importação da ficha de registro) e nunca bloqueiam o salvamento.
 */

export interface CampoPessoal {
  campo: string;
  label: string;
  tipo: "text" | "date";
  /** Largura sugerida no grid do formulário. */
  curto?: boolean;
}

export const DOCUMENTOS_PESSOAIS: CampoPessoal[] = [
  { campo: "rg_numero", label: "RG" },
  { campo: "rg_orgao", label: "Órgão emissor", curto: true },
  { campo: "rg_uf", label: "UF do RG", curto: true },
  { campo: "rg_emissao", label: "Emissão do RG", tipo: "date" } as CampoPessoal,
  { campo: "ctps_numero", label: "CTPS" },
  { campo: "ctps_serie", label: "Série da CTPS", curto: true },
  { campo: "ctps_uf", label: "UF da CTPS", curto: true },
  { campo: "ctps_expedicao", label: "Expedição da CTPS", tipo: "date" } as CampoPessoal,
  { campo: "titulo_eleitor", label: "Título de eleitor" },
  { campo: "titulo_zona", label: "Zona", curto: true },
  { campo: "titulo_secao", label: "Seção", curto: true },
  { campo: "reservista", label: "Certificado de reservista" },
  { campo: "reservista_categoria", label: "Categoria da reservista", curto: true },
  { campo: "nome_pai", label: "Nome do pai" },
  { campo: "nome_mae", label: "Nome da mãe" },
  { campo: "nacionalidade", label: "Nacionalidade" },
  { campo: "naturalidade", label: "Naturalidade" },
  { campo: "raca_cor", label: "Raça/cor" },
  { campo: "grau_instrucao", label: "Grau de instrução" },
  { campo: "deficiencia", label: "Deficiência" },
].map((c) => ({ tipo: "text", ...(c as CampoPessoal) }));

/** Estado inicial (tudo em branco) para o formulário do colaborador. */
export const DOCUMENTOS_PESSOAIS_BLANK: Record<string, string> = Object.fromEntries(
  DOCUMENTOS_PESSOAIS.map((c) => [c.campo, ""]),
);

/** Lê os valores gravados no colaborador para dentro do formulário. */
export function documentosPessoaisDoColaborador(c: Record<string, unknown> | null | undefined) {
  const out: Record<string, string> = {};
  for (const { campo } of DOCUMENTOS_PESSOAIS) out[campo] = String(c?.[campo] ?? "");
  return out;
}

/** Converte o formulário em colunas do banco (vazio vira nulo). */
export function documentosPessoaisParaBanco(form: Record<string, unknown>) {
  const out: Record<string, string | null> = {};
  for (const { campo } of DOCUMENTOS_PESSOAIS) {
    const v = String(form?.[campo] ?? "").trim();
    out[campo] = v ? v : null;
  }
  return out;
}
