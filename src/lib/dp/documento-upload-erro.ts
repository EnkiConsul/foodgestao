/**
 * Tradução das falhas de envio de documento do colaborador.
 *
 * O erro cru vem do armazenamento (bucket) ou do banco e é técnico
 * ("new row violates row-level security policy", "Payload too large").
 * Quem lê é o colaborador no celular, então aqui devolvemos o motivo em
 * português com a orientação do que fazer.
 */
export function mensagemEnvioDocumento(error: unknown): string {
  const bruto = String(
    (error as { message?: string } | null)?.message ?? error ?? "",
  ).toLowerCase();
  const status = String((error as { statusCode?: unknown; status?: unknown } | null)?.statusCode ??
    (error as { status?: unknown } | null)?.status ?? "");

  if (!bruto && !status) return "Não foi possível enviar o documento. Tente novamente.";

  if (
    bruto.includes("row-level security") ||
    bruto.includes("unauthorized") ||
    bruto.includes("permission") ||
    status === "403"
  ) {
    return "Você não tem permissão para enviar este documento agora. Avise o gestor para liberar o envio.";
  }

  if (bruto.includes("payload too large") || bruto.includes("exceeded the maximum") || status === "413") {
    return "O arquivo é muito grande. Envie uma foto com menos qualidade ou um PDF menor.";
  }

  if (bruto.includes("mime") || bruto.includes("invalid_mime") || bruto.includes("content type")) {
    return "Formato de arquivo não aceito. Envie uma foto (JPG ou PNG) ou um PDF.";
  }

  if (bruto.includes("already exists") || bruto.includes("duplicate")) {
    return "Este arquivo já foi enviado. Atualize a tela para conferir.";
  }

  if (
    bruto.includes("failed to fetch") ||
    bruto.includes("network") ||
    bruto.includes("timeout") ||
    bruto.includes("aborted")
  ) {
    return "Falha de conexão ao enviar o arquivo. Verifique a internet e tente novamente.";
  }

  return "Não foi possível enviar o documento. Tente novamente ou avise o gestor.";
}
