/**
 * Assinatura da ata por link (WhatsApp) para participantes sem cadastro.
 *
 * emitir (gestor logado): gera token (só o hash fica no banco) e envia pelo
 * WhatsApp da Aveto. ver | pdf | assinar (público): exigem o token e, para
 * assinar, a confirmação do CPF informado pelo gestor.
 */
import { z } from "npm:zod@3";
import { callerClient, requireUser, serviceClient } from "../_shared/authz.ts";
import { strictCorsHeaders } from "../_shared/http.ts";
import { assinaturaValida, desenharAssinatura, embutirAssinatura, rubricarPaginas } from "../_shared/assinatura-pdf.ts";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

/** Via assinada: página final com o desenho da assinatura e rubrica em todas as páginas. */
async function estamparAssinatura(bytes: ArrayBuffer, a: { nome: string; img: string; em: string; ip: string | null; hash: string | null }) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const img = await embutirAssinatura(pdf, a.img);
  if (!img) return new Uint8Array(bytes);
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  rubricarPaginas(pdf, img, f, 44);
  const pg = pdf.addPage([595, 842]);
  const azul = rgb(0.06, 0.1, 0.24);
  pg.drawText("ASSINATURA ELETRÔNICA DA ATA", { x: 56, y: 780, size: 13, font: fb, color: azul });
  desenharAssinatura(pg, img, 56, 640, 260, 100);
  pg.drawLine({ start: { x: 56, y: 634 }, end: { x: 316, y: 634 }, thickness: 0.6, color: azul });
  pg.drawText(a.nome.toUpperCase(), { x: 56, y: 620, size: 10, font: fb, color: azul });
  const quando = new Date(a.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const linhas = [`Assinado por link com confirmação de CPF em ${quando} (horário de Brasília).`, `Endereço de internet: ${a.ip ?? "não informado"}`, `Impressão digital do documento (SHA-256): ${a.hash ?? "—"}`];
  linhas.forEach((t, i) => pg.drawText(t, { x: 56, y: 596 - i * 14, size: 8.5, font: f, color: azul }));
  return await pdf.save();
}
import { clientIp, ipRateLimited, isRateLimited, sha256Hex } from "../_shared/rate-limit.ts";
import { enviarWhatsappAveto, primeiroNome } from "../_shared/whatsapp-aveto.ts";

const FUNCAO = "dp-ata-avulso";
const BUCKET = "dp-documentos";
const SITE = "https://aveto360.com";

const Body = z.object({
  acao: z.enum(["emitir", "ver", "pdf", "assinar"]),
  participante_id: z.string().uuid().optional(),
  token: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  cpf: z.string().max(20).optional(),
  concordo: z.boolean().optional(),
  assinatura: z.string().max(400000).optional(),
});

Deno.serve(async (req) => {
  const cors = strictCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método inválido." });

  try {
    const admin = serviceClient();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: "Pedido inválido." });
    const b = parsed.data;

    // ---------------- emitir (gestor) ----------------
    if (b.acao === "emitir") {
      const caller = await requireUser(req);
      if (!caller) return json(401, { error: "Sessão expirada. Entre novamente." });
      if (!b.participante_id) return json(400, { error: "Participante não informado." });
      // A leitura pelo cliente do gestor confirma a permissão (RLS de Documentos).
      const { data: p } = await callerClient(caller.token).from("dp_ata_participantes")
        .select("id, company_id, ata_id, colaborador_id, avulso_nome, avulso_cpf, avulso_whatsapp, arquivo_path, modalidade, assinado_em")
        .eq("id", b.participante_id).maybeSingle();
      if (!p) return json(404, { error: "Participante não encontrado ou sem permissão." });
      if (p.colaborador_id) return json(400, { error: "Colaborador cadastrado assina pelo portal." });
      if (p.modalidade === "consulta") return json(400, { error: "Este participante está como Apenas Consulta." });
      if (p.assinado_em) return json(409, { error: "Este participante já assinou." });
      if (!p.arquivo_path) return json(409, { error: "Envie a ata aos participantes antes de mandar o link." });
      if (String(p.avulso_cpf ?? "").length !== 11) return json(400, { error: "Informe o CPF do participante para enviar o link.", detalhe: "O CPF é pedido na hora de assinar." });
      const { data: ata } = await admin.from("dp_atas").select("titulo, data_reuniao, company_id").eq("id", p.ata_id).maybeSingle();
      const { data: emp } = await admin.from("companies").select("name, trade_name").eq("id", p.company_id).maybeSingle();
      const token = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("");
      await admin.from("dp_ata_participantes").update({
        link_token_hash: await sha256Hex(token),
        link_expira_em: new Date(Date.now() + 15 * 86400_000).toISOString(),
      }).eq("id", p.id);
      const link = `${SITE}/ata/${token}`;
      const empresa = emp?.trade_name || emp?.name || "a empresa";
      const msg = `Aveto 360 - Olá, ${primeiroNome(p.avulso_nome)}!\n\n${empresa} enviou a ata da reunião "${ata?.titulo ?? ""}" para você assinar.\n\nToque no link, confira o documento e confirme com o seu CPF:\n${link}\n\nO link vale por 15 dias.`;
      const r = await enviarWhatsappAveto(p.avulso_whatsapp, msg, {
        admin, companyId: p.company_id, tipo: "ata", nome: p.avulso_nome, link, enviadoPor: caller.id,
      });
      return json(200, { enviado: r.enviado, erro: r.erro ?? null, link });
    }

    // ---------------- público ----------------
    if (await ipRateLimited(admin, req, FUNCAO, 120)) return json(429, { error: "Muitas tentativas. Aguarde alguns minutos." });
    if (!b.token) return json(400, { error: "Link inválido." });
    const { data: p } = await admin.from("dp_ata_participantes")
      .select("id, ata_id, company_id, avulso_nome, avulso_cpf, arquivo_path, link_expira_em, assinado_em, modalidade, assinatura_imagem, assinatura_ip, assinatura_hash")
      .eq("link_token_hash", await sha256Hex(b.token)).maybeSingle();
    if (!p) return json(404, { error: "Este link não é mais válido. Peça um novo link a quem enviou." });
    if (!p.assinado_em && p.link_expira_em && new Date(p.link_expira_em) < new Date()) {
      return json(410, { error: "Este link expirou. Peça um novo link a quem enviou." });
    }
    const { data: ata } = await admin.from("dp_atas").select("titulo, data_reuniao").eq("id", p.ata_id).maybeSingle();
    const { data: emp } = await admin.from("companies").select("name, trade_name").eq("id", p.company_id).maybeSingle();

    if (b.acao === "ver") {
      return json(200, {
        empresa: emp?.trade_name || emp?.name || "", nome: p.avulso_nome, titulo: ata?.titulo, data_reuniao: ata?.data_reuniao,
        modalidade: p.modalidade, assinado_em: p.assinado_em, cpf_final: String(p.avulso_cpf ?? "").slice(-2) || null,
      });
    }
    const { data: arq } = p.arquivo_path ? await admin.storage.from(BUCKET).download(p.arquivo_path) : { data: null };
    if (!arq) return json(409, { error: "O arquivo da ata não está disponível. Avise quem enviou." });
    const bytes = await arq.arrayBuffer();
    if (b.acao === "pdf") {
      const saida = p.assinado_em && p.assinatura_imagem
        ? await estamparAssinatura(bytes, { nome: p.avulso_nome ?? "Participante", img: p.assinatura_imagem, em: p.assinado_em, ip: p.assinatura_ip, hash: p.assinatura_hash }).catch(() => bytes)
        : bytes;
      return new Response(saida, { status: 200, headers: { ...cors, "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
    }

    // assinar
    if (p.assinado_em) return json(200, { assinado_em: p.assinado_em, ja_assinado: true });
    if (b.concordo !== true) return json(400, { error: "Marque que leu a ata." });
    const img = assinaturaValida(b.assinatura);
    if (!img) return json(400, { error: "Desenhe ou escolha a sua assinatura antes de confirmar." });
    if (await isRateLimited(admin, `${FUNCAO}:cpf`, await sha256Hex(`cpf:${p.id}`), 8)) {
      return json(429, { error: "Muitas tentativas de CPF. Peça um novo link a quem enviou." });
    }
    const informado = String(b.cpf ?? "").replace(/\D+/g, "");
    if (!p.avulso_cpf || informado !== p.avulso_cpf) return json(403, { error: "O CPF informado não confere com o cadastrado na ata." });
    const d = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
    const agora = new Date().toISOString();
    await admin.from("dp_ata_participantes").update({
      assinado_em: agora, assinatura_imagem: img, assinatura_hash: hash, assinatura_ip: clientIp(req),
      assinatura_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400),
    }).eq("id", p.id).is("assinado_em", null);
    return json(200, { assinado_em: agora });
  } catch (e) {
    console.error("[dp-ata-avulso]", (e as Error)?.message);
    return json(500, { error: "Não foi possível concluir agora. Tente novamente." });
  }
});
