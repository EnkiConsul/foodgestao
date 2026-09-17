/**
 * Documentos da Pré-Admissão: envio pelo candidato, ficha oficial pelo gestor e
 * visualização temporária.
 *
 * O arquivo vai para bucket PRIVADO. O caminho é montado pelo servidor a partir
 * do convite validado — o cliente não escolhe onde grava. O tipo do arquivo é
 * conferido pelos bytes: o MIME declarado não é aceito como prova. Só entra
 * documento que o checklist atual pede, para um titular vigente, e apenas
 * enquanto a ficha está com o candidato.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { canAdminister, requireCompanyAccess, requireUser, serviceClient } from "../_shared/authz.ts";
import { ipRateLimited } from "../_shared/rate-limit.ts";
import {
  candidatoPodeEditar,
  registrarDocumento,
  registrarEvento,
  registrarFichaOficial,
  requisitosEmpresa,
  requisitosPrevistos,
  tipoRealDoArquivo,
  validarConvite,
} from "../_shared/preadmissao.ts";
import { montarChecklist } from "../_shared/preadmissao-checklist.ts";

const BUCKET = "dp-documentos";
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const FASE_ENCERRADA =
  "Sua ficha já está em análise pela empresa. Aguarde o contato: não é possível enviar documentos agora.";

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
      if (await ipRateLimited(admin as unknown as Parameters<typeof ipRateLimited>[0], req, "preadmissao_upload", 200)) {
        return jsonError(req, "rate_limited");
      }
      const valid = await validarConvite(admin, String(body?.t ?? ""), String(body?.c ?? ""));
      if (!valid.ok) return jsonResponse(req, 403, { error: "Este link não está mais válido." });
      const pa = valid.preadmissao;
      if (!candidatoPodeEditar(pa.status)) {
        return jsonResponse(req, 409, { error: FASE_ENCERRADA, status: pa.status });
      }

      const codigo = String(body?.requisito_codigo ?? "").trim();
      const pessoaIdPedido = typeof body?.pessoa_id === "string" && body.pessoa_id.length === 36
        ? String(body.pessoa_id)
        : null;

      // O checklist atual é a única fonte do que pode ser enviado — inclui os
      // requisitos personalizados de Cargo/Unidade da empresa.
      const [{ data: pessoas }, reqs, reqsEmpresa] = await Promise.all([
        admin
          .from("dp_preadmissao_pessoas")
          .select("id, nome, data_nascimento, parentesco, finalidade_dependente, finalidade_sesc")
          .eq("preadmissao_id", pa.id)
          .is("removido_em", null),
        requisitosPrevistos(admin, pa),
        requisitosEmpresa(admin, pa.company_id),
      ]);
      const dados = (pa.dados ?? {}) as Record<string, unknown>;
      const checklist = montarChecklist({
        ficha: {
          data_nascimento: pa.data_nascimento,
          estado_civil: pa.estado_civil,
          sexo: (dados.sexo as string) ?? null,
        },
        pessoas: (pessoas ?? []) as never,
        requisitosCargo: reqs.cargo,
        requisitosUnidade: reqs.unidade,
        requisitosEmpresa: reqsEmpresa,
      });
      const previsto = checklist.find((i) => i.codigo === codigo && (i.pessoa_id ?? null) === pessoaIdPedido);
      if (!previsto) {
        return jsonResponse(req, 400, {
          error: "Este documento não está na lista pedida para esta ficha.",
        });
      }

      const bytes = decodificar(String(body?.content_base64 ?? ""));
      if (!bytes.length) return jsonResponse(req, 400, { error: "O arquivo não foi recebido. Tente novamente." });
      if (bytes.length > MAX_BYTES) {
        return jsonResponse(req, 400, { error: "O arquivo passa de 10 MB. Envie uma foto menor." });
      }
      const real = tipoRealDoArquivo(bytes);
      if (!real || !EXTENSOES[real]) {
        return jsonResponse(req, 400, {
          error: "Envie uma foto (JPG, PNG, HEIC ou WEBP) ou um arquivo PDF.",
        });
      }
      const ext = EXTENSOES[real];

      const caminho = `${pa.company_id}/preadmissao/${pa.id}/${codigo}-${pessoaIdPedido ?? "titular"}-${Date.now()}.${ext}`;
      const up = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: real, upsert: false });
      if (up.error) return jsonError(req, "internal", up.error.message);

      // Substituição da versão vigente + nova versão em UMA transação travada.
      const reg = await registrarDocumento(admin as unknown as Parameters<typeof registrarDocumento>[0], {
        preadmissaoId: pa.id,
        codigo,
        pessoaId: pessoaIdPedido,
        filePath: caminho,
        fileName: String(body?.file_name ?? `${codigo}.${ext}`).slice(0, 180),
        mimeType: real,
        fileSize: bytes.length,
      });
      if (!reg.ok) {
        await admin.storage.from(BUCKET).remove([caminho]);
        if (reg.motivo === "fase_encerrada") return jsonResponse(req, 409, { error: FASE_ENCERRADA });
        if (reg.motivo === "titular_invalido") {
          return jsonResponse(req, 400, { error: "Pessoa não encontrada nesta ficha." });
        }
        return jsonError(req, "internal", "não foi possível registrar o documento");
      }
      return jsonResponse(req, 200, { success: true, versao: reg.versao });
    }

    // ---------- Gestor: ficha oficial devolvida pela contabilidade ----------
    if (acao === "ficha_oficial") {
      const caller = await requireUser(req);
      if (!caller) return jsonError(req, "unauthorized");
      const preadmissaoId = String(body?.preadmissao_id ?? "").trim();
      const { data: pa } = await admin
        .from("dp_preadmissoes")
        .select("id, company_id, status")
        .eq("id", preadmissaoId)
        .maybeSingle();
      if (!pa) return jsonError(req, "not_found");
      const access = await requireCompanyAccess(caller.id, pa.company_id as string);
      if (!access || !canAdminister(access)) return jsonError(req, "forbidden");
      if (!["enviado_contabilidade", "aguardando_retorno_contabilidade", "registro_recebido"].includes(pa.status as string)) {
        return jsonResponse(req, 409, {
          error: "A ficha oficial só é anexada depois do envio à contabilidade.",
          status: pa.status,
        });
      }

      const bytes = decodificar(String(body?.content_base64 ?? ""));
      if (!bytes.length) return jsonResponse(req, 400, { error: "O arquivo não foi recebido. Tente novamente." });
      if (bytes.length > MAX_BYTES) return jsonResponse(req, 400, { error: "O arquivo passa de 10 MB." });
      const real = tipoRealDoArquivo(bytes);
      if (!real || !EXTENSOES[real]) {
        return jsonResponse(req, 400, { error: "Anexe a ficha oficial em PDF ou imagem." });
      }
      const caminho = `${pa.company_id}/preadmissao/${pa.id}/ficha_oficial-${Date.now()}.${EXTENSOES[real]}`;
      const up = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: real, upsert: false });
      if (up.error) return jsonError(req, "internal", up.error.message);

      // Substituição da versão vigente, nova versão, invalidação da conferência
      // anterior e registro do retorno: tudo numa transação travada. Anexar NÃO
      // é conferir — a conferência continua sendo ato explícito do gestor.
      const reg = await registrarFichaOficial(admin as unknown as Parameters<typeof registrarFichaOficial>[0], {
        preadmissaoId: pa.id as string,
        filePath: caminho,
        fileName: String(body?.file_name ?? "ficha-oficial").slice(0, 180),
        mimeType: real,
        fileSize: bytes.length,
      });
      if (!reg.ok) {
        await admin.storage.from(BUCKET).remove([caminho]);
        if (reg.motivo === "fase_invalida") {
          return jsonResponse(req, 409, {
            error: "A ficha oficial só é anexada depois do envio à contabilidade.",
            status: reg.status,
          });
        }
        if (reg.motivo === "nao_encontrada") return jsonError(req, "not_found");
        return jsonError(req, "internal", "não foi possível registrar a ficha oficial");
      }

      await registrarEvento(
        admin,
        pa.id as string,
        pa.company_id as string,
        "ficha_oficial_recebida",
        { documento_id: reg.documento_id ?? null, versao: reg.versao ?? null },
        caller.id,
      );
      return jsonResponse(req, 200, {
        success: true,
        documento_id: reg.documento_id,
        versao: reg.versao,
        status: reg.status,
      });
    }

    // ---------- Candidato: rever os próprios arquivos pelo convite ----------
    if (acao === "url_candidato") {
      if (await ipRateLimited(admin as unknown as Parameters<typeof ipRateLimited>[0], req, "preadmissao_url", 300)) {
        return jsonError(req, "rate_limited");
      }
      const valid = await validarConvite(admin, String(body?.t ?? ""), String(body?.c ?? ""));
      if (!valid.ok) return jsonResponse(req, 403, { error: "Este link não está mais válido." });
      const documentoId = String(body?.documento_id ?? "").trim();
      const { data: doc } = await admin
        .from("dp_preadmissao_documentos")
        .select("id, file_path, file_name, requisito_codigo, substituido_em")
        .eq("id", documentoId)
        .eq("preadmissao_id", valid.preadmissao.id)
        .eq("company_id", valid.preadmissao.company_id)
        .maybeSingle();
      // A ficha oficial da contabilidade é documento interno: não vai ao candidato.
      if (!doc || doc.requisito_codigo === "ficha_oficial") return jsonError(req, "not_found");
      const signed = await admin.storage.from(BUCKET).createSignedUrl(doc.file_path as string, 120);
      if (signed.error) return jsonError(req, "internal", signed.error.message);
      return jsonResponse(req, 200, { url: signed.data.signedUrl, file_name: doc.file_name });
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
