import { PDFDocument, StandardFonts, rgb, type RGB } from "pdf-lib";

export interface CelulaPdf {
  iso: string;
  dentroMes: boolean;
  trabalhando: number;
  feriado?: string | null;
  bloqueado?: boolean;
  pico?: boolean;
  dominical?: boolean;
  ausencias: { nome: string; cor: [number, number, number]; troca?: boolean }[];
}

export interface CalendarioPdfInput {
  titulo: string;
  unidade: string;
  competencia: string;
  celulas: CelulaPdf[]; // semanas completas, domingo→sábado
  legenda: { label: string; cor: [number, number, number] }[];
}

const DOW = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const c = (v: [number, number, number]): RGB => rgb(v[0] / 255, v[1] / 255, v[2] / 255);
const VERDE = rgb(39 / 255, 174 / 255, 96 / 255);
const FLORESTA = rgb(21 / 255, 128 / 255, 61 / 255);
const GRAFITE = rgb(51 / 255, 51 / 255, 51 / 255);
const CINZA = rgb(0.6, 0.6, 0.6);

/** Remove caracteres fora do WinAnsi (emoji etc.) para não quebrar a fonte padrão. */
const limpo = (s: string) => s.normalize("NFC").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");

export async function gerarCalendarioMesPdf(inp: CalendarioPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const W = 842, H = 595; // A4 paisagem
  const page = doc.addPage([W, H]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 24;

  page.drawRectangle({ x: 0, y: H - 54, width: W, height: 54, color: rgb(11 / 255, 13 / 255, 11 / 255) });
  page.drawText("AVETO 360", { x: M, y: H - 34, size: 14, font: fb, color: VERDE });
  page.drawText(limpo(`${inp.titulo} · ${inp.competencia}`), { x: M + 95, y: H - 34, size: 14, font: fb, color: rgb(1, 1, 1) });
  const un = limpo(inp.unidade);
  page.drawText(un, { x: W - M - f.widthOfTextAtSize(un, 11), y: H - 33, size: 11, font: f, color: rgb(0.9, 0.9, 0.9) });

  // Legenda
  let lx = M; const ly = H - 72;
  for (const l of inp.legenda) {
    page.drawRectangle({ x: lx, y: ly, width: 9, height: 9, color: c(l.cor) });
    const t = limpo(l.label);
    page.drawText(t, { x: lx + 13, y: ly + 1, size: 8, font: f, color: GRAFITE });
    lx += 22 + f.widthOfTextAtSize(t, 8);
  }

  const top = H - 86, gridH = top - M - 14;
  const cw = (W - 2 * M) / 7, hh = 16;
  const semanas = Math.ceil(inp.celulas.length / 7);
  const ch = (gridH - hh) / semanas;

  DOW.forEach((d, i) => {
    const pico = i >= 5 || i === 0;
    page.drawRectangle({ x: M + i * cw, y: top - hh, width: cw, height: hh, color: pico ? rgb(1, 0.93, 0.8) : rgb(0.93, 0.97, 0.94) });
    const lbl = limpo(pico ? `${d} · PICO` : d);
    page.drawText(lbl, { x: M + i * cw + (cw - fb.widthOfTextAtSize(lbl, 8)) / 2, y: top - hh + 5, size: 8, font: fb, color: pico ? rgb(0.55, 0.3, 0) : FLORESTA });
  });

  inp.celulas.forEach((cel, idx) => {
    const col = idx % 7, row = Math.floor(idx / 7);
    const x = M + col * cw, y = top - hh - (row + 1) * ch;
    const bg = !cel.dentroMes ? rgb(0.97, 0.97, 0.97) : cel.feriado ? rgb(0.92, 0.97, 0.93) : cel.dominical ? rgb(1, 0.97, 0.9) : rgb(1, 1, 1);
    page.drawRectangle({ x, y, width: cw, height: ch, color: bg, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
    if (cel.pico && cel.dentroMes) page.drawRectangle({ x, y: y + ch - 2.5, width: cw, height: 2.5, color: rgb(0.96, 0.6, 0.1) });
    const n = String(Number(cel.iso.slice(8)));
    page.drawText(n, { x: x + 4, y: y + ch - 13, size: 10, font: fb, color: cel.dentroMes ? GRAFITE : CINZA });
    if (!cel.dentroMes) return;
    let hx = x + 8 + fb.widthOfTextAtSize(n, 10);
    if (cel.bloqueado) { page.drawText("BLOQ.", { x: hx, y: y + ch - 12, size: 6.5, font: fb, color: rgb(0.8, 0.1, 0.1) }); hx += 24; }
    if (cel.feriado) {
      const fe = limpo(cel.feriado).slice(0, 16);
      page.drawText(fe, { x: hx, y: y + ch - 12, size: 6.5, font: fb, color: FLORESTA });
    }
    const tr = `${cel.trabalhando} trab.`;
    page.drawText(tr, { x: x + cw - 4 - f.widthOfTextAtSize(tr, 7), y: y + 4, size: 7, font: f, color: GRAFITE });
    const linhaH = 9, maxLinhas = Math.max(1, Math.floor((ch - 26) / linhaH));
    const meio = cel.ausencias.length > maxLinhas;
    const largura = meio ? cw / 2 - 5 : cw - 8;
    const cap = meio ? maxLinhas * 2 : maxLinhas;
    cel.ausencias.slice(0, cap).forEach((a, i) => {
      const cx = x + 4 + (meio ? (i % 2) * (cw / 2 - 1) : 0);
      const cy = y + ch - 26 - (meio ? Math.floor(i / 2) : i) * linhaH;
      page.drawRectangle({ x: cx, y: cy, width: largura, height: 8, color: c(a.cor), opacity: 0.9 });
      let nome = limpo(`${a.troca ? "<> " : ""}${a.nome}`).toUpperCase();
      while (nome.length > 1 && fb.widthOfTextAtSize(nome, 6.5) > largura - 4) nome = nome.slice(0, -1);
      page.drawText(nome, { x: cx + 2, y: cy + 1.8, size: 6.5, font: fb, color: rgb(1, 1, 1) });
    });
    const resto = cel.ausencias.length - cap;
    if (resto > 0) page.drawText(`+${resto}`, { x: x + 4, y: y + 4, size: 7, font: fb, color: GRAFITE });
  });

  page.drawText(limpo(`Gerado em ${new Date().toLocaleString("pt-BR")} · Pessoas 360°`), { x: M, y: 10, size: 7, font: f, color: CINZA });
  return doc.save();
}
