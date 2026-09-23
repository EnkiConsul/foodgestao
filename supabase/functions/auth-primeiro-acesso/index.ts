/**
 * Primeiro acesso: a própria pessoa (sessão válida) define a senha nova.
 *
 * A troca da senha e a baixa da marca "precisa trocar a senha" acontecem aqui,
 * no servidor, juntas — o navegador não pode escrever no estado de segurança.
 * Só baixa a marca quando a senha foi realmente trocada nesta chamada.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { requireUser, serviceClient } from "../_shared/authz.ts";
import { avaliarSenha } from "../_shared/password-policy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const user = await requireUser(req);
    if (!user) return jsonError(req, "unauthorized");

    const body = await req.json().catch(() => ({}));
    const novaSenha = typeof body?.nova_senha === "string" ? body.nova_senha : "";
    const av = avaliarSenha(novaSenha);
    if (!av.valida) return jsonResponse(req, 400, { error: av.mensagem ?? "Senha fraca." });

    const admin = serviceClient();
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: novaSenha });
    if (updErr) {
      return jsonResponse(req, 400, { error: updErr.message ?? "Não foi possível salvar essa senha." });
    }

    const { error: secErr } = await admin.from("auth_user_security_state").upsert(
      {
        user_id: user.id,
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
        password_changed_by: user.id,
      },
      { onConflict: "user_id" },
    );
    if (secErr) {
      console.error("[auth-primeiro-acesso] security_state:", secErr.message);
      return jsonError(req, "internal", "falha ao registrar a troca de senha");
    }

    return jsonResponse(req, 200, { success: true });
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
