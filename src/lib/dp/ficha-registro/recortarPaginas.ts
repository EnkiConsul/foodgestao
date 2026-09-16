// ------------------------------------------------------------------
// Domínio: DP → Ficha de registro (anexo do PDF)
//
// Um lote de fichas é um único PDF com várias pessoas. Anexar o PDF inteiro no
// cadastro de um colaborador exporia dados de terceiros, então o anexo só pode
// ser o recorte das páginas do item autorizado. Se o recorte não for possível,
// nada é anexado — nunca o arquivo completo.
// ------------------------------------------------------------------

import { PDFDocument } from "pdf-lib";

export class RecorteInvalidoError extends Error {
  constructor(public readonly motivo: string) {
    super(motivo);
    this.name = "RecorteInvalidoError";
  }
}

export interface FaixaPaginas {
  inicio: number | null | undefined;
  fim: number | null | undefined;
}

/** Faixa válida e dentro do documento, ou erro explicando por que não dá. */
export function validarFaixaPaginas(faixa: FaixaPaginas, totalPaginas: number): { inicio: number; fim: number } {
  const inicio = Number(faixa.inicio);
  const fim = Number(faixa.fim ?? faixa.inicio);
  if (!Number.isInteger(inicio) || !Number.isInteger(fim)) {
    throw new RecorteInvalidoError("A ficha não indica as páginas do colaborador.");
  }
  if (inicio < 1 || fim < inicio) {
    throw new RecorteInvalidoError("A faixa de páginas da ficha é inválida.");
  }
  if (fim > totalPaginas) {
    throw new RecorteInvalidoError("A faixa de páginas da ficha não existe no arquivo do lote.");
  }
  return { inicio, fim };
}

/**
 * Novo PDF contendo somente as páginas `inicio..fim` (1-indexadas) do lote.
 * Qualquer inconsistência levanta RecorteInvalidoError: em nenhuma hipótese
 * devolvemos o arquivo original.
 */
export async function recortarPaginasPdf(
  origem: ArrayBuffer | Uint8Array,
  faixa: FaixaPaginas,
): Promise<Uint8Array> {
  const lote = await PDFDocument.load(origem, { ignoreEncryption: false });
  const total = lote.getPageCount();
  const { inicio, fim } = validarFaixaPaginas(faixa, total);

  const recorte = await PDFDocument.create();
  const indices = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio - 1 + i);
  const paginas = await recorte.copyPages(lote, indices);
  for (const p of paginas) recorte.addPage(p);
  if (recorte.getPageCount() !== indices.length) {
    throw new RecorteInvalidoError("O recorte das páginas da ficha não pôde ser conferido.");
  }
  return await recorte.save();
}
