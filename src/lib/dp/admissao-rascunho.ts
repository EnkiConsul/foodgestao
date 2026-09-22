/**
 * Rascunho da ficha de admissão: regras puras de chave, conteúdo e rótulo.
 *
 * O rascunho é guardado no sistema por empresa e por usuário; a chave separa o
 * cadastro novo (inclusive a promoção de folguista) da edição de uma ficha já
 * existente, para que um rascunho nunca invada outro cadastro.
 */

export interface ConteudoRascunhoAdmissao {
  form?: Record<string, unknown>;
  endereco?: Record<string, unknown>;
  pagamento?: Record<string, unknown>;
  remuneracao?: Record<string, unknown>;
  socio_remuneracao?: string;
}

/** Chave do rascunho. `novo` cobre a admissão que ainda não virou cadastro. */
export function chaveRascunhoAdmissao(opts: {
  colaboradorId?: string | null;
  pessoaApoioId?: string | null;
}): string {
  if (opts.colaboradorId) return `colaborador:${opts.colaboradorId}`;
  if (opts.pessoaApoioId) return `apoio:${opts.pessoaApoioId}`;
  return "novo";
}

/**
 * Só vale guardar quando o gestor já digitou algo que identifique a pessoa ou
 * escolheu onde ela vai trabalhar — evita rascunho vazio a cada abertura.
 */
export function rascunhoTemConteudo(c: ConteudoRascunhoAdmissao | null | undefined): boolean {
  const f = (c?.form ?? {}) as Record<string, unknown>;
  const texto = (k: string) => String(f[k] ?? "").trim();
  return (
    texto("nome").length >= 2 ||
    texto("cpf").replace(/\D/g, "").length >= 3 ||
    texto("email").length > 0 ||
    texto("whatsapp").replace(/\D/g, "").length >= 3 ||
    !!texto("cargo_id") ||
    !!texto("unidade_id")
  );
}

/** "Salvo às 17:42" — retorno vazio quando nunca houve gravação. */
export function rotuloSalvoEm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Salvo às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** "Rascunho de 22/09 às 17:42" — usado no convite para retomar. */
export function rotuloRascunho(iso: string | null | undefined): string {
  if (!iso) return "Rascunho guardado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Rascunho guardado";
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `Rascunho de ${dia} às ${hora}`;
}
