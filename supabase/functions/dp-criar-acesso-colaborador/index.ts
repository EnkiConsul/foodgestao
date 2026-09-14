/**
 * Libera o acesso do colaborador ao portal.
 *
 * O gestor não define nem recebe senha: a função cria a conta (login pelo CPF)
 * com uma senha aleatória descartada e devolve apenas um link de ativação de
 * uso único, para o colaborador criar a própria senha.
 */

import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { canAdminister, requireCompanyAccess, requireUser, serviceClient } from "../_shared/authz.ts";
import { emitirToken, gerarCodigo, linkDeAcesso, registrarEvento } from "../_shared/portal-access.ts";

const SYNTHETIC_EMAIL_DOMAIN = "portal.360food.local";

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

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
      .select("id, cpf, user_id, nome, company_id, email_portal")
      .eq("id", colaboradorId)
      .maybeSingle();
    if (!colab) return jsonError(req, "not_found");

    // Autorização sempre pela empresa do colaborador (nunca pelo corpo do pedido)
    const { data: isSuper } = await admin.rpc("has_role", {
      _user_id: caller.id,
      _role: "super_admin",
    });
    const access = await requireCompanyAccess(caller.id, colab.company_id);
    if (!isSuper && (!access || !canAdminister(access))) return jsonError(req, "forbidden");

    const cpf = digitsOnly(colab.cpf);
    if (cpf.length !== 11) {
      return jsonResponse(req, 400, {
        error: "O CPF do colaborador está incompleto. Complete o cadastro antes de liberar o acesso.",
      });
    }

    const origin = req.headers.get("origin");
    let targetUserId = colab.user_id as string | null;

    if (!targetUserId) {
      const email = `cpf${cpf}@${SYNTHETIC_EMAIL_DOMAIN}`;

      // Já existe conta com este login? Reaproveita em vez de duplicar.
      const { data: existente } = await admin
        .from("dp_colaboradores")
        .select("id")
        .eq("email_portal", email)
        .neq("id", colab.id)
        .maybeSingle();
      if (existente) return jsonError(req, "conflict", "cpf já vinculado a outro colaborador");

      const created = await admin.auth.admin.createUser({
        email,
        // Senha aleatória descartada: nunca sai daqui, nunca é usada para entrar.
        password: `${gerarCodigo(20)}aA1!`,
        email_confirm: true,
        user_metadata: { colaborador_id: colab.id, kind: "dp_colaborador", cpf, nome: colab.nome },
      });
      if (created.error || !created.data.user) {
        return jsonError(req, "internal", created.error?.message ?? "createUser falhou");
      }
      targetUserId = created.data.user.id;

      const { error: linkErr } = await admin
        .from("dp_colaboradores")
        .update({ user_id: targetUserId, email_portal: email })
        .eq("id", colab.id);
      if (linkErr) return jsonError(req, "internal", linkErr.message);

      await admin.from("user_roles").upsert(
        { user_id: targetUserId, role: "dp_colaborador" },
        { onConflict: "user_id,role" },
      );
    }

    const { error: secErr } = await admin.from("auth_user_security_state").upsert(
      {
        user_id: targetUserId,
        must_change_password: true,
        access_blocked: false,
        provisional_password_issued_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (secErr) console.error("[dp-criar-acesso-colaborador] security_state:", secErr.message);

    const { tokenId, codigo, expiresAt } = await emitirToken(admin, {
      userId: targetUserId!,
      colaboradorId: colab.id,
      companyId: colab.company_id,
      purpose: "activation",
      createdBy: caller.id,
    });

    await registrarEvento(admin, "access_activation_requested", {
      actorUserId: caller.id,
      targetUserId: targetUserId!,
      companyId: colab.company_id,
      colaboradorId: colab.id,
    });

    return jsonResponse(req, 200, {
      success: true,
      status: "pendente_ativacao",
      cpf,
      activation_url: linkDeAcesso(origin, "activation", tokenId, codigo),
      expires_at: expiresAt,
    });
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
