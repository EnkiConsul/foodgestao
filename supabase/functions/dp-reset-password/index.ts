/**
 * Pede a redefinição do acesso do colaborador ao portal.
 *
 * Não gera senha: invalida códigos pendentes e devolve um link de uso único
 * para o colaborador criar a nova senha. O gestor nunca vê a senha.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { canAdminister, requireCompanyAccess, requireUser, serviceClient } from "../_shared/authz.ts";
import { emitirToken, linkDeAcesso, registrarEvento } from "../_shared/portal-access.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const caller = await requireUser(req);
    if (!caller) return jsonError(req, "unauthorized");

    const body = await req.json().catch(() => ({}));
    const colaboradorId = String(body?.colaborador_id ?? "").trim();
    if (!colaboradorId) return jsonError(req, "invalid_input", "colaborador_id ausente");

    const admin = serviceClient();

    const { data: colab } = await admin
      .from("dp_colaboradores")
      .select("id, cpf, user_id, company_id")
      .eq("id", colaboradorId)
      .maybeSingle();
    if (!colab) return jsonError(req, "not_found");

    const { data: isSuper } = await admin.rpc("has_role", {
      _user_id: caller.id,
      _role: "super_admin",
    });
    const access = await requireCompanyAccess(caller.id, colab.company_id);
    if (!isSuper && (!access || !canAdminister(access))) return jsonError(req, "forbidden");

    if (!colab.user_id) {
      return jsonResponse(req, 400, {
        error: "Este colaborador ainda não tem acesso ao portal. Use 'Liberar acesso'.",
      });
    }

    const { tokenId, codigo, expiresAt } = await emitirToken(admin, {
      userId: colab.user_id,
      colaboradorId: colab.id,
      companyId: colab.company_id,
      purpose: "reset",
      createdBy: caller.id,
    });

    const { error: secErr } = await admin.from("auth_user_security_state").upsert(
      { user_id: colab.user_id, must_change_password: true },
      { onConflict: "user_id" },
    );
    if (secErr) console.error("[dp-reset-password] security_state:", secErr.message);

    await registrarEvento(admin, "password_reset_requested", {
      actorUserId: caller.id,
      targetUserId: colab.user_id,
      companyId: colab.company_id,
      colaboradorId: colab.id,
    });

    return jsonResponse(req, 200, {
      success: true,
      status: "reset_solicitado",
      cpf: (colab.cpf ?? "").replace(/\D/g, ""),
      reset_url: linkDeAcesso(req.headers.get("origin"), "reset", tokenId, codigo),
      expires_at: expiresAt,
    });
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
