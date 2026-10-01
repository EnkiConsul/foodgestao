/**
 * Assinatura do recibo pelo link enviado no WhatsApp (sem login).
 *
 * O token chega só no link; no banco fica apenas o hash. A pessoa confirma o
 * próprio CPF antes de assinar — sem CPF correto, nada é gravado. Assinatura é
 * idempotente: recibo já assinado devolve o registro existente.
 *
 * Ações: ver | pdf | assinar
 */
import { z } from "npm:zod@3";
import { serviceClient } from "../_shared/authz.ts";
import { recordEdgeError } from "../_shared/error-log.ts";
import { strictCorsHeaders } from "../_shared/http.ts";
import { clientIp, ipRateLimited, isRateLimited, sha256Hex } from "../_shared/rate-limit.ts";
import { montarReciboPdf, NATUREZA_LABEL, reciboDaLinha, type Natureza } from "../_shared/recibo-pdf.ts";

const FUNCAO = "dp-recibo-publico";
const BUCKET = "dp-documentos";

const Body = z.object({
  acao: z.enum(["ver", "pdf", "assinar"]),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  cpf: z.string().max(20).optional(),
  concordo: z.boolean().optional(),
});

Deno.serve(async (req) => {
  const cors = strictCorsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método inválido." });

  try {
    const admin = serviceClient();
    if (await ipRateLimited(admin, req, FUNCAO, 120)) {
      return json(429, { error: "Muitas tentativas. Aguarde alguns minutos." });
    }
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json(400, { error: "Link inválido." });
    const b = parsed.data;
    const hash = await sha256Hex(b.token);

    const { data: row } = await admin.from("dp_recibos").select("*").eq("link_token_hash", hash).maybeSingle();
    if (!row || row.cancelado_em) return json(404, { error: "Este link não é mais válido. Peça um novo link a quem enviou." });
    const expirado = !row.assinado_em && row.link_expira_em && new Date(row.link_expira_em) < new Date();
    if (expirado) return json(410, { error: "Este link expirou. Peça um novo link a quem enviou." });

    const { data: empresa } = await admin.from("companies").select("name, trade_name, cnpj")
      .eq("id", row.company_id).maybeSingle();

    if (b.acao === "ver") {
      const cpf = String(row.beneficiario_cpf ?? "");
      return json(200, {
        empresa: empresa?.trade_name || empresa?.name || "",
        beneficiario: row.beneficiario_nome,
        cpf_final: cpf ? cpf.slice(-2) : null,
        natureza: NATUREZA_LABEL[row.natureza as Natureza],
        descricao: row.descricao,
        competencia: row.competencia,
        pago_em: row.pago_em,
        valor_cents: row.valor_cents,
        modalidade: row.modalidade,
        assinado_em: row.assinado_em,
      });
    }

    if (b.acao === "pdf") {
      const bytes = await montarReciboPdf(reciboDaLinha(row, empresa));
      return new Response(bytes as unknown as BodyInit, {
        status: 200,
        headers: { ...cors, "Content-Type": "application/pdf", "Cache-Control": "no-store" },
      });
    }

    // ---------------- assinar ----------------
    if (row.assinado_em) return json(200, { assinado_em: row.assinado_em, ja_assinado: true });
    if (b.concordo !== true) return json(400, { error: "Marque que leu e concorda com o recibo." });

    // Tentativas erradas de CPF por recibo: limite próprio (anti força bruta).
    if (await isRateLimited(admin, `${FUNCAO}:cpf`, await sha256Hex(`cpf:${row.id}`), 8)) {
      return json(429, { error: "Muitas tentativas de CPF. Peça um novo link a quem enviou." });
    }
    const informado = String(b.cpf ?? "").replace(/\D+/g, "");
    const esperado = String(row.beneficiario_cpf ?? "").replace(/\D+/g, "");
    if (!esperado || informado !== esperado) {
      return json(403, { error: "O CPF informado não confere com o do recibo." });
    }

    // Hash do arquivo emitido (o que a pessoa viu) entra na prova da assinatura.
    let hashArquivo: string | null = null;
    if (row.file_path) {
      const { data: arq } = await admin.storage.from(BUCKET).download(row.file_path);
      if (arq) {
        const d = await crypto.subtle.digest("SHA-256", await arq.arrayBuffer());
        hashArquivo = [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
      }
    }
    if (!hashArquivo) return json(409, { error: "O arquivo do recibo não está disponível. Avise quem enviou." });

    const agora = new Date().toISOString();
    const { data: upd, error } = await admin.from("dp_recibos").update({
      assinado_em: agora,
      assinado_ip: clientIp(req),
      assinado_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400),
      assinado_hash: hashArquivo,
      assinado_confirmacao: { metodo: "cpf", canal: "whatsapp", declaracao: "Li e concordo com o recibo" },
    }).eq("id", row.id).is("assinado_em", null).select("assinado_em").maybeSingle();
    if (error) throw error;
    return json(200, { assinado_em: upd?.assinado_em ?? agora });
  } catch (e) {
    await recordEdgeError({ functionName: FUNCAO, action: "assinar recibo pelo link", error: e });
    return json(500, { error: "Não foi possível concluir agora. Tente novamente." });
  }
});
