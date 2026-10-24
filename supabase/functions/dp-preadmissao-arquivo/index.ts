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
  regrasAdmissao,
  tipoRealDoArquivo,
  validarConvite,
} from "../_shared/preadmissao.ts";
import { aplicarRegrasDocumentos, montarChecklist } from "../_shared/preadmissao-checklist.ts";
import { type ArquivoLeitura, CODIGOS_LEITURA, compararComCadastro, type Divergencia, lerDocumento } from "../_shared/preadmissao-ocr.ts";
import { base64Encode } from "../_shared/doc-bulk-ocr.ts";

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
       const [{ data: pessoas }, reqs, reqsEmpresa, regras] = await Promise.all([
        admin
          .from("dp_preadmissao_pessoas")
          .select("id, nome, data_nascimento, parentesco, finalidade_dependente, finalidade_sesc")
          .eq("preadmissao_id", pa.id)
          .is("removido_em", null),
        requisitosPrevistos(admin, pa),
        requisitosEmpresa(admin, pa.company_id),
        regrasAdmissao(admin as never, pa),
      ]);
      const dados = (pa.dados ?? {}) as Record<string, unknown>;
       const checklist = aplicarRegrasDocumentos(montarChecklist({
        ficha: {
          data_nascimento: pa.data_nascimento,
          estado_civil: pa.estado_civil,
          sexo: (dados.sexo as string) ?? null,
        },
        pessoas: (pessoas ?? []) as never,
        requisitosCargo: reqs.cargo,
        requisitosUnidade: reqs.unidade,
        requisitosEmpresa: reqsEmpresa,
       }), regras.documentos);
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

      // Parte do documento: 1 = frente, 2 = verso, e assim por diante (até 10).
      const parteBruta = body?.parte === undefined || body?.parte === null ? 1 : Number(body.parte);
      if (!Number.isInteger(parteBruta) || parteBruta < 1 || parteBruta > 10) {
        return jsonResponse(req, 400, { error: "Parte do documento inválida." });
      }
      const parteRotulo = typeof body?.parte_rotulo === "string"
        ? body.parte_rotulo.trim().slice(0, 40) || null
        : null;

      const caminho =
        `${pa.company_id}/preadmissao/${pa.id}/${codigo}-${pessoaIdPedido ?? "titular"}-p${parteBruta}-${Date.now()}.${ext}`;
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
        parte: parteBruta,
        parteRotulo,
      });
      if (!reg.ok) {
        await admin.storage.from(BUCKET).remove([caminho]);
        if (reg.motivo === "fase_encerrada") return jsonResponse(req, 409, { error: FASE_ENCERRADA });
        if (reg.motivo === "parte_invalida") {
          return jsonResponse(req, 400, { error: "Parte do documento inválida." });
        }
        if (reg.motivo === "titular_invalido") {
          return jsonResponse(req, 400, { error: "Pessoa não encontrada nesta ficha." });
        }
        return jsonError(req, "internal", "não foi possível registrar o documento");
      }
      return jsonResponse(req, 200, { success: true, versao: reg.versao, parte: reg.parte ?? parteBruta });
    }

    // ---------- Gestor: ficha oficial devolvida pela contabilidade ----------
    if (acao === "ficha_oficial") {
      const caller = await requireUser(req);
      if (!caller) return jsonError(req, "unauthorized");
      const preadmissaoId = String(body?.preadmissao_id ?? "").trim();
      const { data: pa } = await admin
        .from("dp_preadmissoes")
        .select("id, company_id, status, removido_em")
        .eq("id", preadmissaoId)
        .maybeSingle();
      if (!pa) return jsonError(req, "not_found");
      if (pa.removido_em) return jsonError(req, "not_found");
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

    // ---------- Gestor: arquivo do ASO (exame admissional) ----------
    if (acao === "aso_arquivo" || acao === "aso_url") {
      const caller = await requireUser(req);
      if (!caller) return jsonError(req, "unauthorized");
      const { data: pa } = await admin.from("dp_preadmissoes")
        .select("id, company_id, status, removido_em, admin_dados")
        .eq("id", String(body?.preadmissao_id ?? "").trim()).maybeSingle();
      if (!pa || pa.removido_em) return jsonError(req, "not_found");
      const access = await requireCompanyAccess(caller.id, pa.company_id as string);
      if (!access || !canAdminister(access)) return jsonError(req, "forbidden");
      const adm = (pa.admin_dados ?? {}) as Record<string, unknown>;
      const aso = (adm.aso ?? {}) as Record<string, unknown>;
      if (acao === "aso_url") {
        if (!aso.arquivo_path) return jsonError(req, "not_found");
        const signed = await admin.storage.from(BUCKET).createSignedUrl(String(aso.arquivo_path), 120);
        if (signed.error) return jsonError(req, "internal", signed.error.message);
        return jsonResponse(req, 200, { url: signed.data.signedUrl, file_name: aso.arquivo_nome, mime_type: aso.arquivo_mime });
      }
      if (["concluido", "cancelado", "expirado"].includes(String(pa.status))) {
        return jsonResponse(req, 409, { error: "Esta pré-admissão já foi encerrada." });
      }
      const bytes = decodificar(String(body?.content_base64 ?? ""));
      if (!bytes.length) return jsonResponse(req, 400, { error: "O arquivo não foi recebido. Tente novamente." });
      if (bytes.length > MAX_BYTES) return jsonResponse(req, 400, { error: "O arquivo passa de 10 MB." });
      const real = tipoRealDoArquivo(bytes);
      if (!real || !EXTENSOES[real]) return jsonResponse(req, 400, { error: "Anexe o ASO em PDF ou imagem." });
      const caminho = `${pa.company_id}/preadmissao/${pa.id}/aso-${Date.now()}.${EXTENSOES[real]}`;
      const up = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: real, upsert: false });
      if (up.error) return jsonError(req, "internal", up.error.message);
      const novo = { ...aso, arquivo_path: caminho, arquivo_nome: String(body?.file_name ?? "aso").slice(0, 180), arquivo_mime: real, arquivo_em: new Date().toISOString() };
      const { error: e2 } = await admin.from("dp_preadmissoes").update({ admin_dados: { ...adm, aso: novo } }).eq("id", pa.id);
      if (e2) { await admin.storage.from(BUCKET).remove([caminho]); return jsonError(req, "internal", "não foi possível anexar o ASO"); }
      await registrarEvento(admin, pa.id as string, pa.company_id as string, "aso_anexado", {}, caller.id);
      return jsonResponse(req, 200, { success: true });
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
        .select("id, file_path, file_name, mime_type, requisito_codigo, substituido_em")
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

    // ---------- Candidato: lista oficial de bancos (mesma do financeiro) ----------
    if (acao === "bancos") {
      const valid = await validarConvite(admin, String(body?.t ?? ""), String(body?.c ?? ""));
      if (!valid.ok) return jsonResponse(req, 403, { error: "Este link não está mais válido." });
      const { data } = await admin
        .from("banks")
        .select("slug, name, domain, logo_url")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      return jsonResponse(req, 200, { bancos: data ?? [] });
    }

    // ---------- Candidato: leitura automática do documento enviado ----------
    if (acao === "ler_documento") {
      if (await ipRateLimited(admin as unknown as Parameters<typeof ipRateLimited>[0], req, "preadmissao_ocr", 40)) {
        return jsonError(req, "rate_limited");
      }
      const valid = await validarConvite(admin, String(body?.t ?? ""), String(body?.c ?? ""));
      if (!valid.ok) return jsonResponse(req, 403, { error: "Este link não está mais válido." });
      const pa = valid.preadmissao;
      if (!candidatoPodeEditar(pa.status)) return jsonResponse(req, 409, { error: FASE_ENCERRADA });
      const codigo = String(body?.requisito_codigo ?? "").trim();
      if (!CODIGOS_LEITURA.includes(codigo)) return jsonResponse(req, 200, { campos: {} });
      const aiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!aiKey) return jsonResponse(req, 200, { campos: {}, indisponivel: true });
      const { data: docs } = await admin
        .from("dp_preadmissao_documentos")
        .select("file_path, mime_type, file_size, parte")
        .eq("preadmissao_id", pa.id)
        .eq("requisito_codigo", codigo)
        .is("pessoa_id", null)
        .is("substituido_em", null)
        .order("parte")
        .limit(3);
      const arquivos: ArquivoLeitura[] = [];
      for (const d of docs ?? []) {
        if (Number(d.file_size ?? 0) > MAX_BYTES) continue;
        const mime = String(d.mime_type ?? "");
        if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime)) continue;
        const dl = await admin.storage.from(BUCKET).download(d.file_path as string);
        if (dl.error || !dl.data) continue;
        arquivos.push({ mime, base64: base64Encode(new Uint8Array(await dl.data.arrayBuffer())) });
      }
      if (!arquivos.length) return jsonResponse(req, 200, { campos: {} });
      const r = await lerDocumento(aiKey, codigo, arquivos);
      // Falha na leitura nunca trava o candidato: ele segue digitando.
      if (!r.ok) return jsonResponse(req, 200, { campos: {}, indisponivel: true });
      let divergencias: Divergencia[] = [];
      if (codigo === "identidade") {
        const dadosPa = ((pa as Record<string, unknown>).dados ?? {}) as Record<string, unknown>;
        const p = pa as Record<string, unknown>;
        const nasc = String(body?.data_nascimento ?? dadosPa.data_nascimento ?? p.data_nascimento ?? "");
        divergencias = compararComCadastro(r.campos, {
          nome: (p.candidato_nome as string) ?? null,
          cpf: (p.cpf as string) ?? null,
          data_nascimento: /^\d{2}\/\d{2}\/\d{4}$/.test(nasc) ? nasc.split("/").reverse().join("-") : nasc,
        });
        // Registra para o gestor conferir; o candidato segue normalmente.
        await admin.from("dp_preadmissao_eventos").insert({
          preadmissao_id: pa.id,
          company_id: p.company_id,
          evento: "ocr_divergencia",
          detalhe: { divergencias },
        });
      }
      return jsonResponse(req, 200, { campos: r.campos, divergencias });
    }

    // ---------- Gestor: anexar verso, substituir ou salvar ajuste de enquadramento ----------
    if (acao === "upload_gestor") {
      const caller = await requireUser(req);
      if (!caller) return jsonError(req, "unauthorized");
      const preadmissaoId = String(body?.preadmissao_id ?? "").trim();
      const { data: pa } = await admin.from("dp_preadmissoes").select("id, company_id")
        .eq("id", preadmissaoId).maybeSingle();
      if (!pa) return jsonError(req, "not_found");
      const access = await requireCompanyAccess(caller.id, pa.company_id as string);
      if (!access || !canAdminister(access)) return jsonError(req, "forbidden");
      const codigo = String(body?.requisito_codigo ?? "").trim().slice(0, 80);
      if (!/^[a-z0-9_]+$/.test(codigo)) return jsonResponse(req, 400, { error: "Documento inválido." });
      const pessoaId = typeof body?.pessoa_id === "string" && body.pessoa_id.length === 36 ? String(body.pessoa_id) : null;
      const parte = Number(body?.parte ?? 1);
      if (!Number.isInteger(parte) || parte < 1 || parte > 10) return jsonResponse(req, 400, { error: "Parte do documento inválida." });
      const bytes = decodificar(String(body?.content_base64 ?? ""));
      if (!bytes.length) return jsonResponse(req, 400, { error: "O arquivo não foi recebido. Tente novamente." });
      if (bytes.length > MAX_BYTES) return jsonResponse(req, 400, { error: "O arquivo passa de 10 MB." });
      const real = tipoRealDoArquivo(bytes);
      if (!real || !EXTENSOES[real]) return jsonResponse(req, 400, { error: "Envie uma foto (JPG, PNG, HEIC ou WEBP) ou um PDF." });
      const ext = EXTENSOES[real];
      const caminho = `${pa.company_id}/preadmissao/${pa.id}/${codigo}-${pessoaId ?? "titular"}-p${parte}-g${Date.now()}.${ext}`;
      const up = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: real, upsert: false });
      if (up.error) return jsonError(req, "internal", up.error.message);
      const { data: reg, error } = await admin.rpc("dp_preadmissao_documento_registrar_gestor", {
        p_preadmissao_id: pa.id, p_requisito_codigo: codigo, p_pessoa_id: pessoaId, p_file_path: caminho,
        p_file_name: String(body?.file_name ?? `${codigo}.${ext}`).slice(0, 180), p_mime_type: real,
        p_file_size: bytes.length, p_parte: parte,
        p_parte_rotulo: typeof body?.parte_rotulo === "string" ? body.parte_rotulo.slice(0, 40) : null,
        p_ator: caller.id, p_motivo: typeof body?.motivo === "string" ? body.motivo.slice(0, 60) : null,
      });
      const r = reg as { ok?: boolean; motivo?: string } | null;
      if (error || !r?.ok) {
        await admin.storage.from(BUCKET).remove([caminho]);
        return jsonResponse(req, 400, { error: r?.motivo === "titular_invalido" ? "Pessoa não encontrada nesta ficha." : "Não foi possível gravar o documento." });
      }
      return jsonResponse(req, 200, { success: true });
    }

    // ---------- Gestor: reler os dados do documento (após ajuste) ----------
    // Só sugere valores: a tela preenche apenas campos vazios e nunca nome/CPF.
    if (acao === "ler_documento_gestor") {
      const caller = await requireUser(req);
      if (!caller) return jsonError(req, "unauthorized");
      const preadmissaoId = String(body?.preadmissao_id ?? "").trim();
      const { data: pa } = await admin.from("dp_preadmissoes").select("id, company_id")
        .eq("id", preadmissaoId).maybeSingle();
      if (!pa) return jsonError(req, "not_found");
      const access = await requireCompanyAccess(caller.id, pa.company_id as string);
      if (!access || !canAdminister(access)) return jsonError(req, "forbidden");
      const codigo = String(body?.requisito_codigo ?? "").trim();
      if (!CODIGOS_LEITURA.includes(codigo)) return jsonResponse(req, 200, { campos: {} });
      const aiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!aiKey) return jsonResponse(req, 200, { campos: {}, indisponivel: true });
      const { data: docs } = await admin
        .from("dp_preadmissao_documentos")
        .select("file_path, mime_type, file_size, parte")
        .eq("preadmissao_id", pa.id)
        .eq("requisito_codigo", codigo)
        .is("pessoa_id", null)
        .is("substituido_em", null)
        .order("parte")
        .limit(3);
      const arquivos: ArquivoLeitura[] = [];
      for (const d of docs ?? []) {
        if (Number(d.file_size ?? 0) > MAX_BYTES) continue;
        const mime = String(d.mime_type ?? "");
        if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mime)) continue;
        const dl = await admin.storage.from(BUCKET).download(d.file_path as string);
        if (dl.error || !dl.data) continue;
        arquivos.push({ mime, base64: base64Encode(new Uint8Array(await dl.data.arrayBuffer())) });
      }
      if (!arquivos.length) return jsonResponse(req, 200, { campos: {} });
      const r = await lerDocumento(aiKey, codigo, arquivos);
      if (!r.ok) return jsonResponse(req, 200, { campos: {}, indisponivel: true });
      return jsonResponse(req, 200, { campos: r.campos });
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
