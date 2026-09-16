/**
 * Regras de duplicidade de contatos (clientes/fornecedores).
 *
 * Nome é comparado por chave canônica: sem acentos, sem pontuação, sem
 * sufixos societários e em CAIXA ALTA — assim "Alessandra CNPJ",
 * "ALESSANDRA  CNPJ" e "Alessandra Cnpj." são reconhecidos como o mesmo
 * cadastro.
 */

const SUFIXOS = ["LTDA", "ME", "MEI", "EIRELI", "SA", "S A", "EPP"];

export function normalizeNomeContato(nome: string | null | undefined): string {
  const base = (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const partes = base.split(" ").filter((p) => p.length > 0);
  while (partes.length > 1 && SUFIXOS.includes(partes[partes.length - 1])) partes.pop();
  return partes.join(" ");
}

export function mesmoNomeContato(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeNomeContato(a);
  const nb = normalizeNomeContato(b);
  return na.length > 0 && na === nb;
}

/** Primeira palavra útil do nome, usada para restringir a busca no banco. */
export function prefixoBuscaNome(nome: string | null | undefined): string {
  return normalizeNomeContato(nome).split(" ")[0] ?? "";
}
