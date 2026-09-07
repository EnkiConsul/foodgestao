/**
 * Completude do cadastro do colaborador.
 *
 * Cadastros criados pela importação da ficha de registro entram no sistema com
 * o que a ficha trouxe — e o resto fica em branco sem nenhum aviso. Este módulo
 * é a fonte única do que é considerado essencial, usado na conferência da ficha,
 * na lista de colaboradores, na ficha de consulta e nas pendências do DP.
 */

export type CampoEssencial = {
  /** Chave estável (não é necessariamente uma coluna: contato cobre telefone/WhatsApp). */
  chave: string;
  label: string;
  /**
   * Só os obrigatórios acendem a sinalização de "cadastro incompleto"
   * (selo na lista, aba/filtro de incompletos, pendência do DP).
   * Os demais aparecem apenas como sugestão na ficha e na conferência da importação.
   */
  obrigatorio: boolean;
};

export const CAMPOS_ESSENCIAIS: CampoEssencial[] = [
  { chave: "setor_id", label: "setor", obrigatorio: false },
  { chave: "contato", label: "telefone ou WhatsApp", obrigatorio: true },
  { chave: "email_contato", label: "e-mail", obrigatorio: false },
  { chave: "endereco", label: "endereço", obrigatorio: false },
  { chave: "data_nascimento", label: "data de nascimento", obrigatorio: false },
  { chave: "estado_civil", label: "estado civil", obrigatorio: false },
  { chave: "regime", label: "vínculo", obrigatorio: true },
  { chave: "pis_nit", label: "PIS", obrigatorio: false },
  { chave: "salario_base", label: "salário", obrigatorio: true },
];

export interface ColaboradorCompletude {
  setor_id?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email_contato?: string | null;
  endereco?: unknown;
  data_nascimento?: string | null;
  estado_civil?: string | null;
  regime?: string | null;
  pis_nit?: string | null;
  salario_base?: number | string | null;
  [key: string]: unknown;
}

const vazio = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** O endereço é jsonb: só conta como preenchido quando tem rua ou o texto lido. */
function enderecoVazio(v: unknown): boolean {
  if (vazio(v)) return true;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return vazio(o.logradouro) && vazio(o.texto) && vazio(o.cidade);
  }
  return true;
}

export interface OpcoesCompletude {
  /** Empresas que não usam setores não devem ver a cobrança de setor. */
  exigirSetor?: boolean;
}

/** Campos essenciais ainda em branco, na ordem de `CAMPOS_ESSENCIAIS`. */
export function camposFaltando(
  c: ColaboradorCompletude | null | undefined,
  opts: OpcoesCompletude = {},
): CampoEssencial[] {
  if (!c) return [];
  const exigirSetor = opts.exigirSetor !== false;
  return CAMPOS_ESSENCIAIS.filter((campo) => {
    switch (campo.chave) {
      case "setor_id":
        return exigirSetor && vazio(c.setor_id);
      case "contato":
        return vazio(c.telefone) && vazio(c.whatsapp);
      case "endereco":
        return enderecoVazio(c.endereco);
      case "salario_base":
        return vazio(c.salario_base) || Number(c.salario_base) <= 0;
      default:
        return vazio(c[campo.chave]);
    }
  });
}

/** Apenas os campos obrigatórios em falta — base do selo "Cadastro incompleto". */
export function camposFaltandoObrigatorios(
  c: ColaboradorCompletude | null | undefined,
  opts: OpcoesCompletude = {},
): CampoEssencial[] {
  return camposFaltando(c, opts).filter((campo) => campo.obrigatorio);
}

export function cadastroIncompleto(
  c: ColaboradorCompletude | null | undefined,
  opts: OpcoesCompletude = {},
): boolean {
  return camposFaltandoObrigatorios(c, opts).length > 0;
}

/** Texto curto para avisos: "Falta: setor, endereço e e-mail". */
export function resumoFaltando(campos: CampoEssencial[], max = 4): string {
  if (!campos.length) return "";
  const nomes = campos.slice(0, max).map((c) => c.label);
  const resto = campos.length - nomes.length;
  const lista =
    nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0];
  return resto > 0 ? `${lista} e mais ${resto}` : lista;
}
