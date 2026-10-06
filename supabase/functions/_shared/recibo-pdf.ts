/**
 * Recibo de pagamento avulso (freelancer, diária, teste operacional, outros),
 * timbrado AVETO 360. Usado na emissão pelo gestor e na página pública de
 * assinatura pelo WhatsApp — o mesmo arquivo é o que a pessoa assina.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "npm:pdf-lib@1.17.1";
import {
  MARCA_ASSINATURA,
  MARCA_LARANJA,
  MARCA_MARINHO,
  MARCA_PNG_BASE64,
} from "./marca-aveto.ts";
import { desenharAssinatura, embutirAssinatura, rubricarPaginas } from "./assinatura-pdf.ts";
import { centsParaBRL, modalidadeLabel, valorPorExtenso } from "./quitacao.ts";

export const NATUREZAS = ["acerto_mensal", "adiantamento", "diaria", "teste_operacional", "rescisao", "outros"] as const;
export type Natureza = (typeof NATUREZAS)[number];

export const NATUREZA_LABEL: Record<Natureza, string> = {
  acerto_mensal: "Acerto Mensal",
  adiantamento: "Adiantamento",
  diaria: "Diária / Extra",
  teste_operacional: "Teste Operacional Remunerado",
  rescisao: "Rescisão / Quitação Rescisória",
  outros: "Outros Pagamentos",
};

/** Tipo do acervo que cada natureza ocupa (resolve a pendência do mês). */
export const NATUREZA_TIPO_DOC: Record<Natureza, string> = {
  acerto_mensal: "contracheque",
  adiantamento: "adiantamento",
  diaria: "outros_pagamentos",
  teste_operacional: "outros_pagamentos",
  rescisao: "acerto_rescisorio",
  outros: "outros_pagamentos",
};

const MARINHO = rgb(MARCA_MARINHO[0], MARCA_MARINHO[1], MARCA_MARINHO[2]);
const LARANJA = rgb(MARCA_LARANJA[0], MARCA_LARANJA[1], MARCA_LARANJA[2]);
const CINZA = rgb(0.25, 0.25, 0.25);
const CLARO = rgb(0.42, 0.42, 0.42);

export function limpar(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\xFF\n]/g, "");
}

function linhas(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const palavras = limpar(texto).split(/\s+/).filter(Boolean);
  const saida: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(teste, tamanho) <= largura) atual = teste;
    else {
      if (atual) saida.push(atual);
      atual = p;
    }
  }
  if (atual) saida.push(atual);
  return saida.length ? saida : [""];
}

export function dataBR(valor?: string | null): string {
  const v = String(valor ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "—";
  return v.split("-").reverse().join("/");
}

export function competenciaBR(valor?: string | null): string {
  const v = String(valor ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(v)) return "—";
  return `${v.slice(5, 7)}/${v.slice(0, 4)}`;
}

export function cpfFormatado(cpf?: string | null): string {
  const d = String(cpf ?? "").replace(/\D+/g, "");
  if (d.length !== 11) return String(cpf ?? "—") || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function cnpjFormatado(cnpj?: string | null): string {
  const d = String(cnpj ?? "").replace(/\D+/g, "");
  if (d.length !== 14) return String(cnpj ?? "—") || "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export type ReciboPdf = {
  empresa: string;
  empresaCnpj: string;
  beneficiario: string;
  beneficiarioCpf: string;
  natureza: Natureza;
  descricao: string | null;
  competencia: string; // AAAA-MM-DD
  pagoEm: string; // AAAA-MM-DD
  valorCents: number;
  modalidade: string;
  valorBancarioCents: number | null;
  valorEspecieCents: number | null;
  codigo: string;
  emitidoEm: string;
  assinatura?: { em: string; ip: string; canal: string } | null;
  /** PNG (data URL) da assinatura desenhada ou cursiva. */
  assinaturaImagem?: string | null;
  /** Canal escolhido na emissão; "fisico" gera 2 vias na mesma folha. */
  canal?: string | null;
  /** Via limpa pedida pelo gestor: omite código e data de emissão. */
  manual?: boolean;
};

export async function montarReciboPdf(r: ReciboPdf): Promise<Uint8Array> {
  if (r.canal === "fisico" && !r.assinatura) return await montarDuasVias(r);
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margem = 48;
  const largura = width - margem * 2;

  const alturaLogo = 30;
  const baseLogo = height - 40 - alturaLogo;
  try {
    const bruto = atob(MARCA_PNG_BASE64);
    const bytes = new Uint8Array(bruto.length);
    for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
    const img = await pdf.embedPng(bytes);
    const escala = alturaLogo / img.height;
    page.drawImage(img, { x: margem, y: baseLogo, width: img.width * escala, height: alturaLogo });
  } catch {
    page.drawText("AVETO 360", { x: margem, y: baseLogo + 8, size: 17, font: negrito, color: MARINHO });
  }
  const origem = "Plataforma AVETO 360";
  page.drawText(origem, {
    x: width - margem - negrito.widthOfTextAtSize(origem, 9),
    y: baseLogo + alturaLogo - 11, size: 9, font: negrito, color: MARINHO,
  });
  const sub = limpar(r.empresa).slice(0, 60);
  if (sub) {
    page.drawText(sub, {
      x: width - margem - fonte.widthOfTextAtSize(sub, 8),
      y: baseLogo + 1, size: 8, font: fonte, color: rgb(0.42, 0.45, 0.52),
    });
  }
  const linhaMarca = baseLogo - 14;
  page.drawRectangle({ x: margem, y: linhaMarca, width: largura, height: 2, color: LARANJA });
  page.drawText(limpar(`Recibo de Pagamento — ${NATUREZA_LABEL[r.natureza]}`), {
    x: margem, y: linhaMarca - 22, size: 13.5, font: negrito, color: MARINHO,
  });
  let y = linhaMarca - 56;

  const valor = centsParaBRL(r.valorCents);
  const extenso = valorPorExtenso(r.valorCents);
  page.drawRectangle({ x: margem, y: y - 34, width: largura, height: 44, color: rgb(0.96, 0.97, 0.99) });
  page.drawText("VALOR RECEBIDO", { x: margem + 12, y: y - 2, size: 7.5, font: negrito, color: CLARO });
  page.drawText(limpar(valor), { x: margem + 12, y: y - 26, size: 20, font: negrito, color: MARINHO });
  y -= 56;

  const campos: Array<[string, string]> = [
    ["Pagador", `${r.empresa} — CNPJ ${r.empresaCnpj}`],
    ["Recebedor", `${r.beneficiario} — CPF ${r.beneficiarioCpf}`],
    ["Natureza", NATUREZA_LABEL[r.natureza]],
    ["Competência", competenciaBR(r.competencia)],
    ["Data do pagamento", dataBR(r.pagoEm)],
    ["Forma de pagamento", modalidadeLabel(r.modalidade)],
  ];
  if (r.modalidade === "misto") {
    campos.push(["Parcela em conta (Pix/Transferência)", centsParaBRL(r.valorBancarioCents)]);
    campos.push(["Parcela em dinheiro", centsParaBRL(r.valorEspecieCents)]);
  }
  if (r.descricao) campos.push(["Descrição", r.descricao]);
  campos.push(["Valor por extenso", extenso]);

  for (const [rotulo, texto] of campos) {
    page.drawText(limpar(rotulo).toUpperCase(), { x: margem, y, size: 7.5, font: negrito, color: CLARO });
    y -= 12;
    for (const l of linhas(texto || "—", fonte, 10.5, largura)) {
      page.drawText(l, { x: margem, y, size: 10.5, font: fonte, color: rgb(0.07, 0.07, 0.07) });
      y -= 13;
    }
    y -= 6;
  }

  y -= 6;
  const vinculo = r.natureza === "teste_operacional"
    ? " O pagamento refere-se exclusivamente ao teste prático realizado e não constitui vínculo de emprego."
    : "";
  const declaracao =
    `Declaro ter recebido do pagador acima identificado a quantia de ${valor} (${extenso}), ` +
    `referente a ${NATUREZA_LABEL[r.natureza].toLowerCase()} da competência ${competenciaBR(r.competencia)}, ` +
    `paga em ${dataBR(r.pagoEm)}, dando plena e geral quitação do valor aqui discriminado ` +
    `(Código Civil, arts. 319 e 320).${vinculo} Este recibo pode ser assinado eletronicamente, com registro ` +
    "de data, hora, endereço de internet e dispositivo, ou de forma manuscrita no documento impresso.";
  for (const l of linhas(declaracao, fonte, 10, largura)) {
    page.drawText(l, { x: margem, y, size: 10, font: fonte, color: CINZA });
    y -= 13.5;
  }

  y -= 56;
  const imgAss = r.assinatura ? await embutirAssinatura(pdf, r.assinaturaImagem) : null;
  if (imgAss) desenharAssinatura(page, imgAss, margem + 4, y + 2, 240, 46);
  page.drawLine({ start: { x: margem, y }, end: { x: margem + 260, y }, thickness: 0.8, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(limpar(r.beneficiario), { x: margem, y: y - 13, size: 9.5, font: negrito, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`CPF ${limpar(r.beneficiarioCpf)}`, { x: margem, y: y - 25, size: 8.5, font: fonte, color: CLARO });
  page.drawText("Assinatura do recebedor", { x: margem, y: y - 38, size: 8.5, font: fonte, color: CLARO });

  if (r.assinatura) {
    y -= 64;
    const txt = `Assinado eletronicamente em ${r.assinatura.em} via ${r.assinatura.canal} · IP ${r.assinatura.ip}`;
    for (const l of linhas(txt, negrito, 9, largura)) {
      page.drawText(l, { x: margem, y, size: 9, font: negrito, color: MARINHO });
      y -= 12;
    }
  }

  page.drawRectangle({ x: margem, y: 38.4, width: 54, height: 1.6, color: LARANJA });
  page.drawText(limpar(`${r.empresa} · ${r.beneficiario} · Código ${r.codigo}`).slice(0, 130), {
    x: margem, y: 26, size: 6.5, font: fonte, color: CLARO,
  });
  page.drawText(limpar(`Emitido em ${r.emitidoEm}`), { x: margem, y: 16, size: 6.5, font: fonte, color: CLARO });
  page.drawText(limpar(MARCA_ASSINATURA), { x: margem, y: 6, size: 6.5, font: fonte, color: MARINHO });
  if (imgAss) rubricarPaginas(pdf, imgAss, fonte, 44);

  return await pdf.save();
}

/**
 * Assinatura à mão: duas vias compactas na mesma A4 (empregador em cima,
 * empregado embaixo) separadas por linha de corte.
 */
async function montarDuasVias(r: ReciboPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margem = 40;
  const largura = width - margem * 2;
  const meio = height / 2;
  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  try {
    const bruto = atob(MARCA_PNG_BASE64);
    const bytes = new Uint8Array(bruto.length);
    for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
    logo = await pdf.embedPng(bytes);
  } catch { logo = null; }

  const valor = centsParaBRL(r.valorCents);
  const extenso = valorPorExtenso(r.valorCents);
  const campos: Array<[string, string]> = [
    ["Pagador", `${r.empresa} — CNPJ ${r.empresaCnpj}`],
    ["Recebedor", `${r.beneficiario} — CPF ${r.beneficiarioCpf}`],
    ["Natureza", NATUREZA_LABEL[r.natureza]],
    ["Competência", competenciaBR(r.competencia)],
    ["Data do pagamento", dataBR(r.pagoEm)],
    ["Forma de pagamento", modalidadeLabel(r.modalidade)],
  ];
  if (r.modalidade === "misto") {
    campos.push(["Em conta (Pix/Transf.)", centsParaBRL(r.valorBancarioCents)]);
    campos.push(["Em dinheiro", centsParaBRL(r.valorEspecieCents)]);
  }
  const vinculo = r.natureza === "teste_operacional"
    ? " O pagamento refere-se exclusivamente ao teste prático realizado e não constitui vínculo de emprego."
    : "";
  const declaracao =
    `Declaro ter recebido do pagador acima a quantia de ${valor} (${extenso}), referente a ` +
    `${NATUREZA_LABEL[r.natureza].toLowerCase()} da competência ${competenciaBR(r.competencia)}, paga em ` +
    `${dataBR(r.pagoEm)}, dando plena e geral quitação do valor discriminado (Código Civil, arts. 319 e 320).${vinculo}`;

  const via = (topo: number, rotulo: string) => {
    const alturaLogo = 22;
    const baseLogo = topo - 28 - alturaLogo;
    if (logo) {
      const esc = alturaLogo / logo.height;
      page.drawImage(logo, { x: margem, y: baseLogo, width: logo.width * esc, height: alturaLogo });
    } else page.drawText("AVETO 360", { x: margem, y: baseLogo + 6, size: 14, font: negrito, color: MARINHO });
    const rv = limpar(rotulo).toUpperCase();
    page.drawText(rv, { x: width - margem - negrito.widthOfTextAtSize(rv, 8.5), y: baseLogo + alturaLogo - 9, size: 8.5, font: negrito, color: LARANJA });
    const sub = limpar(r.empresa).slice(0, 60);
    page.drawText(sub, { x: width - margem - fonte.widthOfTextAtSize(sub, 7.5), y: baseLogo + 1, size: 7.5, font: fonte, color: CLARO });
    let y = baseLogo - 10;
    page.drawRectangle({ x: margem, y, width: largura, height: 1.6, color: LARANJA });
    y -= 17;
    page.drawText(limpar(`Recibo de Pagamento — ${NATUREZA_LABEL[r.natureza]}`), { x: margem, y, size: 11.5, font: negrito, color: MARINHO });
    const vt = limpar(valor);
    page.drawText(vt, { x: width - margem - negrito.widthOfTextAtSize(vt, 15), y: y - 2, size: 15, font: negrito, color: MARINHO });
    y -= 20;

    // Grade em 2 colunas
    const colW = (largura - 16) / 2;
    for (let i = 0; i < campos.length; i += 2) {
      let menor = y;
      for (let j = 0; j < 2 && i + j < campos.length; j++) {
        const [rot, txt] = campos[i + j];
        const x = margem + j * (colW + 16);
        let yy = y;
        page.drawText(limpar(rot).toUpperCase(), { x, y: yy, size: 6.5, font: negrito, color: CLARO });
        yy -= 10;
        for (const l of linhas(txt || "—", fonte, 8.5, colW).slice(0, 2)) {
          page.drawText(l, { x, y: yy, size: 8.5, font: fonte, color: rgb(0.07, 0.07, 0.07) });
          yy -= 10.5;
        }
        menor = Math.min(menor, yy);
      }
      y = menor - 4;
    }
    if (r.descricao) {
      page.drawText("DESCRIÇÃO", { x: margem, y, size: 6.5, font: negrito, color: CLARO });
      y -= 10;
      for (const l of linhas(r.descricao, fonte, 8.5, largura).slice(0, 2)) {
        page.drawText(l, { x: margem, y, size: 8.5, font: fonte, color: rgb(0.07, 0.07, 0.07) });
        y -= 10.5;
      }
      y -= 4;
    }
    y -= 2;
    for (const l of linhas(declaracao, fonte, 8.5, largura)) {
      page.drawText(l, { x: margem, y, size: 8.5, font: fonte, color: CINZA });
      y -= 11;
    }
    // Local e data em branco + assinaturas lado a lado (Pagador e Recebedor)
    const baseAss = topo - meio + 58;
    const ya = Math.max(baseAss, y - 50);
    const local = "Local e data: ____________________, ___/___/_____";
    page.drawText(local, { x: margem, y: ya + 30, size: 8, font: fonte, color: CINZA });
    const colA = (largura - 30) / 2;
    const bloco = (x: number, nome: string, doc: string, papel: string) => {
      page.drawLine({ start: { x, y: ya }, end: { x: x + colA, y: ya }, thickness: 0.8, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(limpar(nome).slice(0, 45), { x, y: ya - 11, size: 8.5, font: negrito, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(limpar(`${doc} · ${papel}`).slice(0, 70), { x, y: ya - 21, size: 7.5, font: fonte, color: CLARO });
    };
    bloco(margem, r.empresa, `CNPJ ${r.empresaCnpj}`, "Assinatura do pagador");
    bloco(margem + colA + 30, r.beneficiario, `CPF ${r.beneficiarioCpf}`, "Assinatura do recebedor");
    // Via física: sem código nem data/hora de emissão do sistema.
  };

  via(height, "1ª Via — Empregador");
  // Linha de corte
  for (let x = margem - 20; x < width - margem + 20; x += 8) {
    page.drawLine({ start: { x, y: meio }, end: { x: x + 4, y: meio }, thickness: 0.6, color: CLARO });
  }
  const corte = "corte aqui";
  page.drawText(corte, { x: (width - fonte.widthOfTextAtSize(corte, 6)) / 2, y: meio + 3, size: 6, font: fonte, color: CLARO });
  via(meio, "2ª Via — Empregado(a)");
  return await pdf.save();
}

/** Monta os dados do PDF a partir da linha de dp_recibos + empresa. */
export function reciboDaLinha(
  row: Record<string, unknown>,
  empresa: { name?: string | null; trade_name?: string | null; cnpj?: string | null } | null,
  assinaturaImagem?: string | null,
): ReciboPdf {
  const assinadoEm = row.assinado_em
    ? new Date(String(row.assinado_em)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;
  return {
    empresa: String(empresa?.name ?? empresa?.trade_name ?? ""),
    empresaCnpj: cnpjFormatado(empresa?.cnpj ?? null),
    beneficiario: String(row.beneficiario_nome ?? ""),
    beneficiarioCpf: cpfFormatado(row.beneficiario_cpf as string | null),
    natureza: row.natureza as Natureza,
    descricao: (row.descricao as string | null) ?? null,
    competencia: String(row.competencia ?? ""),
    pagoEm: String(row.pago_em ?? ""),
    valorCents: Number(row.valor_cents ?? 0),
    modalidade: String(row.modalidade ?? ""),
    valorBancarioCents: (row.valor_bancario_cents as number | null) ?? null,
    valorEspecieCents: (row.valor_especie_cents as number | null) ?? null,
    codigo: String(row.id ?? "").slice(0, 8).toUpperCase(),
    emitidoEm: new Date(String(row.created_at ?? new Date().toISOString())).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    }),
    canal: (row.canal_assinatura as string | null) ?? null,
    assinaturaImagem: (row.assinatura_imagem as string | null) ?? assinaturaImagem ?? null,
    assinatura: assinadoEm
      ? {
        em: assinadoEm,
        ip: String(row.assinado_ip ?? "—"),
        canal: row.canal_assinatura === "whatsapp" ? "link (WhatsApp)" : "portal do colaborador",
      }
      : null,
  };
}

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D+/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function gerarToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
