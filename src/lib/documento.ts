/**
 * Normalização de CPF/CNPJ para comparação de duplicidade.
 *
 * Documentos podem chegar de várias origens (digitação com máscara, extrato
 * bancário, importação de planilha, cadastros antigos salvos sem máscara),
 * então comparar as strings cruas gera falsos negativos. Aqui reduzimos tudo
 * a uma chave canônica:
 *  - remove máscara, espaços e qualquer caractere não alfanumérico;
 *  - deixa em maiúsculas (CNPJ alfanumérico);
 *  - descarta zeros à esquerda excedentes (ex.: "000123..." colado do Excel);
 *  - completa com zeros à esquerda quando o valor perdeu zeros iniciais
 *    (9/10 dígitos -> CPF de 11; 12/13 dígitos -> CNPJ de 14).
 */
export function normalizeDocumento(value: string | null | undefined): string {
  const raw = String(value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!raw) return "";

  // Zeros à esquerda além do tamanho de um CNPJ não têm significado.
  let core = raw;
  while (core.length > 14 && core.startsWith("0")) core = core.slice(1);

  if (core.length >= 9 && core.length < 11) return core.padStart(11, "0");
  if (core.length > 11 && core.length < 14) return core.padStart(14, "0");
  return core;
}

/** Compara dois documentos já normalizados (ignora vazios). */
export function isSameDocumento(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeDocumento(a);
  const nb = normalizeDocumento(b);
  return na.length > 0 && na === nb;
}
