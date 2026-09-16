/**
 * Documentos da Pré-Admissão: envio pelo candidato e visualização pelo gestor.
 *
 * O arquivo vai para bucket PRIVADO. O caminho é montado pelo servidor a partir
 * do convite validado — o cliente não escolhe onde grava. A visualização usa URL
 * temporária; nunca há URL pública permanente.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { canAdminister, requireCompanyAccess, requireUser, serviceClient } from "../_shared/authz.ts";
import { ipRateLimited } from "../_shared/rate-limit.ts";
import { registrarEvento, validarConvite } from "../_shared/preadmissao.ts";
import { DOCUMENTOS } from "../_shared/preadmissao-checklist.ts";

const BUCKET = "dp-documentos";
const MAX_BYTES = 10 * 1024 * 1024;
const MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

function decodificar(base64: string): Uint8Array {
  const limpo = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const bin = atob(limpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const admin = serviceClient();
    const body = await req.json().catch(() => ({}));
    const acao = String(body?.action ?? "").trim();

    // ---------- Candidato: envio de documento ----------
    if (acao === "upload") {
      if (await ipRateLimited(admin, req, "preadmissao_upload", 200)) return jsonError(req, "rate_limited");
      const valid = await validarConvite(admin, String(body?.t ?? ""), String(body?.c ?? ""));
      if (!valid.ok) return jsonResponse(req, 403, { error: "Este link não está mais válido." });
      const pa = valid.preadmissao;

      const codigo = String(body?.requisito_codigo ?? "").trim();
      if (!codigo || !DOCUMENTOS[codigo]) return jsonResponse(req, 400, { error: "Documento desconhecido." });
      const mime = String(body?.mime_type ?? "").toLowerCase();
      const ext = MIMES[mime];
      if (!ext) {
        return jsonResponse(req, 400, {
          error: "Envie uma foto (JPG, PNG, HEIC ou WEBP) ou um arquivo PDF.",
        });
      }
      const bytes = decodificar(String(body?.content_base64 ?? ""));
      if (!bytes.length) return jsonResponse(req, 400, { error: "O arquivo não foi recebido. Tente novamente." });
      if (bytes.length > MAX_BYTES) {
        return jsonResponse(req, 400, { error: "O arquivo passa de 10 MB. Envie uma foto menor." });
      }

      let pessoaId: string | null = null;
      if (body?.pessoa_id) {
        const { data } = await admin
          .from("dp_preadmissao_pessoas")
          .select("id")
          .eq("id", String(body.pessoa_id))
          .eq("preadmissao_id", pa.id)
          .maybeSingle();
        if (!data) return jsonResponse(req, 400, { error: "Pessoa não encontrada nesta ficha." });
        pessoaId = data.id as string;
      }

      const caminho = `${pa.company_id}/preadmissao/${pa.id}/${codigo}-${pessoaId ?? "titular"}-${Date.now()}.${ext}`;
      const up = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime, upsert: false });
      if (up.error) return jsonError(req, "internal", up.error.message);

      // Versão anterior é preservada como substituída (histórico do reenvio).
      await admin
        .from("dp_preadmissao_documentos")
        .update({ substituido_em: new Date().toISOString() })
        .eq("preadmissao_id", pa.id)
        .eq("requisito_codigo", codigo)
        .is("substituido_em", null)
        .filter("pessoa_id", pessoaId ? "eq" : "is", pessoaId ?? null);

      const { data: anteriores } = await admin
        .from("dp_preadmissao_documentos")
        .select("versao")
        .eq("preadmissao_id", pa.id)
        .eq("requisito_codigo", codigo)
        .order("versao", { ascending: false })
        .limit(1);

      const { error } = await admin.from("dp_preadmissao_documentos").insert({
        preadmissao_id: pa.id,
        company_id: pa.company_id,
        pessoa_id: pessoaId,
        requisito_codigo: codigo,
        file_path: caminho,
        file_name: String(body?.file_name ?? `${codigo}.${ext}`).slice(0, 180),
        mime_type: mime,
        file_size: bytes.length,
        versao: ((anteriores?.[0]?.versao as number) ?? 0) + 1,
      });
      if (error) return jsonError(req, "internal", error.message);

      await registrarEvento(admin, pa.id, pa.company_id, "documento_enviado", { codigo });
      return jsonResponse(req, 200, { success: true });
    }

    // ---------- Gestor: link temporário de visualização ----------
    if (acao === "url") {
      const caller = await requireUser(req);
      if (!caller) return jsonError(req, "unauthorized");
      const documentoId = String(body?.documento_id ?? "").trim();
      const { data: doc } = await admin
        .from("dp_preadmissao_documentos")
        .select("id, company_id, file_path, file_name")
        .eq("id", documentoId)
        .maybeSingle();
      if (!doc) return jsonError(req, "not_found");
      const access = await requireCompanyAccess(caller.id, doc.company_id as string);
      if (!access || !canAdminister(access)) return jsonError(req, "forbidden");

      const signed = await admin.storage.from(BUCKET).createSignedUrl(doc.file_path as string, 120);
      if (signed.error) return jsonError(req, "internal", signed.error.message);
      return jsonResponse(req, 200, { url: signed.data.signedUrl, file_name: doc.file_name });
    }

    return jsonError(req, "invalid_input", "ação desconhecida");
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
