/**
 * Atas de Reunião: geração do PDF (texto formatado + anexos + lista de
 * participantes) e envio individual para cada participante pelo fluxo
 * oficial de documentos (assinatura no portal com hash e certificado).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { registrarDocumento } from "@/lib/dp/documentos-oficial";
import { salvarAviso } from "@/lib/dp/regras-oficial";

export type AtaModalidade = "presente" | "ciencia" | "consulta";

export const MODALIDADES: Record<AtaModalidade, { label: string; descricao: string; exigeAceite: boolean }> = {
  presente: { label: "Presente — Assina", descricao: "Participou da reunião e assina a ata.", exigeAceite: true },
  ciencia: { label: "Ausente — Assina Ciência", descricao: "Não participou, mas assina a ciência da pauta.", exigeAceite: true },
  consulta: { label: "Apenas Consulta", descricao: "Recebe a ata no portal sem precisar assinar.", exigeAceite: false },
};

export type AtaCondutor = { colaborador_id?: string | null; nome: string; cargo?: string | null };

/** Esqueleto usado quando a ata nova abre sem modelo escolhido. */
export const ESTRUTURA_PADRAO_ATA = "<h2>Pauta da Reunião</h2><ol><li></li></ol><h2>Discussões e Alinhamentos</h2><p></p><h2>Decisões e Combinados</h2><ul><li></li></ul><h2>Próximos Passos e Responsáveis</h2><ul><li></li></ul>";

export type AtaAnexo = { path: string; name: string; mime: string; size: number };

export const MODELOS_ATA: { id: string; nome: string; titulo: string; html: string }[] = [
  {
    id: "alinhamento",
    nome: "Alinhamento Semanal",
    titulo: "Reunião de Alinhamento Semanal",
    html: "<h2>Pauta</h2><ol><li>Resultados da semana</li><li>Pontos de melhoria no atendimento</li><li>Escala e folgas da próxima semana</li></ol><h2>Discussões</h2><p></p><h2>Decisões e Combinados</h2><ul><li></li></ul><h2>Responsáveis e Prazos</h2><ul><li></li></ul>",
  },
  {
    id: "treinamento",
    nome: "Treinamento Operacional",
    titulo: "Treinamento Operacional",
    html: "<h2>Tema do Treinamento</h2><p></p><h2>Conteúdo Apresentado</h2><ul><li>Procedimentos de abertura e fechamento</li><li>Padrão de montagem e apresentação dos pratos</li><li>Uso correto dos equipamentos</li></ul><h2>Orientações aos Colaboradores</h2><p></p><h2>Observações</h2><p></p>",
  },
  {
    id: "boas-praticas",
    nome: "Boas Práticas e Higiene",
    titulo: "Reunião de Boas Práticas e Higiene",
    html: "<h2>Pauta</h2><ol><li>Higienização de mãos, utensílios e superfícies</li><li>Uso de uniforme, touca e EPIs</li><li>Armazenamento, etiquetagem e validade dos alimentos</li><li>Controle de temperatura</li></ol><h2>Não Conformidades Identificadas</h2><p></p><h2>Ações Corretivas</h2><ul><li></li></ul>",
  },
  {
    id: "metas",
    nome: "Metas e Resultados",
    titulo: "Reunião de Metas e Resultados",
    html: "<h2>Resultados do Período</h2><p></p><h2>Metas Definidas</h2><ul><li></li></ul><h2>Plano de Ação</h2><ul><li></li></ul>",
  },
];

// ── HTML → blocos simples ────────────────────────────────────────────────
type Run = { text: string; b?: boolean; i?: boolean; u?: boolean };
type Bloco = { kind: "h1" | "h2" | "h3" | "p" | "li"; prefixo?: string; runs: Run[]; align?: string; quote?: boolean };

function coletarRuns(node: Node, est: { b?: boolean; i?: boolean; u?: boolean }, out: Run[]) {
  node.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) { if (c.textContent) out.push({ text: c.textContent, ...est }); return; }
    if (!(c instanceof HTMLElement)) return;
    const t = c.tagName.toLowerCase();
    if (t === "br") { out.push({ text: "\n" }); return; }
    if (t === "ul" || t === "ol") return;
    coletarRuns(c, { b: est.b || t === "strong" || t === "b", i: est.i || t === "em" || t === "i", u: est.u || t === "u" }, out);
  });
}

export function htmlParaBlocos(html: string): Bloco[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const blocos: Bloco[] = [];
  const andar = (el: Element, quote = false) => {
    Array.from(el.children).forEach((c) => {
      const t = c.tagName.toLowerCase();
      const align = (c as HTMLElement).style?.textAlign || undefined;
      if (t === "ul" || t === "ol") {
        Array.from(c.children).forEach((li, idx) => {
          const runs: Run[] = []; coletarRuns(li, {}, runs);
          blocos.push({ kind: "li", prefixo: t === "ol" ? `${idx + 1}.` : "•", runs, quote });
          li.querySelectorAll(":scope > ul, :scope > ol").forEach((sub) => andar({ children: [sub] } as never, quote));
        });
      } else if (t === "blockquote") andar(c, true);
      else {
        const runs: Run[] = []; coletarRuns(c, {}, runs);
        const kind = (["h1", "h2", "h3"].includes(t) ? t : "p") as Bloco["kind"];
        blocos.push({ kind, runs, align, quote });
      }
    });
  };
  andar(doc.body.firstElementChild!);
  return blocos;
}

export function htmlTemTexto(html: string) {
  return (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").trim().length > 0;
}

// pdf-lib (WinAnsi) não desenha alguns caracteres; troca por equivalentes.
const limpar = (s: string) =>
  s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...")
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF•]/g, "");

type Fontes = { r: PDFFont; b: PDFFont; i: PDFFont; bi: PDFFont };
const AZUL = rgb(0.06, 0.1, 0.24);

class Escritor {
  page!: PDFPage; y = 0;
  readonly M = 56; readonly W = 595 - 112;
  constructor(public pdf: PDFDocument, public f: Fontes) { this.nova(); }
  nova() { this.page = this.pdf.addPage([595, 842]); this.y = 842 - this.M; }
  garantir(h: number) { if (this.y - h < this.M + 10) this.nova(); }
  fonte(r: Run) { return r.b && r.i ? this.f.bi : r.b ? this.f.b : r.i ? this.f.i : this.f.r; }
  bloco(runs: Run[], size: number, opts: { indent?: number; prefixo?: string; align?: string; bold?: boolean } = {}) {
    const x0 = this.M + (opts.indent ?? 0);
    const largura = this.W - (opts.indent ?? 0);
    const lh = size * 1.45;
    // quebra em palavras preservando estilo
    const palavras: { t: string; r: Run; quebra?: boolean }[] = [];
    runs.forEach((r) => {
      const rr = opts.bold ? { ...r, b: true } : r;
      limpar(r.text).split(/(\n| +)/).forEach((p) => {
        if (p === "\n") palavras.push({ t: "", r: rr, quebra: true });
        else if (p) palavras.push({ t: p, r: rr });
      });
    });
    const linhas: { t: string; r: Run }[][] = [[]]; let w = 0;
    palavras.forEach((p) => {
      if (p.quebra) { linhas.push([]); w = 0; return; }
      const pw = this.fonte(p.r).widthOfTextAtSize(p.t, size);
      if (w + pw > largura && w > 0 && p.t.trim()) { linhas.push([]); w = 0; }
      if (w === 0 && !p.t.trim()) return;
      linhas[linhas.length - 1].push(p); w += pw;
    });
    linhas.forEach((ln, idx) => {
      this.garantir(lh);
      const total = ln.reduce((s, p) => s + this.fonte(p.r).widthOfTextAtSize(p.t, size), 0);
      let x = opts.align === "center" ? x0 + (largura - total) / 2 : opts.align === "right" ? x0 + largura - total : x0;
      if (idx === 0 && opts.prefixo) this.page.drawText(opts.prefixo, { x: x0 - 14, y: this.y, size, font: this.f.r, color: AZUL });
      ln.forEach((p) => {
        const fo = this.fonte(p.r); const pw = fo.widthOfTextAtSize(p.t, size);
        this.page.drawText(p.t, { x, y: this.y, size, font: fo, color: AZUL });
        if (p.r.u) this.page.drawLine({ start: { x, y: this.y - 1.5 }, end: { x: x + pw, y: this.y - 1.5 }, thickness: 0.6, color: AZUL });
        x += pw;
      });
      this.y -= lh;
    });
  }
  espaco(h: number) { this.y -= h; }
}

export async function gerarPdfAta(input: {
  empresa: string; unidade?: string | null; titulo: string; dataReuniao: string; local?: string | null;
  html: string; condutores?: AtaCondutor[]; participantes: { nome: string; modalidade: AtaModalidade; avulso?: boolean }[]; anexos: { name: string; mime: string; bytes: ArrayBuffer }[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f: Fontes = {
    r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold),
    i: await pdf.embedFont(StandardFonts.HelveticaOblique), bi: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const e = new Escritor(pdf, f);
  e.bloco([{ text: "ATA DE REUNIÃO" }], 9, { bold: true });
  e.bloco([{ text: input.titulo }], 16, { bold: true });
  const data = input.dataReuniao.split("-").reverse().join("/");
  e.bloco([{ text: `${input.empresa}${input.unidade ? ` — ${input.unidade}` : ""}` }], 10);
  e.bloco([{ text: `Data: ${data}${input.local ? `   •   Local: ${input.local}` : ""}` }], 10);
  if (input.condutores?.length) {
    e.bloco([{ text: `Conduzida por: ${input.condutores.map((c) => `${c.nome.toUpperCase()}${c.cargo ? ` (${c.cargo})` : ""}`).join("; ")}` }], 10, { bold: true });
  }
  e.espaco(8);
  e.page.drawLine({ start: { x: e.M, y: e.y + 6 }, end: { x: e.M + e.W, y: e.y + 6 }, thickness: 0.8, color: rgb(0.92, 0.38, 0.1) });
  e.espaco(8);
  for (const b of htmlParaBlocos(input.html)) {
    if (!b.runs.some((r) => r.text.trim())) { e.espaco(6); continue; }
    if (b.kind === "h1") { e.espaco(6); e.bloco(b.runs, 15, { bold: true, align: b.align }); }
    else if (b.kind === "h2") { e.espaco(6); e.bloco(b.runs, 13, { bold: true, align: b.align }); }
    else if (b.kind === "h3") { e.espaco(4); e.bloco(b.runs, 11.5, { bold: true, align: b.align }); }
    else if (b.kind === "li") e.bloco(b.runs, 10.5, { indent: (b.quote ? 16 : 0) + 18, prefixo: b.prefixo });
    else e.bloco(b.runs, 10.5, { indent: b.quote ? 16 : 0, align: b.align });
    e.espaco(3);
  }
  // Participantes
  e.espaco(12);
  e.bloco([{ text: "Participantes e Destinatários" }], 13, { bold: true });
  e.espaco(2);
  for (const p of input.participantes) {
    e.bloco([{ text: p.nome.toUpperCase(), b: true }, { text: `  —  ${MODALIDADES[p.modalidade].label}${p.avulso ? " (sem cadastro)" : ""}` }], 10, { indent: 18, prefixo: "•" });
  }
  const avulsos = input.participantes.filter((p) => p.avulso && MODALIDADES[p.modalidade].exigeAceite);
  if (avulsos.length) {
    e.espaco(10);
    e.bloco([{ text: "Assinaturas de Participantes Sem Cadastro" }], 11.5, { bold: true });
    for (const p of avulsos) {
      e.espaco(22); e.garantir(30);
      e.page.drawLine({ start: { x: e.M, y: e.y + 4 }, end: { x: e.M + 260, y: e.y + 4 }, thickness: 0.6, color: AZUL });
      e.bloco([{ text: p.nome.toUpperCase() }], 9);
    }
  }
  e.espaco(8);
  e.bloco([{ text: "As assinaturas eletrônicas são registradas individualmente no portal do colaborador, com data, hora e impressão digital (SHA-256) do documento, e estampadas na via assinada.", i: true }], 8.5);
  if (input.anexos.length) {
    e.espaco(8);
    e.bloco([{ text: "Anexos" }], 13, { bold: true });
    input.anexos.forEach((a, i) => e.bloco([{ text: `Anexo ${i + 1}: ${a.name}` }], 10, { indent: 18, prefixo: "•" }));
  }
  // Anexos incorporados ao próprio documento (protegidos pelo mesmo hash).
  for (const [i, a] of input.anexos.entries()) {
    if (a.mime === "application/pdf") {
      const src = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
      const pages = await pdf.copyPages(src, src.getPageIndices());
      pages.forEach((pg) => pdf.addPage(pg));
    } else {
      const img = a.mime === "image/png" ? await pdf.embedPng(a.bytes) : await pdf.embedJpg(a.bytes);
      const page = pdf.addPage([595, 842]);
      page.drawText(limpar(`Anexo ${i + 1}: ${a.name}`), { x: 56, y: 800, size: 10, font: f.b, color: AZUL });
      const esc = Math.min(483 / img.width, 720 / img.height, 1);
      const w = img.width * esc, h = img.height * esc;
      page.drawImage(img, { x: (595 - w) / 2, y: 780 - h, width: w, height: h });
    }
  }
  return pdf.save();
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Gera e envia a ata para cada participante ainda sem documento. Idempotente por participante. */
export async function enviarAta(ataId: string, onProgresso?: (feitos: number, total: number) => void) {
  const { data: ata, error } = await supabase.from("dp_atas" as never).select("*").eq("id", ataId).maybeSingle();
  if (error || !ata) throw new Error("Ata não encontrada. Atualize a página e tente novamente.");
  const a = ata as any;
  if (!htmlTemTexto(a.conteudo_html)) throw new Error("Escreva o conteúdo da ata antes de enviar.");
  const { data: parts } = await supabase.from("dp_ata_participantes" as never)
    .select("id, colaborador_id, modalidade, documento_id, avulso_nome, dp_colaboradores(nome)").eq("ata_id", ataId);
  const lista = ((parts ?? []) as any[]);
  if (!lista.length) throw new Error("Inclua ao menos um participante antes de enviar.");
  const [{ data: emp }, { data: uni }] = await Promise.all([
    supabase.from("companies").select("name, trade_name").eq("id", a.company_id).maybeSingle(),
    a.unidade_id ? supabase.from("dp_unidades").select("nome").eq("id", a.unidade_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const anexos: { name: string; mime: string; bytes: ArrayBuffer }[] = [];
  for (const an of (a.anexos ?? []) as AtaAnexo[]) {
    const d = await supabase.storage.from("dp-documentos").download(an.path);
    if (d.error || !d.data) throw new Error(`Não foi possível ler o anexo "${an.name}". Remova-o e anexe novamente.`);
    anexos.push({ name: an.name, mime: an.mime, bytes: await d.data.arrayBuffer() });
  }
  const bytes = await gerarPdfAta({
    empresa: ((emp as any)?.name || (emp as any)?.trade_name || "Empresa").toUpperCase(),
    unidade: (uni as any)?.nome ?? null, titulo: a.titulo, dataReuniao: a.data_reuniao, local: a.local,
    html: a.conteudo_html, anexos, condutores: (a.condutores ?? []) as AtaCondutor[],
    participantes: lista.map((p) => ({ nome: p.dp_colaboradores?.nome ?? p.avulso_nome ?? "Participante", modalidade: p.modalidade, avulso: !p.colaborador_id })),
  });
  const pendentes = lista.filter((p) => !p.documento_id && p.colaborador_id);
  let feitos = 0;
  for (const p of pendentes) {
    const nomeArquivo = `ata-${slug(a.titulo)}-${slug(p.dp_colaboradores?.nome ?? "colaborador")}.pdf`;
    const path = `${a.company_id}/${p.colaborador_id}/${Date.now()}-${nomeArquivo}`;
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const up = await supabase.storage.from("dp-documentos").upload(path, blob, { contentType: "application/pdf", upsert: false });
    if (up.error) throw new Error("Não foi possível guardar o arquivo da ata. Tente novamente — quem já recebeu não receberá de novo.");
    const mod = MODALIDADES[p.modalidade as AtaModalidade];
    const docId = await registrarDocumento({
      company_id: a.company_id, colaborador_id: p.colaborador_id, tipo: "ata_reuniao", titulo: `Ata — ${a.titulo}`,
      descricao: `Reunião de ${String(a.data_reuniao).split("-").reverse().join("/")}. ${mod.descricao}`,
      file_path: path, file_name: nomeArquivo, file_size: blob.size, mime_type: "application/pdf",
      referencia_data: a.data_reuniao, exige_aceite: mod.exigeAceite,
    } as never);
    await supabase.from("dp_ata_participantes" as never).update({ documento_id: docId } as never).eq("id", p.id);
    feitos++; onProgresso?.(feitos, pendentes.length);
  }
  if (a.publicar_mural && a.status !== "enviada") {
    const texto = (new DOMParser().parseFromString(a.conteudo_html, "text/html").body.textContent ?? "").replace(/\s+/g, " ").trim();
    try {
      await salvarAviso(a.company_id, { titulo: `Ata — ${a.titulo}`, conteudo: texto.slice(0, 4000), escopo: a.unidade_id ? "unidade" : "todos", unidade_id: a.unidade_id ?? null } as never);
    } catch { /* a ata segue enviada; o gestor pode publicar no Mural manualmente */ }
  }
  const { data: u } = await supabase.auth.getUser();
  // Marca como enviada (a política só permite alterar rascunhos; já enviada fica como está).
  await supabase.from("dp_atas" as never).update({ status: "enviada", enviada_em: new Date().toISOString(), enviada_por: u.user?.id ?? null } as never).eq("id", ataId);
  return feitos;
}
