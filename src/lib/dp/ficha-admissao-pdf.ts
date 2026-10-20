/**
 * Dossiê de Admissão AVETO 360 em PDF único: cabeçalho da empresa com
 * protocolo e foto do candidato, blocos de dados na identidade visual da marca
 * e documentos anexados em seguida (fotos viram páginas; PDFs são acrescentados).
 * Antes da aprovação e do exame admissional sai como PRÉVIA, com tarja.
 * Gerado no navegador; o envio à contabilidade é feito pelo gestor.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export type FichaSecao = { titulo: string; linhas: Array<[string, string]> };
export type FichaAnexo = { titulo: string; blob: Blob; mime: string };

const VERDE = rgb(0.082, 0.502, 0.239); // #15803D
const VERDE_VIVO = rgb(0.153, 0.682, 0.376); // #27AE60
const GRAFITE = rgb(0.2, 0.2, 0.2); // #333333
const CINZA = rgb(0.42, 0.45, 0.5);
const FUNDO = rgb(0.973, 0.98, 0.988); // #F8FAFC
const BORDA = rgb(0.886, 0.91, 0.941);
const AMBAR = rgb(0.85, 0.47, 0.02);

/** Fonte padrão só cobre Latin-1: troca o resto por equivalentes simples. */
const limpar = (s: string) =>
  String(s ?? "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2022\u00B7]/g, "-")
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

async function embutirImagem(pdf: PDFDocument, blob: Blob, mime: string): Promise<PDFImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (mime === "image/png") return pdf.embedPng(bytes);
  if (mime === "image/jpeg" || mime === "image/jpg") return pdf.embedJpg(bytes);
  // Outros formatos (webp, heic etc.): converte pelo navegador.
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  const jpg = await new Promise<Blob>((ok, err) =>
    c.toBlob((b) => (b ? ok(b) : err(new Error("conversão"))), "image/jpeg", 0.9));
  return pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
}

export async function gerarFichaAdmissaoPdf(opts: {
  titulo: string;
  subtitulo?: string;
  empresa?: string;
  cnpj?: string;
  protocolo?: string;
  /**
   * Natureza do documento conforme o vínculo (ex.: "Ficha de Admissão",
   * "Cadastro de Prestador PJ"). Padrão: "Ficha de Admissão".
   */
  documento?: string;
  /** Ficha ainda sem aprovação/ASO: sai com tarja de prévia. */
  previa?: boolean;
  foto?: { blob: Blob; mime: string } | null;
  secoes: FichaSecao[];
  anexos: FichaAnexo[];
}): Promise<{ bytes: Uint8Array; falhas: string[] }> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 36;
  const geradoEm = new Date().toLocaleString("pt-BR");

  const marca = (p: PDFPage, x: number, y: number, tam: number, claro = false) => {
    p.drawText("AVETO", { x, y, size: tam, font: fb, color: claro ? rgb(1, 1, 1) : GRAFITE });
    const w = fb.widthOfTextAtSize("AVETO ", tam);
    p.drawText("360", { x: x + w, y, size: tam, font: fb, color: claro ? rgb(0.75, 0.95, 0.82) : VERDE_VIVO });
  };

  // ---------- Capa / cabeçalho ----------
  let page: PDFPage = pdf.addPage([W, H]);
  const topoH = 118;
  page.drawRectangle({ x: 0, y: H - topoH, width: W, height: topoH, color: VERDE });
  page.drawRectangle({ x: 0, y: H - topoH - 4, width: W, height: 4, color: VERDE_VIVO });
  marca(page, M, H - 34, 14, true);
  page.drawText("PESSOAS 360° - DOSSIÊ DE ADMISSÃO", { x: M, y: H - 50, size: 8, font: f, color: rgb(0.85, 0.95, 0.88) });

  const fotoW = 74, fotoH = 92;
  const textoMax = W - 2 * M - (opts.foto ? fotoW + 16 : 0);
  let ty = H - 74;
  for (const l of quebrar(opts.titulo.toUpperCase(), fb, 16, textoMax).slice(0, 2)) {
    page.drawText(l, { x: M, y: ty, size: 16, font: fb, color: rgb(1, 1, 1) });
    ty -= 18;
  }
  const info = [opts.empresa, opts.cnpj && `CNPJ ${opts.cnpj}`, opts.subtitulo].filter(Boolean).join("  |  ");
  if (info) {
    for (const l of quebrar(info, f, 8.5, textoMax).slice(0, 2)) {
      page.drawText(l, { x: M, y: ty, size: 8.5, font: f, color: rgb(0.9, 0.97, 0.92) });
      ty -= 11;
    }
  }

  const falhas: string[] = [];
  if (opts.foto) {
    const fx = W - M - fotoW, fy = H - topoH + 14;
    page.drawRectangle({ x: fx - 3, y: fy - 3, width: fotoW + 6, height: fotoH + 6, color: rgb(1, 1, 1) });
    try {
      const img = await embutirImagem(pdf, opts.foto.blob, opts.foto.mime);
      const e = Math.min(fotoW / img.width, fotoH / img.height);
      const w = img.width * e, h = img.height * e;
      page.drawImage(img, { x: fx + (fotoW - w) / 2, y: fy + (fotoH - h) / 2, width: w, height: h });
    } catch {
      page.drawText("Sem foto", { x: fx + 14, y: fy + fotoH / 2, size: 9, font: f, color: CINZA });
    }
  }

  // Faixa de protocolo / situação
  let y = H - topoH - 4;
  page.drawRectangle({ x: 0, y: y - 26, width: W, height: 26, color: opts.previa ? rgb(1, 0.97, 0.9) : FUNDO });
  const situacao = opts.previa ? "PRÉVIA DE ADMISSÃO - EM REVISÃO INTERNA" : "DOSSIÊ OFICIAL PARA REGISTRO";
  page.drawText(limpar(situacao), { x: M, y: y - 17, size: 9, font: fb, color: opts.previa ? AMBAR : VERDE });
  const prot = limpar(`${opts.protocolo ? `Protocolo ${opts.protocolo}  |  ` : ""}Gerado em ${geradoEm}`);
  page.drawText(prot, { x: W - M - f.widthOfTextAtSize(prot, 8), y: y - 17, size: 8, font: f, color: CINZA });
  y -= 40;

  const novaPagina = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 30, width: W, height: 30, color: VERDE });
    marca(page, M, H - 20, 10, true);
    const t = limpar(opts.titulo.toUpperCase());
    page.drawText(t, { x: W - M - f.widthOfTextAtSize(t, 8), y: H - 19, size: 8, font: f, color: rgb(0.9, 0.97, 0.92) });
    y = H - 48;
  };
  const garantir = (h: number) => { if (y - h < M + 30) novaPagina(); };

  // ---------- Blocos ----------
  const colR = 160;
  const larguraVal = W - 2 * M - colR - 20;
  for (const s of opts.secoes) {
    const linhas = s.linhas.length ? s.linhas : [["", "Nenhuma informação"] as [string, string]];
    garantir(54);
    // Título do bloco
    page.drawRectangle({ x: M, y: y - 22, width: 4, height: 22, color: VERDE_VIVO });
    page.drawRectangle({ x: M + 4, y: y - 22, width: W - 2 * M - 4, height: 22, color: FUNDO });
    page.drawText(limpar(s.titulo.toUpperCase()), { x: M + 14, y: y - 15, size: 9.5, font: fb, color: VERDE });
    y -= 26;
    linhas.forEach(([rot, val], i) => {
      const rl = quebrar(rot, fb, 8.5, colR - 10);
      const vl = quebrar(val || "-", f, 9, larguraVal);
      const h = Math.max(rl.length, vl.length) * 11.5 + 7;
      garantir(h);
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: rgb(0.985, 0.99, 0.993) });
      rl.forEach((t, k) => page.drawText(t, { x: M + 10, y: y - 12 - k * 11.5, size: 8.5, font: fb, color: CINZA }));
      vl.forEach((t, k) => page.drawText(t, { x: M + 10 + colR, y: y - 12 - k * 11.5, size: 9, font: f, color: GRAFITE }));
      y -= h;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: BORDA });
    });
    y -= 12;
  }

  // ---------- Anexos ----------
  for (const a of opts.anexos) {
    try {
      if (a.mime === "application/pdf") {
        const src = await PDFDocument.load(new Uint8Array(await a.blob.arrayBuffer()), { ignoreEncryption: true });
        const pags = await pdf.copyPages(src, src.getPageIndices());
        pags.forEach((p, i) => {
          pdf.addPage(p);
          const { width, height } = p.getSize();
          p.drawRectangle({ x: 0, y: height - 20, width, height: 20, color: VERDE, opacity: 0.92 });
          p.drawText(limpar(`ANEXO - ${a.titulo}${pags.length > 1 ? ` (${i + 1}/${pags.length})` : ""}`), {
            x: 16, y: height - 14, size: 8, font: fb, color: rgb(1, 1, 1),
          });
        });
        continue;
      }
      const img = await embutirImagem(pdf, a.blob, a.mime);
      const p = pdf.addPage([W, H]);
      p.drawRectangle({ x: 0, y: H - 30, width: W, height: 30, color: VERDE });
      marca(p, M, H - 20, 10, true);
      p.drawText(limpar(`ANEXO - ${a.titulo}`), { x: M, y: H - 52, size: 10, font: fb, color: GRAFITE });
      const maxW = W - 2 * M, maxH = H - 2 * M - 70;
      const e = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * e, h = img.height * e;
      const ix = M + (maxW - w) / 2, iy = M + 30 + (maxH - h);
      p.drawRectangle({ x: ix - 4, y: iy - 4, width: w + 8, height: h + 8, borderColor: BORDA, borderWidth: 1 });
      p.drawImage(img, { x: ix, y: iy, width: w, height: h });
    } catch {
      falhas.push(a.titulo);
    }
  }

  // ---------- Rodapé, numeração e tarja em todas as páginas ----------
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const { width } = p.getSize();
    p.drawLine({ start: { x: M, y: 30 }, end: { x: width - M, y: 30 }, thickness: 0.5, color: BORDA });
    p.drawText(limpar("Documento gerado eletronicamente via AVETO 360 - Pessoas 360°, plataforma de gestão para food service."), {
      x: M, y: 18, size: 7, font: f, color: CINZA,
    });
    const num = `Página ${i + 1} de ${paginas.length}${opts.protocolo ? `  |  ${opts.protocolo}` : ""}`;
    p.drawText(limpar(num), { x: width - M - f.widthOfTextAtSize(limpar(num), 7), y: 18, size: 7, font: f, color: CINZA });
    if (opts.previa) {
      p.drawText("PRÉVIA", {
        x: width / 2 - 150, y: p.getSize().height / 2 - 60, size: 96, font: fb,
        color: AMBAR, opacity: 0.08, rotate: degrees(35),
      });
    }
  });

  return { bytes: await pdf.save(), falhas };
}
