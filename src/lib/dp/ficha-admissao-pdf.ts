/**
 * Ficha de admissão em PDF único: dados cadastrados + documentos anexados
 * (fotos viram páginas; PDFs são acrescentados página a página). O arquivo é
 * gerado no navegador e baixado — o envio à contabilidade é feito pelo gestor.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type FichaSecao = { titulo: string; linhas: Array<[string, string]> };
export type FichaAnexo = { titulo: string; blob: Blob; mime: string };

/** Fonte padrão só cobre Latin-1: troca o resto por equivalentes simples. */
const limpar = (s: string) =>
  String(s ?? "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

function quebrar(texto: string, fonte: PDFFont, tam: number, largura: number): string[] {
  const out: string[] = [];
  for (const par of limpar(texto).split(/\n/)) {
    let linha = "";
    for (const p of par.split(/\s+/)) {
      const t = linha ? `${linha} ${p}` : p;
      if (fonte.widthOfTextAtSize(t, tam) > largura && linha) {
        out.push(linha);
        linha = p;
      } else linha = t;
    }
    out.push(linha);
  }
  return out;
}

export async function gerarFichaAdmissaoPdf(opts: {
  titulo: string;
  subtitulo?: string;
  secoes: FichaSecao[];
  anexos: FichaAnexo[];
}): Promise<{ bytes: Uint8Array; falhas: string[] }> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 40;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const garantir = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  for (const l of quebrar(opts.titulo, fb, 15, W - 2 * M)) {
    page.drawText(l, { x: M, y: y - 15, size: 15, font: fb });
    y -= 20;
  }
  if (opts.subtitulo) {
    page.drawText(limpar(opts.subtitulo), { x: M, y: y - 10, size: 9, font: f, color: rgb(0.4, 0.4, 0.4) });
    y -= 18;
  }

  const colR = 170;
  for (const s of opts.secoes) {
    garantir(40);
    y -= 10;
    page.drawText(limpar(s.titulo), { x: M, y: y - 12, size: 11.5, font: fb });
    y -= 18;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 4;
    const linhas = s.linhas.length ? s.linhas : [["", "Nenhuma informação"] as [string, string]];
    for (const [rot, val] of linhas) {
      const rl = quebrar(rot, fb, 9, colR - 8);
      const vl = quebrar(val, f, 9, W - 2 * M - colR);
      const h = Math.max(rl.length, vl.length) * 12 + 4;
      garantir(h);
      rl.forEach((t, i) => page.drawText(t, { x: M, y: y - 11 - i * 12, size: 9, font: fb }));
      vl.forEach((t, i) => page.drawText(t, { x: M + colR, y: y - 11 - i * 12, size: 9, font: f }));
      y -= h;
    }
  }

  const falhas: string[] = [];
  for (const a of opts.anexos) {
    try {
      const bytes = new Uint8Array(await a.blob.arrayBuffer());
      if (a.mime === "application/pdf") {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pags = await pdf.copyPages(src, src.getPageIndices());
        pags.forEach((p, i) => {
          pdf.addPage(p);
          const { width, height } = p.getSize();
          p.drawText(limpar(`${a.titulo}${pags.length > 1 ? ` (${i + 1}/${pags.length})` : ""}`), {
            x: 20, y: height - 14, size: 8, font: fb, color: rgb(0.3, 0.3, 0.3),
          });
          void width;
        });
        continue;
      }
      let img;
      if (a.mime === "image/png") img = await pdf.embedPng(bytes);
      else if (a.mime === "image/jpeg" || a.mime === "image/jpg") img = await pdf.embedJpg(bytes);
      else {
        // Outros formatos (webp, heic etc.): converte pelo navegador.
        const bmp = await createImageBitmap(a.blob);
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d")!.drawImage(bmp, 0, 0);
        const jpg = await new Promise<Blob>((ok, err) =>
          c.toBlob((b) => (b ? ok(b) : err(new Error("conversão"))), "image/jpeg", 0.9));
        img = await pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      }
      const p = pdf.addPage([W, H]);
      p.drawText(limpar(a.titulo), { x: M, y: H - M - 12, size: 11, font: fb });
      const maxW = W - 2 * M, maxH = H - 2 * M - 24;
      const e = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * e, h = img.height * e;
      p.drawImage(img, { x: M + (maxW - w) / 2, y: M + (maxH - h), width: w, height: h });
    } catch {
      falhas.push(a.titulo);
    }
  }
  return { bytes: await pdf.save(), falhas };
}
