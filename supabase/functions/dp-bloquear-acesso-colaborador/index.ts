/**
 * Bloqueia (ou reativa) o acesso do colaborador ao portal — caminho único.
 *
 * Só dono/administrador da empresa do colaborador. Bloquear invalida os códigos
 * pendentes e encerra as sessões abertas.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { requireColaboradorAdmin } from "../_shared/authz.ts";
import { registrarEvento, revogarSessoes } from "../_shared/portal-access.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const body = await req.json().catch(() => ({}));
    const colaboradorId = String(body?.colaborador_id ?? "").trim();
    const bloquear = body?.bloquear !== false;
    if (!colaboradorId) return jsonError(req, "invalid_input", "colaborador_id ausente");

    const auth = await requireColaboradorAdmin(req, colaboradorId);
    if (!auth.ok) return jsonError(req, auth.reason);
    const { caller, colaborador: colab, admin } = auth;

    if (colab.user_id === caller.id) return jsonError(req, "invalid_input", "auto bloqueio");
    if (!colab.user_id) return jsonError(req, "invalid_input", "sem acesso");

    const agora = new Date().toISOString();
    const { error: secErr } = await admin.from("auth_user_security_state").upsert(
      {
        user_id: colab.user_id,
        access_blocked: bloquear,
        blocked_at: bloquear ? agora : null,
        blocked_by: bloquear ? caller.id : null,
        sessions_revoked_at: bloquear ? agora : null,
      },
      { onConflict: "user_id" },
    );
    if (secErr) return jsonError(req, "internal", secErr.message);

    if (bloquear) {
      await admin
        .from("dp_portal_access_tokens")
        .update({ consumed_at: agora })
        .eq("user_id", colab.user_id)
        .is("consumed_at", null);
    }

    let sessoesRevogadas = false;
    if (bloquear) sessoesRevogadas = await revogarSessoes(colab.user_id);

    await registrarEvento(admin, bloquear ? "access_blocked" : "access_unblocked", {
      actorUserId: caller.id,
      targetUserId: colab.user_id,
      companyId: colab.company_id,
      colaboradorId: colab.id,
    });

    return jsonResponse(req, 200, { success: true, bloqueado: bloquear, sessoes_revogadas: sessoesRevogadas });
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
