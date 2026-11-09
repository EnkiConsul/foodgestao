import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream } from "npm:pdf-lib@1.17.1";
import { assinarCampoReciboEspecie } from "./recibo-especie-assinado.ts";

const assinatura = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";

async function recibo(rotulos = 1) {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595.28, 841.89]);
  page.drawText("Declaro ter recebido em dinheiro a quantia de R$ 700,00", { x: 48, y: 400, font: fonte, size: 10 });
  page.drawLine({ start: { x: 48, y: 300 }, end: { x: 308, y: 300 }, thickness: 0.8 });
  for (let i = 0; i < rotulos; i++) {
    page.drawText("Assinatura do colaborador", { x: 48, y: 262 - i * 20, font: fonte, size: 8.5 });
  }
  return pdf.save();
}

async function textoDaPagina(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const c = pdf.getPage(0).node.Contents();
  const refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
  return refs.map((ref) => {
    const s = pdf.context.lookup(ref);
    return s instanceof PDFRawStream ? new TextDecoder("latin1").decode(decodePDFRawStream(s).decode()) : "";
  }).join("\n");
}

Deno.test("estampa a assinatura e a chancela sobre a linha do recebedor", async () => {
  const original = await recibo();
  const saida = await assinarCampoReciboEspecie(original, {
    assinatura, aceitoEm: "2026-11-06T17:57:15Z", ip: "200.1.2.3",
  });
  const texto = await textoDaPagina(saida);
  const fonte = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  if (!/\sDo\b/.test(texto)) throw new Error("imagem da assinatura não foi desenhada");
  if (!texto.includes(fonte.encodeText("Assinado eletronicamente").toString())) throw new Error("chancela ausente");
  if (!texto.includes(fonte.encodeText("IP 200.1.2.3").toString())) throw new Error("IP ausente");
  // O texto original continua no recibo.
  if (!texto.includes(fonte.encodeText("Assinatura do colaborador").toString())) throw new Error("rótulo original removido");
  // O arquivo de entrada não muda.
  const intacto = await textoDaPagina(original);
  if (intacto.includes(fonte.encodeText("Assinado eletronicamente").toString())) throw new Error("original alterado");
});

Deno.test("modelo sem o campo de assinatura é recusado", async () => {
  const original = await recibo(0);
  let falhou = false;
  try {
    await assinarCampoReciboEspecie(original, { assinatura, aceitoEm: "2026-11-06T17:57:15Z" });
  } catch {
    falhou = true;
  }
  if (!falhou) throw new Error("deveria recusar modelo desconhecido");
});

Deno.test("campo repetido é recusado para não assinar no lugar errado", async () => {
  const original = await recibo(2);
  let falhou = false;
  try {
    await assinarCampoReciboEspecie(original, { assinatura, aceitoEm: "2026-11-06T17:57:15Z" });
  } catch {
    falhou = true;
  }
  if (!falhou) throw new Error("deveria recusar campo repetido");
});

Deno.test("assinatura inválida não é estampada", async () => {
  const original = await recibo();
  let falhou = false;
  try {
    await assinarCampoReciboEspecie(original, { assinatura: "data:text/plain;base64,AAAA", aceitoEm: "2026-11-06T17:57:15Z" });
  } catch {
    falhou = true;
  }
  if (!falhou) throw new Error("deveria recusar imagem inválida");
});
