import { PDFDocument, PDFRawStream, PDFArray, PDFName, StandardFonts, decodePDFRawStream, rgb } from "npm:pdf-lib@1.17.1";
import { embutirAssinatura, desenharAssinatura } from "../_shared/assinatura-pdf.ts";

/** Atualiza somente a representação do aceite no modelo conhecido; nunca o arquivo original. */
export async function assinarCampoTermoFolga(
  bytes: Uint8Array,
  aceite: { assinatura: string | null; aceitoEm: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const imagem = await embutirAssinatura(pdf, aceite.assinatura);
  if (!imagem) throw new Error("Imagem da assinatura indisponível para o termo.");
  const data = new Date(aceite.aceitoEm);
  if (Number.isNaN(data.getTime())) throw new Error("Data do aceite inválida.");
  const realizado = `Aceite realizado em ${data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
  })} pelo Portal do Colaborador.`;
  const pendente = fonte.encodeText("Aceite do(a) empregado(a): pendente, pelo Portal do Colaborador.").toString();
  const aguardando = fonte.encodeText("Aguardando assinatura digital (aceite)").toString();
  let registros = 0;
  let campos = 0;
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const novos = [];
    for (const ref of streams) {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) throw new Error("Modelo de termo não reconhecido.");
      const texto = new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
      const atualizado = texto.replace(/BT\s[\s\S]*?\sET/g, (bloco) => {
        if (bloco.includes(`${pendente} Tj`)) {
          registros++;
          return bloco.replace(`${pendente} Tj`, `${fonte.encodeText(realizado).toString()} Tj`);
        }
        if (!bloco.includes(`${aguardando} Tj`)) return bloco;
        const matriz = bloco.match(/1\s+0\s+0\s+1\s+([\d.-]+)\s+([\d.-]+)\s+Tm/);
        if (!matriz) throw new Error("Campo de assinatura não reconhecido.");
        const x = Number(matriz[1]);
        const y = Number(matriz[2]) - 8;
        // O modelo tem coluna de 234,5 pontos; a frase antiga era centralizada nela.
        const colunaX = x - (234.5 - fonte.widthOfTextAtSize("Aguardando assinatura digital (aceite)", 8)) / 2;
        desenharAssinatura(page, imagem, colunaX, y + 3, 220, 50);
        page.drawText("Assinado eletronicamente", {
          x: colunaX, y: y + 56, size: 7, font: fonte, color: rgb(0.08, 0.5, 0.24),
        });
        campos++;
        return "";
      });
      novos.push(pdf.context.register(pdf.context.flateStream(atualizado)));
    }
    // drawImage/drawText acrescentaram um stream; preservá-lo junto do original atualizado.
    const depois = page.node.Contents();
    const extras = depois instanceof PDFArray ? depois.asArray().slice(streams.length) : [];
    page.node.set(PDFName.of("Contents"), pdf.context.obj([...novos, ...extras]));
  }
  if (registros !== 1 || campos !== 1) throw new Error("Modelo de termo não reconhecido; original preservado.");
  return pdf.save();
}