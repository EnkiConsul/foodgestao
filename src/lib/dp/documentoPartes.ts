/**
 * Documentos que têm frente e verso. PDF (CNH digital, CIN do gov.br) ou foto
 * marcada como "Frente e verso" num arquivo só conta como documento completo.
 */
export const CODIGOS_FRENTE_VERSO = new Set(["identidade", "rg", "cnh", "cnh_valida", "ctps"]);

export const ROTULO_ARQUIVO_UNICO = "Frente e verso";

export function exigeVerso(codigo: string): boolean {
  return CODIGOS_FRENTE_VERSO.has(codigo);
}

export interface ParteEnviada {
  parte?: number | null;
  parte_rotulo?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  status?: string | null;
}

const ehPdf = (d: ParteEnviada) =>
  (d.mime_type ?? "") === "application/pdf" || /\.pdf$/i.test(d.file_name ?? "");

/** Arquivo único que já traz os dois lados (PDF digital ou foto marcada). */
export function ehArquivoUnico(d: ParteEnviada): boolean {
  return ehPdf(d) || (d.parte_rotulo ?? "").trim().toLowerCase() === ROTULO_ARQUIVO_UNICO.toLowerCase();
}

/** Falta o verso? Só para documentos de dois lados que tenham alguma parte enviada. */
export function faltaVerso(codigo: string, partes: ParteEnviada[]): boolean {
  if (!exigeVerso(codigo)) return false;
  const validas = partes.filter((p) => p.status !== "recusado");
  if (!validas.length) return false;
  if (validas.some(ehArquivoUnico)) return false;
  return !validas.some((p) => Number(p.parte ?? 1) === 2);
}

/** Nome padronizado para o pacote contábil: 01_Identidade_Frente.jpg */
export function nomeArquivoPacote(ordem: number, titulo: string, parte: string, extensao: string): string {
  const limpo = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  return `${String(ordem).padStart(2, "0")}_${limpo(titulo)}${parte ? `_${limpo(parte)}` : ""}.${extensao || "bin"}`;
}
