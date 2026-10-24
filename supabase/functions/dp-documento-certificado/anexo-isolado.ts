import { PDFDocument } from "npm:pdf-lib@1.17.1";

/** Só transfere páginas já serializadas: streams externos nunca contaminam o alvo. */
export async function incorporarAnexoIsolado(
  destino: PDFDocument,
  montar: (temporario: PDFDocument) => Promise<string | null>,
  avisoFalha: string,
): Promise<string | null> {
  const paginasAntes = destino.getPageCount();
  try {
    const temporario = await PDFDocument.create();
    const aviso = await montar(temporario);
    if (aviso) return aviso;
    const bytes = await temporario.save();
    const valido = await PDFDocument.load(bytes);
    const paginas = await destino.copyPages(valido, valido.getPageIndices());
    paginas.forEach((pagina) => destino.addPage(pagina));
    return null;
  } catch {
    while (destino.getPageCount() > paginasAntes) destino.removePage(destino.getPageCount() - 1);
    return avisoFalha;
  }
}