/**
 * Conferência do favorecido do comprovante com o colaborador do documento.
 * Objetivo principal: evitar anexar o comprovante de OUTRO colaborador por engano.
 */
const CONECTIVOS = new Set(["da", "de", "do", "das", "dos", "e"]);

export function tokensNome(nome: string | null | undefined): string[] {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !CONECTIVOS.has(t));
}

/** Mesmo nome: primeiro nome igual e ao menos mais um sobrenome em comum (aceita nome abreviado no banco). */
export function nomesConferem(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tokensNome(a);
  const tb = tokensNome(b);
  if (!ta.length || !tb.length || ta[0] !== tb[0]) return false;
  if (ta.length === 1 || tb.length === 1) return ta.length === tb.length;
  const resto = new Set(tb.slice(1));
  return ta.slice(1).some((t) => resto.has(t));
}

export type ConferenciaFavorecido =
  | { status: "nao_lido" }
  | { status: "confere"; favorecido: string }
  | { status: "outro_colaborador"; favorecido: string; outroNome: string }
  | { status: "terceiro"; favorecido: string };

export function conferirFavorecido(
  favorecido: string | null | undefined,
  colaboradorNome: string | null | undefined,
  outros: { id: string; nome: string }[],
  colaboradorId?: string | null,
): ConferenciaFavorecido {
  const f = favorecido?.trim();
  if (!f || !colaboradorNome) return { status: "nao_lido" };
  if (nomesConferem(f, colaboradorNome)) return { status: "confere", favorecido: f };
  const outro = outros.find((o) => o.id !== colaboradorId && nomesConferem(f, o.nome));
  if (outro) return { status: "outro_colaborador", favorecido: f, outroNome: outro.nome };
  return { status: "terceiro", favorecido: f };
}
