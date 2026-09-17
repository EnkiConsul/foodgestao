/**
 * Certificado de validação digital em PDF único.
 *
 * Monta, no servidor: (1) a página do certificado com os dados da aprovação
 * eletrônica, (2) o documento que foi assinado, página por página, e (3) o
 * comprovante de pagamento como anexo, quando existir — mesmo sem validação
 * digital própria. Todas as páginas recebem o rodapé de lastro.
 *
 * A permissão vem da mesma regra das telas (`dp_documento_arquivo`, chamada no
 * contexto de quem pediu): nenhum caminho de Storage é montado pelo cliente e
 * nada é gerado sem aceite registrado. Fail closed.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3";
import { callerClient, requireUser, serviceClient } from "../_shared/authz.ts";
import { recordEdgeError } from "../_shared/error-log.ts";

const BUCKET = "dp-documentos";
const FUNCAO = "dp-documento-certificado";

const Body = z.object({ documento_id: z.string().uuid() });

function erro(status: number, mensagem: string): Response {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dataHora(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });
}

/** pdf-lib (WinAnsi) não aceita alguns caracteres: normaliza o texto. */
function limpar(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\xFF\n]/g, "");
}

/** Quebra o texto em linhas que caibam na largura, inclusive palavras longas. */
function linhas(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const partir = (palavra: string): string[] => {
    if (fonte.widthOfTextAtSize(palavra, tamanho) <= largura) return [palavra];
    const pedacos: string[] = [];
    let atual = "";
    for (const ch of palavra) {
      if (fonte.widthOfTextAtSize(atual + ch, tamanho) > largura && atual) {
        pedacos.push(atual);
        atual = ch;
      } else {
        atual += ch;
      }
    }
    if (atual) pedacos.push(atual);
    return pedacos;
  };

  const saida: string[] = [];
  let atual = "";
  for (const palavra of limpar(texto).split(/\s+/).filter(Boolean)) {
    for (const p of partir(palavra)) {
      const teste = atual ? `${atual} ${p}` : p;
      if (fonte.widthOfTextAtSize(teste, tamanho) > largura && atual) {
        saida.push(atual);
        atual = p;
      } else {
        atual = teste;
      }
    }
  }
  if (atual) saida.push(atual);
  return saida;
}

type Dados = {
  empresa: string;
  colaborador: string;
  documentoTitulo: string;
  documentoTipo: string;
  competencia: string;
  arquivo: string;
  aceitoEm: string;
  aprovadoPor: string;
  ip: string;
  dispositivo: string;
  conteudoHash: string;
  registroId: string;
  avisos: string[];
};

const A4: [number, number] = [595.28, 841.89];

function paginaCertificado(pdf: PDFDocument, fonte: PDFFont, negrito: PDFFont, d: Dados): void {
  const page = pdf.addPage(A4);
  const { width, height } = page.getSize();
  const margem = 48;
  const largura = width - margem * 2;
  let y = height - margem;

  page.drawText("Certificado de Validação de Documento", {
    x: margem, y: y - 8, size: 17, font: negrito, color: rgb(0.06, 0.11, 0.24),
  });
  y -= 28;
  page.drawText(limpar(d.empresa), { x: margem, y, size: 11, font: fonte, color: rgb(0.35, 0.35, 0.35) });
  y -= 10;
  page.drawLine({
    start: { x: margem, y }, end: { x: margem + largura, y },
    thickness: 2, color: rgb(0.92, 0.38, 0.1),
  });
  y -= 26;

  const campos: Array<[string, string]> = [
    ["Colaborador", d.colaborador],
    ["Documento", d.documentoTitulo],
    ["Tipo", d.documentoTipo],
    ["Competência", d.competencia],
    ["Data e hora da aprovação", dataHora(d.aceitoEm)],
    ["Aprovado por", d.aprovadoPor],
    ["Endereço IP", d.ip],
    ["Arquivo", d.arquivo],
    ["Dispositivo / navegador", d.dispositivo],
    ["Código do registro", d.registroId],
    ["Impressão digital do conteúdo", d.conteudoHash],
  ];

  for (const [rotulo, valor] of campos) {
    page.drawText(limpar(rotulo).toUpperCase(), {
      x: margem, y, size: 7.5, font: negrito, color: rgb(0.42, 0.42, 0.42),
    });
    y -= 12;
    for (const linha of linhas(valor || "—", fonte, 10.5, largura)) {
      page.drawText(linha, { x: margem, y, size: 10.5, font: fonte, color: rgb(0.07, 0.07, 0.07) });
      y -= 13;
    }
    y -= 6;
  }

  y -= 8;
  const texto =
    "Este certificado comprova que o colaborador acima acessou e aprovou eletronicamente o documento " +
    "identificado, declarando ter conferido e concordado com o seu conteúdo. A aprovação foi registrada pelo " +
    "sistema com data, hora, endereço de internet e identificação do dispositivo utilizado, além da impressão " +
    "digital do conteúdo aprovado, que permite verificar que o arquivo não foi alterado depois. As páginas " +
    "seguintes reproduzem o documento assinado e, quando houver, o comprovante de pagamento anexado.";
  for (const linha of linhas(texto, fonte, 9.5, largura)) {
    page.drawText(linha, { x: margem, y, size: 9.5, font: fonte, color: rgb(0.25, 0.25, 0.25) });
    y -= 12.5;
  }

  for (const aviso of d.avisos) {
    y -= 8;
    for (const linha of linhas(aviso, fonte, 9.5, largura)) {
      page.drawText(linha, { x: margem, y, size: 9.5, font: negrito, color: rgb(0.6, 0.2, 0.05) });
      y -= 12.5;
    }
  }
}

/** Página separadora do anexo (comprovante sem validação digital própria). */
function paginaAnexo(pdf: PDFDocument, fonte: PDFFont, negrito: PDFFont, arquivo: string, pagoEm: string): void {
  const page = pdf.addPage(A4);
  const { width, height } = page.getSize();
  const margem = 48;
  let y = height - 120;
  page.drawText("Anexo — Comprovante de pagamento", {
    x: margem, y, size: 15, font: negrito, color: rgb(0.06, 0.11, 0.24),
  });
  y -= 24;
  for (
    const linha of linhas(
      `Arquivo: ${arquivo || "—"}. Pagamento registrado em ${pagoEm}. Este comprovante acompanha o documento ` +
        "aprovado como anexo e não possui validação digital própria.",
      fonte, 10.5, width - margem * 2,
    )
  ) {
    page.drawText(linha, { x: margem, y, size: 10.5, font: fonte, color: rgb(0.25, 0.25, 0.25) });
    y -= 14;
  }
}

/** Insere um arquivo (PDF ou imagem) como páginas do certificado. */
async function anexarArquivo(
  pdf: PDFDocument,
  bytes: Uint8Array,
  mime: string,
  nome: string,
): Promise<string | null> {
  const tipo = (mime || "").toLowerCase();
  const ehPdf = tipo.includes("pdf") || /\.pdf$/i.test(nome);
  if (ehPdf) {
    try {
      const origem = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const paginas = await pdf.copyPages(origem, origem.getPageIndices());
      for (const p of paginas) pdf.addPage(p);
      return null;
    } catch {
      return `Não foi possível reproduzir o arquivo "${nome}" neste certificado. O original continua guardado e disponível para download.`;
    }
  }
  try {
    const img = tipo.includes("png") || /\.png$/i.test(nome)
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
    const page = pdf.addPage(A4);
    const margem = 40;
    const maxL = page.getWidth() - margem * 2;
    const maxA = page.getHeight() - margem * 2 - 40;
    const escala = Math.min(maxL / img.width, maxA / img.height, 1);
    page.drawImage(img, {
      x: (page.getWidth() - img.width * escala) / 2,
      y: (page.getHeight() - 40 - img.height * escala) / 2 + 20,
      width: img.width * escala,
      height: img.height * escala,
    });
    return null;
  } catch {
    return `Não foi possível reproduzir o arquivo "${nome}" neste certificado. O original continua guardado e disponível para download.`;
  }
}

/** Rodapé de lastro em todas as páginas, no fim da montagem. */
function rodape(pdf: PDFDocument, fonte: PDFFont, d: Dados): void {
  const paginas = pdf.getPages();
  const total = paginas.length;
  const hash = d.conteudoHash ? d.conteudoHash.slice(0, 24) : "—";
  const linha1 = limpar(
    `${d.empresa} · ${d.colaborador} · ${d.documentoTitulo}`,
  );
  const linha2 = limpar(
    `Aprovado em ${dataHora(d.aceitoEm)} · Registro ${d.registroId} · Conteúdo ${hash}`,
  );
  paginas.forEach((page: PDFPage, i: number) => {
    const { width } = page.getSize();
    const margem = 24;
    page.drawRectangle({ x: 0, y: 0, width, height: 34, color: rgb(1, 1, 1), opacity: 0.85 });
    page.drawLine({
      start: { x: margem, y: 34 }, end: { x: width - margem, y: 34 },
      thickness: 0.5, color: rgb(0.75, 0.75, 0.75),
    });
    page.drawText(linha1.slice(0, 130), { x: margem, y: 22, size: 6.5, font: fonte, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(linha2.slice(0, 150), { x: margem, y: 12, size: 6.5, font: fonte, color: rgb(0.4, 0.4, 0.4) });
    const pag = `Página ${i + 1} de ${total}`;
    page.drawText(pag, {
      x: width - margem - fonte.widthOfTextAtSize(pag, 6.5),
      y: 12, size: 6.5, font: fonte, color: rgb(0.4, 0.4, 0.4),
    });
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return erro(405, "Método inválido.");

  let documentoId = "";
  try {
    const caller = await requireUser(req);
    if (!caller) return erro(401, "Sessão expirada. Entre novamente.");

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return erro(400, "Documento inválido.");
    documentoId = parsed.data.documento_id;

    // A permissão é a mesma das telas: a função roda no contexto de quem pediu.
    const cliente = callerClient(caller.token);
    const { data: arqDoc } = await cliente.rpc("dp_documento_arquivo", {
      _documento_id: documentoId,
      _variante: "documento",
    });
    const doc = (Array.isArray(arqDoc) ? arqDoc[0] : arqDoc) as
      | { file_path: string; file_name: string | null; mime_type: string | null }
      | null;
    if (!doc?.file_path) return erro(403, "Sem permissão para este documento.");

    const { data: arqComp } = await cliente.rpc("dp_documento_arquivo", {
      _documento_id: documentoId,
      _variante: "comprovante",
    });
    const comp = (Array.isArray(arqComp) ? arqComp[0] : arqComp) as
      | { file_path: string; file_name: string | null; mime_type: string | null }
      | null;

    const admin = serviceClient();
    const { data: registro } = await admin
      .from("dp_documentos")
      .select("id, company_id, colaborador_id, titulo, tipo, referencia_data, comprovante_pago_em, comprovante_file_name")
      .eq("id", documentoId)
      .maybeSingle();
    if (!registro) return erro(404, "Documento não encontrado.");

    const { data: aceite } = await admin
      .from("dp_documento_aceites")
      .select("id, aceito_em, aceito_por, ip, user_agent, conteudo_hash")
      .eq("documento_id", documentoId)
      .order("aceito_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!aceite) return erro(409, "Este documento ainda não foi aprovado pelo colaborador.");

    const [{ data: empresa }, { data: colab }] = await Promise.all([
      admin.from("companies").select("name, trade_name").eq("id", registro.company_id).maybeSingle(),
      admin.from("dp_colaboradores").select("nome, nome_social").eq("id", registro.colaborador_id).maybeSingle(),
    ]);

    const pdf = await PDFDocument.create();
    const fonte = await pdf.embedFont(StandardFonts.Helvetica);
    const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
    const avisos: string[] = [];

    const empresaNome = (empresa as Record<string, unknown> | null);
    const dados: Dados = {
      empresa: String(empresaNome?.name ?? empresaNome?.trade_name ?? ""),
      colaborador: String(colab?.nome_social || colab?.nome || ""),
      documentoTitulo: String(registro.titulo ?? ""),
      documentoTipo: String(registro.tipo ?? ""),
      competencia: registro.referencia_data
        ? new Date(`${String(registro.referencia_data).slice(0, 10)}T12:00:00Z`)
          .toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })
        : "—",
      arquivo: String(doc.file_name ?? ""),
      aceitoEm: String(aceite.aceito_em ?? ""),
      aprovadoPor: String(colab?.nome_social || colab?.nome || ""),
      ip: String(aceite.ip ?? "—"),
      dispositivo: String(aceite.user_agent ?? "—"),
      conteudoHash: String(aceite.conteudo_hash ?? ""),
      registroId: String(aceite.id ?? ""),
      avisos,
    };

    // Documento assinado
    const baixarDoc = await admin.storage.from(BUCKET).download(doc.file_path);
    if (baixarDoc.error || !baixarDoc.data) {
      avisos.push("O arquivo do documento não pôde ser lido no momento da emissão deste certificado.");
    }

    // Comprovante (anexo, mesmo sem validação digital própria)
    let compBytes: Uint8Array | null = null;
    if (comp?.file_path) {
      const baixarComp = await admin.storage.from(BUCKET).download(comp.file_path);
      if (baixarComp.data) compBytes = new Uint8Array(await baixarComp.data.arrayBuffer());
      else avisos.push("O comprovante de pagamento não pôde ser lido no momento da emissão.");
    }

    // Página 1 depois dos avisos conhecidos do download.
    let docBytes: Uint8Array | null = null;
    if (baixarDoc.data) docBytes = new Uint8Array(await baixarDoc.data.arrayBuffer());

    const pendentes: string[] = [];

    // Capa primeiro; o documento e o anexo entram nas páginas seguintes.
    paginaCertificado(pdf, fonte, negrito, dados);

    if (docBytes) {
      const aviso = await anexarArquivo(pdf, docBytes, String(doc.mime_type ?? ""), String(doc.file_name ?? ""));
      if (aviso) pendentes.push(aviso);
    }

    if (compBytes) {
      paginaAnexo(
        pdf,
        fonte,
        negrito,
        String(comp?.file_name ?? registro.comprovante_file_name ?? ""),
        registro.comprovante_pago_em
          ? new Date(`${String(registro.comprovante_pago_em).slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR")
          : "—",
      );
      const aviso = await anexarArquivo(
        pdf,
        compBytes,
        String(comp?.mime_type ?? ""),
        String(comp?.file_name ?? ""),
      );
      if (aviso) pendentes.push(aviso);
      try {
        await pdf.attach(compBytes, String(comp?.file_name ?? "comprovante-pagamento"), {
          mimeType: String(comp?.mime_type ?? "application/octet-stream"),
          description: "Comprovante de pagamento (sem validação digital própria)",
        });
      } catch {
        // anexo embutido é complementar: as páginas visíveis já garantem a leitura
      }
    }

    if (pendentes.length) {
      // Avisos descobertos na montagem entram em uma página final de observações.
      const page = pdf.addPage(A4);
      let y = page.getHeight() - 120;
      page.drawText("Observações", { x: 48, y, size: 14, font: negrito, color: rgb(0.6, 0.2, 0.05) });
      y -= 24;
      for (const aviso of pendentes) {
        for (const linha of linhas(aviso, fonte, 10.5, page.getWidth() - 96)) {
          page.drawText(linha, { x: 48, y, size: 10.5, font: fonte, color: rgb(0.25, 0.25, 0.25) });
          y -= 14;
        }
        y -= 8;
      }
    }

    rodape(pdf, fonte, dados);

    const bytes = await pdf.save();
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="certificado-validacao.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    await recordEdgeError({
      functionName: FUNCAO,
      action: "emitir certificado de validação",
      error: e,
      details: { documento_id: documentoId },
    });
    return erro(500, "Não foi possível gerar o certificado agora.");
  }
});
