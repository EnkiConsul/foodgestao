/**
 * Regras puras dos recibos vinculados à quitação de um documento (pagamento em
 * dinheiro e recibo de diferença). Sem dependências de runtime: o mesmo arquivo
 * é testado no Vitest e usado pela função do servidor.
 */

export type ReciboVinculadoOrigem = "especie" | "diferenca";

export type ReciboVinculadoRef = { id: string; origem: ReciboVinculadoOrigem };

/** Ids dos recibos ligados ao documento, sem repetição e na ordem da quitação. */
export function recibosVinculados(registro: {
  comprovante_recibo_documento_id?: string | null;
  recibo_diferenca_documento_id?: string | null;
}): ReciboVinculadoRef[] {
  const saida: ReciboVinculadoRef[] = [];
  const especie = String(registro.comprovante_recibo_documento_id ?? "").trim();
  const diferenca = String(registro.recibo_diferenca_documento_id ?? "").trim();
  if (especie) saida.push({ id: especie, origem: "especie" });
  if (diferenca && diferenca !== especie) saida.push({ id: diferenca, origem: "diferenca" });
  return saida;
}

export type EstadoRecibo =
  | "assinado_eletronico" // aceite no portal com imagem e conteúdo conferido
  | "aceite_sem_conferencia" // aceite registrado, mas o arquivo atual não é o aprovado
  | "via_fisica" // via assinada à mão anexada
  | "aguardando"; // emitido, ainda sem assinatura

/**
 * Situação jurídica do recibo no momento da emissão do certificado.
 * A assinatura só é estampada quando o conteúdo atual é exatamente o aprovado.
 */
export function estadoRecibo(entrada: {
  aceite: { conteudo_hash?: string | null; hash_origem?: string | null; assinatura_imagem?: string | null; documento_versao?: number | null } | null;
  versaoAtual?: number | null;
  hashArquivo?: string | null;
  viaAssinadaPath?: string | null;
}): EstadoRecibo {
  const { aceite } = entrada;
  if (aceite) {
    const mesmaVersao = Number(aceite.documento_versao ?? entrada.versaoAtual ?? 1) === Number(entrada.versaoAtual ?? 1);
    const conferido = aceite.hash_origem !== "legado_caminho" &&
      !!aceite.conteudo_hash && !!entrada.hashArquivo &&
      String(aceite.conteudo_hash) === String(entrada.hashArquivo);
    if (mesmaVersao && conferido && aceite.assinatura_imagem) return "assinado_eletronico";
    return "aceite_sem_conferencia";
  }
  if (entrada.viaAssinadaPath) return "via_fisica";
  return "aguardando";
}

/**
 * Parte da chave do certificado guardado que depende dos recibos: muda quando
 * o recibo é emitido, assinado no portal ou recebe a via física — e aí o
 * certificado é refeito sozinho, sem limpeza manual.
 */
export function sufixoCacheRecibos(
  recibos: Array<{ id: string; aceiteId?: string | null; viaAssinadaPath?: string | null; versao?: number | null }>,
): string {
  if (!recibos.length) return "sem-recibo";
  return recibos
    .map((r) => {
      const aceite = r.aceiteId ? String(r.aceiteId).slice(0, 8) : "pend";
      const via = r.viaAssinadaPath ? "v" : "";
      return `${String(r.id).slice(0, 8)}_${aceite}${via}_${Number(r.versao ?? 1)}`;
    })
    .join("~");
}
