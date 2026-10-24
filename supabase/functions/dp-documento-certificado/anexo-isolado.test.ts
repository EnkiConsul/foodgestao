import { PDFDocument, PDFName, PDFNumber } from "npm:pdf-lib@1.17.1";
import { incorporarAnexoIsolado } from "./anexo-isolado.ts";

Deno.test("compressão inválida no save do anexo não contamina documento assinado", async () => {
  const destino = await PDFDocument.create();
  destino.addPage([595, 842]);
  const antes = await destino.save();
  const aviso = await incorporarAnexoIsolado(destino, async (tmp) => {
    const stream = tmp.context.stream(new Uint8Array([190, 82, 1, 2]), {
      Filter: PDFName.of("FlateDecode"), Length: PDFNumber.of(4),
    });
    const page = tmp.addPage([595, 842]);
    page.node.set(PDFName.of("Contents"), tmp.context.register(stream));
    const origem = await PDFDocument.load(await tmp.save());
    await tmp.embedPage(origem.getPage(0)); // decodificação só ocorre no save
    return null;
  }, "Original preservado");
  if (aviso !== "Original preservado") throw new Error("Falha tardia não isolada");
  if (destino.getPageCount() !== 1) throw new Error("Páginas do original alteradas");
  const depois = await destino.save();
  if (!antes.every((v, i) => v === depois[i])) throw new Error("Documento base modificado");
});

Deno.test("anexo válido transfere todas as páginas sem alterar bytes de entrada", async () => {
  const original = await PDFDocument.create();
  original.addPage([595, 842]);
  original.addPage([595, 842]);
  const bytes = await original.save();
  const copia = bytes.slice();
  const destino = await PDFDocument.create();
  destino.addPage();
  const aviso = await incorporarAnexoIsolado(destino, async (tmp) => {
    const pdf = await PDFDocument.load(bytes);
    const paginas = await tmp.embedPages(pdf.getPages());
    for (const p of paginas) tmp.addPage([595, 842]).drawPage(p);
    return null;
  }, "Falha");
  if (aviso !== null || destino.getPageCount() !== 3) throw new Error("Anexo incompleto");
  await destino.save();
  if (!bytes.every((v, i) => v === copia[i])) throw new Error("Original modificado");
});