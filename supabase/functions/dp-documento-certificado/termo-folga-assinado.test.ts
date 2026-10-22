import { PDFDocument, PDFRawStream, PDFArray, StandardFonts, decodePDFRawStream } from "npm:pdf-lib@1.17.1";
import { assinarCampoTermoFolga } from "./termo-folga-assinado.ts";

const assinatura = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
async function minuta() {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("Cláusulas originais preservadas", { x: 48, y: 500, font: fonte, size: 10 });
  page.drawText("Aceite do(a) empregado(a): pendente, pelo Portal do Colaborador.", { x: 48, y: 300, font: fonte, size: 10 });
  page.drawText("Aguardando assinatura digital (aceite)", { x: 350, y: 208, font: fonte, size: 8 });
  return pdf.save();
}
async function conteudo(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const c = pdf.getPage(0).node.Contents();
  const refs = c instanceof PDFArray ? c.asArray() : c ? [c] : [];
  const texto = refs.map((ref) => {
    const s = pdf.context.lookup(ref);
    return s instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(s).decode()) : "";
  }).join("\n");
  return { pdf, texto };
}
Deno.test("aceite aplicado no campo conserva cláusulas e original, com imagem no termo", async () => {
  const original = await minuta();
  const copia = original.slice();
  const bytes = await assinarCampoTermoFolga(original, { assinatura, aceitoEm: "2026-10-11T13:18:00Z" });
  const { pdf, texto } = await conteudo(bytes);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  if (texto.includes(fonte.encodeText("Aguardando assinatura digital (aceite)").toString())) throw new Error("Pendente após aceite");
  if (!texto.includes(fonte.encodeText("Cláusulas originais preservadas").toString())) throw new Error("Cláusulas alteradas");
  if (!texto.includes(fonte.encodeText("Aceite realizado em 11/10/2026, 10:18 pelo Portal do Colaborador.").toString())) throw new Error("Data do aceite ausente");
  if (!/\/Image-[\d]+ Do/.test(texto)) throw new Error("Assinatura não desenhada");
  if (!original.every((v, i) => v === copia[i])) throw new Error("Original modificado");
});
Deno.test("sem imagem válida ou modelo conhecido não estampa aceite", async () => {
  for (const bytes of [await minuta(), await (await PDFDocument.create()).save()]) {
    let recusou = false;
    try { await assinarCampoTermoFolga(bytes, { assinatura: null, aceitoEm: "2026-10-11T13:18:00Z" }); } catch { recusou = true; }
    if (!recusou) throw new Error("Aceite sem assinatura foi permitido");
  }
});