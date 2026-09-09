/**
 * Título de documento do portal: o assunto vem na frente, nunca o nome do arquivo.
 * Ex.: "Contracheque · 08/2026" ou "Contracheque · enviado em 05/09/2026".
 */
export function tituloDocumento(input: {
  tipoLabel: string;
  competenciaLabel?: string | null;
  createdAt?: string | null;
}): string {
  const comp = input.competenciaLabel && input.competenciaLabel !== "—" ? input.competenciaLabel : null;
  if (comp) return `${input.tipoLabel} · ${comp}`;
  if (input.createdAt) {
    const d = new Date(input.createdAt);
    if (!isNaN(d.getTime())) {
      return `${input.tipoLabel} · enviado em ${d.toLocaleDateString("pt-BR")}`;
    }
  }
  return input.tipoLabel;
}

/** Texto do aceite: confirma leitura do documento, não valores nem pagamento. */
export const DOCUMENTO_CONFIRMACAO_TEXTO =
  "Você confirma que recebeu e leu este documento. Isso não confirma valores nem pagamento.";
