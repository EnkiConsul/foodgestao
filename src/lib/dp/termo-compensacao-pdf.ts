// PDF institucional dos acordos de compensação: cabeçalho da empresa,
// quadro da jornada semanal (segunda a domingo, com DSR/folga), cláusulas
// editadas na prévia e bloco de assinaturas Empregador / Empregado.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface LinhaJornada {
  dia: string;
  trabalha: boolean;
  entrada?: string | null;
  saida?: string | null;
  intervalo?: number | null;
  minutos: number;
  /** Rótulo quando não trabalha: "DSR" ou "Folga". */
  descanso?: string;
}

export interface DadosTermoPdf {
  titulo: string;
  versao: string;
  empresa: string;
  cnpj?: string | null;
  unidade?: string | null;
  nome: string;
  cpf?: string | null;
  cargo?: string | null;
  jornada: LinhaJornada[];
  clausulas: string[];
}

const AZUL = rgb(0.06, 0.11, 0.24);
const LARANJA = rgb(0.92, 0.38, 0.1);
const CINZA = rgb(0.42, 0.45, 0.5);
const ZEBRA = rgb(0.95, 0.96, 0.98);

function limpar(t: string) {
  return t.replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF\n]/g, "");
}

export const fmtHoras = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

export async function gerarTermoCompensacaoPdf(d: DadosTermoPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const b = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48, L = W - M * 2;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const texto = (t: string, x: number, yy: number, s = 10, fonte: PDFFont = f, cor = AZUL) =>
    page.drawText(limpar(t), { x, y: yy, size: s, font: fonte, color: cor });

  const novaPagina = () => { page = pdf.addPage([W, H]); y = H - M; };
  const garantir = (alt: number) => { if (y - alt < M + 40) novaPagina(); };

  const quebrarLinhas = (t: string, fonte: PDFFont, s: number, larg: number) => {
    const saida: string[] = [];
    for (const bloco of limpar(t).split("\n")) {
      let atual = "";
      for (const p of bloco.split(/\s+/).filter(Boolean)) {
        const teste = atual ? `${atual} ${p}` : p;
        if (fonte.widthOfTextAtSize(teste, s) > larg) { saida.push(atual); atual = p; } else atual = teste;
      }
      saida.push(atual);
    }
    return saida;
  };

  // Cabeçalho
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: LARANJA });
  texto(d.empresa, M, y - 6, 13, b);
  const sub = [d.cnpj ? `CNPJ ${d.cnpj}` : null, d.unidade ? `Unidade: ${d.unidade}` : null].filter(Boolean).join("  ·  ");
  if (sub) texto(sub, M, y - 22, 9, f, CINZA);
  y -= 36;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: AZUL });
  y -= 24;
  for (const l of quebrarLinhas(d.titulo.toUpperCase(), b, 13, L)) {
    texto(l, M + (L - b.widthOfTextAtSize(l, 13)) / 2, y, 13, b); y -= 17;
  }
  texto("CLT, art. 59, §§ 2º, 5º e 6º", M + (L - f.widthOfTextAtSize("CLT, art. 59, §§ 2º, 5º e 6º", 8.5)) / 2, y, 8.5, f, CINZA);
  y -= 22;

  // Partes
  const caixa = (rot: string, linhas: string[]) => {
    const alt = 24 + linhas.length * 13;
    garantir(alt + 8);
    page.drawRectangle({ x: M, y: y - alt, width: L, height: alt, color: ZEBRA });
    texto(rot, M + 10, y - 13, 8, b, LARANJA);
    linhas.forEach((l, i) => texto(l, M + 10, y - 27 - i * 13, 9.5));
    y -= alt + 8;
  };
  caixa("EMPREGADOR", [`${d.empresa}${d.cnpj ? ` - CNPJ ${d.cnpj}` : ""}`]);
  caixa("EMPREGADO(A)", [d.nome, [d.cpf ? `CPF ${d.cpf}` : null, d.cargo ? `Cargo: ${d.cargo}` : null].filter(Boolean).join("  ·  ") || " "]);
  y -= 6;

  // Quadro da jornada
  garantir(40 + d.jornada.length * 18);
  texto("QUADRO DA JORNADA SEMANAL", M, y, 10, b); y -= 10;
  const cols = [{ t: "Dia", w: 0.26 }, { t: "Entrada", w: 0.15 }, { t: "Intervalo", w: 0.15 }, { t: "Saída", w: 0.15 }, { t: "Horas do Dia", w: 0.29 }];
  const linhaTabela = (vals: string[], fundo: ReturnType<typeof rgb> | null, fonte: PDFFont, cor = AZUL) => {
    if (fundo) page.drawRectangle({ x: M, y: y - 18, width: L, height: 18, color: fundo });
    let x = M + 8;
    vals.forEach((v, i) => { texto(v, x, y - 12.5, 9, fonte, cor); x += cols[i].w * L; });
    y -= 18;
  };
  linhaTabela(cols.map((c) => c.t), AZUL, b, rgb(1, 1, 1));
  d.jornada.forEach((j, i) => {
    const fundo = i % 2 ? ZEBRA : null;
    if (!j.trabalha) linhaTabela([j.dia, "-", "-", "-", (j.descanso ?? "Folga").toUpperCase()], fundo, b, LARANJA);
    else linhaTabela([j.dia, j.entrada ?? "-", j.intervalo ? `${j.intervalo} min` : "-", j.saida ?? "-", j.minutos ? fmtHoras(j.minutos) : "-"], fundo, f);
  });
  const total = d.jornada.reduce((a, j) => a + (j.trabalha ? j.minutos : 0), 0);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: AZUL });
  linhaTabela(["Total semanal", "", "", "", fmtHoras(total)], null, b);
  y -= 14;

  // Cláusulas
  for (const c of d.clausulas.filter((c) => c.trim())) {
    const ls = quebrarLinhas(c, f, 10, L);
    for (const l of ls) { garantir(14); texto(l, M, y, 10); y -= 14; }
    y -= 6;
  }

  // Assinaturas
  garantir(150);
  y -= 10;
  const data = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" });
  texto(`${d.unidade ? `${d.unidade}, ` : ""}${data}.`, M, y, 10); y -= 70;
  const larg = (L - 30) / 2;
  const bloco = (x: number, linhas: string[]) => {
    page.drawLine({ start: { x, y }, end: { x: x + larg, y }, thickness: 0.8, color: AZUL });
    linhas.forEach((l, i) => texto(l, x, y - 13 - i * 12, i === 0 ? 9.5 : 8.5, i === 0 ? b : f, i === 0 ? AZUL : CINZA));
  };
  bloco(M, ["EMPREGADOR", d.empresa.slice(0, 48), d.cnpj ? `CNPJ ${d.cnpj}` : ""]);
  bloco(M + larg + 30, ["EMPREGADO(A)", d.nome.slice(0, 48), [d.cpf ? `CPF ${d.cpf}` : "", d.cargo ?? ""].filter(Boolean).join(" · ")]);

  // Rodapé em todas as páginas
  const pags = pdf.getPages();
  const emitido = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  pags.forEach((p, i) => {
    p.drawText(limpar(`${d.titulo} · Versão ${d.versao} · Emitido em ${emitido} · Página ${i + 1} de ${pags.length}`), { x: M, y: 24, size: 7, font: f, color: CINZA });
  });
  return pdf.save();
}
