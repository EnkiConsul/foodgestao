/**
 * Termo de Primeiro Acesso para quem já usa o portal.
 *
 * Colaboradores ativados antes da existência do termo aceitam no próximo
 * acesso. Ação "status" informa se a versão vigente já foi aceita; ação
 * "aceitar" grava o aceite. O colaborador vem sempre da sessão (servidor) e a
 * impressão digital é calculada da cópia do servidor — nunca do navegador.
 * Idempotente: índice único por colaborador e versão.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { callerClient, requireUser, serviceClient } from "../_shared/authz.ts";
import { recordEdgeError } from "../_shared/error-log.ts";
import { sha256Hex } from "../_shared/rate-limit.ts";
import {
  TERMO_PORTAL_MODELO,
  TERMO_PORTAL_PARAGRAFOS,
  TERMO_PORTAL_TITULO,
  TERMO_PORTAL_VERSAO,
  termoPortalConteudo,
} from "../_shared/termo-portal.ts";

const FUNCAO = "dp-termo-portal";
const Body = z.object({
  acao: z.enum(["status", "aceitar"]),
  versao: z.string().max(20).optional(),
});

function resp(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return resp(405, { error: "Método inválido." });

  try {
    const caller = await requireUser(req);
    if (!caller) return resp(401, { error: "Sessão expirada. Entre novamente." });

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return resp(400, { error: "Pedido inválido." });

    const cliente = callerClient(caller.token);
    const admin = serviceClient();

    const { data: colabId } = await cliente.rpc("dp_colaborador_ativo_of", { _user_id: caller.id });
    if (!colabId) return resp(403, { error: "Seu acesso não permite esta ação agora." });

    const { data: colab } = await admin
      .from("dp_colaboradores")
      .select("id, company_id, user_id")
      .eq("id", colabId)
      .maybeSingle();
    if (!colab || colab.user_id !== caller.id) {
      return resp(403, { error: "Seu acesso não permite esta ação agora." });
    }

    const { data: existente, error: selErr } = await admin
      .from("dp_documento_aceites")
      .select("id")
      .eq("colaborador_id", colab.id)
      .eq("modelo", TERMO_PORTAL_MODELO)
      .eq("modelo_versao", TERMO_PORTAL_VERSAO)
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;

    if (parsed.data.acao === "status") {
      return resp(200, { aceito: !!existente, versao: TERMO_PORTAL_VERSAO });
    }

    if (parsed.data.versao !== TERMO_PORTAL_VERSAO) {
      return resp(409, {
        code: "termo_desatualizado",
        error: "O termo foi atualizado. Recarregue a página para ler a versão atual.",
      });
    }
    if (existente) return resp(200, { aceito: true, aceite_id: existente.id });

    const { data: novo, error: insErr } = await admin
      .from("dp_documento_aceites")
      .insert({
        company_id: colab.company_id,
        colaborador_id: colab.id,
        modelo: TERMO_PORTAL_MODELO,
        modelo_versao: TERMO_PORTAL_VERSAO,
        conteudo_hash: await sha256Hex(termoPortalConteudo()),
        hash_origem: "sha256_conteudo",
        aceito_por: caller.id,
        ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400) || null,
        documento_snapshot: {
          titulo: TERMO_PORTAL_TITULO,
          versao: TERMO_PORTAL_VERSAO,
          paragrafos: TERMO_PORTAL_PARAGRAFOS,
          origem: "portal_proximo_acesso",
        },
      })
      .select("id")
      .maybeSingle();
    if (insErr && insErr.code !== "23505") throw insErr;

    return resp(200, { aceito: true, aceite_id: novo?.id ?? null });
  } catch (e) {
    await recordEdgeError({ functionName: FUNCAO, action: "termo de acesso ao portal", error: e });
    return resp(500, { error: "Não foi possível registrar o aceite agora." });
  }
});
