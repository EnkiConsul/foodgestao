import { PDFDocument, StandardFonts, rgb, type RGB, type PDFPage, type PDFFont } from "pdf-lib";

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
  metricas?: { label: string; valor: number }[];
  hoje?: string;
  diasDominicais?: number[];
}

const DOW = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const c = (v: [number, number, number]): RGB => rgb(v[0] / 255, v[1] / 255, v[2] / 255);
// Identidade AVETO 360
const VERDE = rgb(39 / 255, 174 / 255, 96 / 255);
const FLORESTA = rgb(21 / 255, 128 / 255, 61 / 255);
const PRETO = rgb(11 / 255, 13 / 255, 11 / 255);
const GRAFITE = rgb(51 / 255, 51 / 255, 51 / 255);
const OFF = rgb(242 / 255, 242 / 255, 242 / 255);
const BORDA = rgb(0.86, 0.88, 0.86);
const CINZA = rgb(0.6, 0.6, 0.6);
const VERDE_CLARO = rgb(0.9, 0.97, 0.93);
const BRANCO = rgb(1, 1, 1);

const limpo = (s: string) => s.normalize("NFC").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");

function pill(page: PDFPage, x: number, y: number, w: number, h: number, color: RGB, opacity = 1) {
  const r = Math.min(h / 2, 3);
  page.drawRectangle({ x: x + r, y, width: Math.max(0, w - 2 * r), height: h, color, opacity });
  page.drawRectangle({ x, y: y + r, width: w, height: Math.max(0, h - 2 * r), color, opacity });
  page.drawCircle({ x: x + r, y: y + r, size: r, color, opacity });
  page.drawCircle({ x: x + w - r, y: y + r, size: r, color, opacity });
  page.drawCircle({ x: x + r, y: y + h - r, size: r, color, opacity });
  page.drawCircle({ x: x + w - r, y: y + h - r, size: r, color, opacity });
}

function cortar(t: string, font: PDFFont, size: number, max: number) {
  let s = t;
  while (s.length > 1 && font.widthOfTextAtSize(s, size) > max) s = s.slice(0, -1);
  return s;
}

/** Chama simples (pico de operação) desenhada em vetor. */
function chama(page: PDFPage, x: number, y: number) {
  page.drawCircle({ x, y: y + 2.2, size: 2.4, color: VERDE });
  page.drawSvgPath("M 0 0 L 2.4 4.5 L -2.4 4.5 Z", { x, y: y + 7.5, color: VERDE, scale: 1 });
}

/** Cadeado simples desenhado em vetor. */
function cadeado(page: PDFPage, x: number, y: number, cor: RGB) {
  page.drawRectangle({ x, y, width: 6, height: 4.5, color: cor });
  page.drawEllipse({ x: x + 3, y: y + 4.5, xScale: 2, yScale: 2.2, borderColor: cor, borderWidth: 0.9 });
}

export async function gerarCalendarioMesPdf(inp: CalendarioPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const W = 842, H = 595; // A4 paisagem
  const page = doc.addPage([W, H]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 22;
  const dom = new Set(inp.diasDominicais ?? [0]);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BRANCO });

  // Cabeçalho
  page.drawRectangle({ x: 0, y: H - 50, width: W, height: 50, color: PRETO });
  page.drawRectangle({ x: 0, y: H - 52, width: W, height: 2, color: VERDE });
  page.drawText("AVETO", { x: M, y: H - 31, size: 15, font: fb, color: BRANCO });
  page.drawText("360", { x: M + fb.widthOfTextAtSize("AVETO ", 15), y: H - 31, size: 15, font: fb, color: VERDE });
  const tit = limpo(`${inp.titulo}  |  ${inp.competencia}`);
  page.drawText(tit, { x: M + 110, y: H - 30, size: 12, font: fb, color: BRANCO });
  const un = limpo(inp.unidade);
  page.drawText(un, { x: W - M - f.widthOfTextAtSize(un, 10), y: H - 30, size: 10, font: f, color: OFF });

  // Métricas (só valores > 0, já filtradas na tela)
  let y = H - 74;
  let mx = M;
  for (const m of inp.metricas ?? []) {
    const v = String(m.valor), l = limpo(m.label);
    const w = fb.widthOfTextAtSize(v, 10) + f.widthOfTextAtSize(l, 7.5) + 16;
    page.drawRectangle({ x: mx, y: y - 3, width: w, height: 15, color: OFF, borderColor: BORDA, borderWidth: 0.5 });
    page.drawText(v, { x: mx + 5, y: y + 1, size: 10, font: fb, color: FLORESTA });
    page.drawText(l, { x: mx + 9 + fb.widthOfTextAtSize(v, 10), y: y + 2, size: 7.5, font: f, color: GRAFITE });
    mx += w + 5;
  }

  // Legenda (só o que existe no mês)
  let lx = W - M;
  const itens = [...inp.legenda.map((l) => ({ label: limpo(l.label), cor: c(l.cor) }))];
  const larguras = itens.map((i) => 14 + f.widthOfTextAtSize(i.label, 7.5) + 10);
  const extra = 14 + f.widthOfTextAtSize("Escalados no dia (N)", 7.5);
  lx -= larguras.reduce((a, b) => a + b, 0) + extra;
  const ly = y + 1;
  itens.forEach((i, k) => {
    pill(page, lx, ly, 9, 8, i.cor);
    page.drawText(i.label, { x: lx + 12, y: ly + 1.5, size: 7.5, font: f, color: GRAFITE });
    lx += larguras[k];
  });
  pill(page, lx, ly, 10, 8, OFF);
  page.drawText("N", { x: lx + 3, y: ly + 1.5, size: 6.5, font: fb, color: FLORESTA });
  page.drawText("Escalados no dia", { x: lx + 13, y: ly + 1.5, size: 7.5, font: f, color: GRAFITE });

  // Grade
  const top = H - 90;
  const cw = (W - 2 * M) / 7, hh = 18;
  const semanas = Math.ceil(inp.celulas.length / 7);
  const ch = (top - hh - M - 12) / semanas;

  DOW.forEach((d, i) => {
    const x = M + i * cw;
    page.drawRectangle({ x, y: top - hh, width: cw, height: hh, color: rgb(0.2, 0.2, 0.2) });
    const t = limpo(d);
    page.drawText(t, { x: x + (cw - fb.widthOfTextAtSize(t, 8.5)) / 2, y: top - hh + 6, size: 8.5, font: fb, color: dom.has(i) ? VERDE : BRANCO });
  });
  page.drawRectangle({ x: M, y: top - hh - 1.5, width: W - 2 * M, height: 1.5, color: VERDE });

  inp.celulas.forEach((cel, idx) => {
    const col = idx % 7, row = Math.floor(idx / 7);
    const x = M + col * cw, yc = top - hh - 1.5 - (row + 1) * ch;
    const ehHoje = cel.iso === inp.hoje;
    const passado = !!inp.hoje && cel.iso < inp.hoje;
    page.drawRectangle({ x, y: yc, width: cw, height: ch, color: cel.dentroMes ? BRANCO : rgb(0.975, 0.975, 0.975), borderColor: BORDA, borderWidth: 0.5 });

    // Faixa do dia
    const fh = 14;
    const faixa = ehHoje ? VERDE : cel.feriado ? VERDE_CLARO : OFF;
    if (cel.dentroMes) page.drawRectangle({ x: x + 0.5, y: yc + ch - fh, width: cw - 1, height: fh - 0.5, color: faixa });
    if (ehHoje) page.drawRectangle({ x, y: yc, width: cw, height: ch, borderColor: VERDE, borderWidth: 1.4 });

    const n = String(Number(cel.iso.slice(8)));
    const corNum = !cel.dentroMes ? CINZA : ehHoje ? BRANCO : passado ? CINZA : PRETO;
    page.drawText(n, { x: x + 4, y: yc + ch - 10.5, size: 9.5, font: fb, color: corNum });
    if (!cel.dentroMes) return;

    let hx = x + 8 + fb.widthOfTextAtSize(n, 9.5);
    if (cel.pico) { chama(page, hx + 2.5, yc + ch - 11.5); hx += 8; }
    if (cel.bloqueado) { cadeado(page, hx, yc + ch - 10.5, ehHoje ? BRANCO : rgb(0.75, 0.15, 0.15)); hx += 10; }
    const badge = String(cel.trabalhando);
    const bw = fb.widthOfTextAtSize(badge, 7) + 8;
    if (cel.feriado) {
      const fe = cortar(limpo(cel.feriado).toUpperCase(), fb, 6, x + cw - bw - 8 - hx);
      page.drawText(fe, { x: hx, y: yc + ch - 10, size: 6, font: fb, color: ehHoje ? BRANCO : FLORESTA });
    }
    pill(page, x + cw - bw - 3, yc + ch - 11.5, bw, 9, ehHoje ? BRANCO : rgb(0.85, 0.94, 0.88));
    page.drawText(badge, { x: x + cw - bw + 1, y: yc + ch - 9.3, size: 7, font: fb, color: FLORESTA });

    // Chips de ausência: múltiplos por linha
    const op = passado ? 0.5 : 1;
    const chipH = 8.5, gap = 2;
    let cx = x + 3, cy = yc + ch - fh - chipH - 3;
    const limiteY = yc + 3;
    let mostrados = 0;
    for (const a of cel.ausencias) {
      const nome = limpo(`${a.troca ? "<> " : ""}${a.nome}`).toUpperCase();
      let w = Math.min(fb.widthOfTextAtSize(nome, 6) + 6, cw - 6);
      if (cx + w > x + cw - 3) { cx = x + 3; cy -= chipH + gap; }
      if (cy < limiteY + chipH) break;
      w = Math.min(w, x + cw - 3 - cx);
      pill(page, cx, cy, w, chipH, c(a.cor), op);
      page.drawText(cortar(nome, fb, 6, w - 5), { x: cx + 3, y: cy + 2.2, size: 6, font: fb, color: BRANCO, opacity: passado ? 0.85 : 1 });
      cx += w + gap;
      mostrados++;
    }
    const resto = cel.ausencias.length - mostrados;
    if (resto > 0) page.drawText(`+${resto}`, { x: x + cw - 14, y: yc + 3, size: 7, font: fb, color: GRAFITE });
  });

  page.drawText(limpo(`Gerado em ${new Date().toLocaleString("pt-BR")}  |  Pessoas 360`), { x: M, y: 9, size: 7, font: f, color: CINZA });
  return doc.save();
}
