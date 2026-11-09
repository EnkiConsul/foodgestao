import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream, rgb } from "npm:pdf-lib@1.17.1";
import { desenharAssinatura, embutirAssinatura } from "../_shared/assinatura-pdf.ts";

const ROTULO = "Assinatura do colaborador";

function limpar(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\xFF\n]/g, "");
}

/**
 * Estampa a assinatura eletrônica sobre a linha "Assinatura do colaborador" do
 * recibo de pagamento em dinheiro (modelo do `dp-recibo-especie`). Só altera a
 * cópia usada no certificado; o arquivo original guardado nunca é modificado.
 * Modelo não reconhecido (rótulo ausente ou repetido) lança erro.
 */
export async function assinarCampoReciboEspecie(
  bytes: Uint8Array,
  aceite: { assinatura: string | null; aceitoEm: string; ip?: string | null },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const imagem = await embutirAssinatura(pdf, aceite.assinatura);
  if (!imagem) throw new Error("Imagem da assinatura indisponível para o recibo.");
  const data = new Date(aceite.aceitoEm);
  if (Number.isNaN(data.getTime())) throw new Error("Data do aceite inválida.");

  const alvo = `${fonte.encodeText(ROTULO).toString()} Tj`;
  const achados: Array<{ pagina: number; x: number; y: number }> = [];
  pdf.getPages().forEach((page, indice) => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    for (const ref of streams) {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const texto = new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
      for (const bloco of texto.match(/BT\s[\s\S]*?\sET/g) ?? []) {
        if (!bloco.includes(alvo)) continue;
        const m = bloco.match(/1\s+0\s+0\s+1\s+([\d.-]+)\s+([\d.-]+)\s+Tm/);
        if (!m) throw new Error("Campo de assinatura do recibo não reconhecido.");
        achados.push({ pagina: indice, x: Number(m[1]), y: Number(m[2]) });
      }
    }
  });
  if (achados.length !== 1) throw new Error("Modelo de recibo não reconhecido; original preservado.");

  const { pagina, x, y } = achados[0];
  const page = pdf.getPage(pagina);
  // No modelo, a linha fica 38pt acima do rótulo e mede 260pt.
  const linhaY = y + 38;
  desenharAssinatura(page, imagem, x + 4, linhaY + 2, 200, 34);

  const quando = data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium",
  });
  const xAudit = x + 272;
  page.drawText("Assinado eletronicamente", {
    x: xAudit, y: linhaY + 16, size: 7.5, font: negrito, color: rgb(0.08, 0.5, 0.24),
  });
  page.drawText(limpar(`em ${quando} pelo Portal do Colaborador`), {
    x: xAudit, y: linhaY + 6, size: 7, font: fonte, color: rgb(0.3, 0.3, 0.3),
  });
  if (aceite.ip) {
    page.drawText(limpar(`IP ${aceite.ip}`).slice(0, 60), {
      x: xAudit, y: linhaY - 4, size: 7, font: fonte, color: rgb(0.3, 0.3, 0.3),
    });
  }
  return pdf.save();
}
