/**
 * Registro do aceite eletrônico de um documento — porta única do servidor.
 *
 * O cliente envia apenas o identificador do documento. O servidor:
 *  1. valida o token de quem pediu;
 *  2. confere o colaborador ativo ligado a esse usuário (regra do portal);
 *  3. confere que o documento é daquele colaborador e daquela empresa;
 *  4. lê os bytes do arquivo no armazenamento privado e calcula o SHA-256;
 *  5. chama a operação de banco que valida tudo novamente e grava o aceite
 *     de forma atômica e idempotente.
 *
 * Fail closed: qualquer divergência recusa com frase de negócio.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { callerClient, requireUser, serviceClient } from "../_shared/authz.ts";
import { garantirHashDocumento } from "../_shared/doc-hash.ts";
import { recordEdgeError } from "../_shared/error-log.ts";

const BUCKET = "dp-documentos";
const FUNCAO = "dp-documento-aceitar";

const Body = z.object({ documento_id: z.string().uuid() });

const FRASES: Record<string, { status: number; frase: string }> = {
  nao_autenticado: { status: 401, frase: "Sessão expirada. Entre novamente." },
  sem_acesso_portal: { status: 403, frase: "Seu acesso não permite assinar documentos agora." },
  documento_indisponivel: { status: 403, frase: "Este documento não está disponível para você." },
  documento_de_outro_colaborador: { status: 403, frase: "Este documento não está disponível para você." },
  documento_de_outra_empresa: { status: 403, frase: "Este documento não está disponível para você." },
  colaborador_de_outra_empresa: { status: 403, frase: "Este documento não está disponível para você." },
  documento_nao_exige_aceite: { status: 409, frase: "Este documento não precisa de assinatura." },
  documento_sem_arquivo: { status: 409, frase: "O arquivo deste documento ainda não está disponível." },
  conteudo_nao_conferido: { status: 409, frase: "Não foi possível conferir o conteúdo do documento agora. Tente novamente em instantes." },
};

function erro(status: number, mensagem: string): Response {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return erro(405, "Método inválido.");

  try {
    const caller = await requireUser(req);
    if (!caller) return erro(401, "Sessão expirada. Entre novamente.");

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return erro(400, "Documento inválido.");
    const documentoId = parsed.data.documento_id;

    const cliente = callerClient(caller.token);
    const admin = serviceClient();

    // Colaborador ativo do usuário logado — derivado no servidor.
    const { data: colabId } = await cliente.rpc("dp_colaborador_ativo_of", { _user_id: caller.id });
    if (!colabId) return erro(403, FRASES.sem_acesso_portal.frase);

    const { data: doc } = await admin
      .from("dp_documentos")
      .select(
        "id, company_id, colaborador_id, file_path, arquivo_sha256, exige_aceite, ciclo_status, arquivado_em, aprovacao_status",
      )
      .eq("id", documentoId)
      .maybeSingle();

    if (
      !doc ||
      doc.colaborador_id !== colabId ||
      doc.arquivado_em ||
      (doc.ciclo_status ?? "ativo") !== "ativo" ||
      (doc.aprovacao_status ?? "aprovado") !== "aprovado"
    ) {
      return erro(403, FRASES.documento_indisponivel.frase);
    }
    if (doc.exige_aceite !== true) return erro(409, FRASES.documento_nao_exige_aceite.frase);
    if (!doc.file_path) return erro(409, FRASES.documento_sem_arquivo.frase);

    const { hash } = await garantirHashDocumento(admin, BUCKET, doc as never);
    if (!hash) return erro(409, FRASES.conteudo_nao_conferido.frase);

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    const { data: aceiteId, error } = await cliente.rpc("dp_documento_aceitar", {
      _documento_id: documentoId,
      _user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500) || null,
      _ip: ip,
    });

    if (error) {
      const chave = Object.keys(FRASES).find((k) => String(error.message ?? "").includes(k));
      if (chave) return erro(FRASES[chave].status, FRASES[chave].frase);
      await recordEdgeError({
        functionName: FUNCAO,
        action: "registrar assinatura do documento",
        error,
        companyId: doc.company_id,
        details: { documento_id: documentoId },
      });
      return erro(500, "Não foi possível registrar a assinatura agora.");
    }

    return new Response(JSON.stringify({ aceite_id: aceiteId, conteudo_hash: hash }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await recordEdgeError({ functionName: FUNCAO, action: "registrar assinatura do documento", error: e });
    return erro(500, "Não foi possível registrar a assinatura agora.");
  }
});
