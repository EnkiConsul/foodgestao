/**
 * O colaborador define a própria senha do portal.
 *
 * Chamada pública (sem sessão): a identidade vem do código de uso único, nunca
 * de um id enviado pelo navegador. Não existe caminho administrativo aqui — o
 * gestor não define nem conhece a senha de ninguém.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { serviceClient } from "../_shared/authz.ts";
import { consumirToken, registrarEvento } from "../_shared/portal-access.ts";

const tentativas = new Map<string, number[]>();
function limitado(chave: string): boolean {
  const agora = Date.now();
  const arr = (tentativas.get(chave) ?? []).filter((t) => agora - t < 60_000);
  arr.push(agora);
  tentativas.set(chave, arr);
  return arr.length > 8;
}

function senhaForte(s: string): boolean {
  return (
    s.length >= 8 &&
    s.length <= 72 &&
    /[A-Z]/.test(s) &&
    /[a-z]/.test(s) &&
    /[0-9]/.test(s) &&
    /[^A-Za-z0-9]/.test(s)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const ip = req.headers.get("x-forwarded-for") ?? "sem-ip";
    if (limitado(ip)) return jsonError(req, "rate_limited");

    const body = await req.json().catch(() => ({}));
    const cpf = String(body?.cpf ?? "").replace(/\D/g, "");
    const codigo = String(body?.codigo ?? "").trim().toUpperCase();
    const novaSenha = typeof body?.nova_senha === "string" ? body.nova_senha : "";

    if (cpf.length !== 11 || codigo.length < 8) return jsonError(req, "invalid_input", "payload incompleto");
    if (!senhaForte(novaSenha)) {
      return jsonResponse(req, 400, {
        error:
          "A senha precisa ter ao menos 8 caracteres, com maiúscula, minúscula, número e um símbolo.",
      });
    }

    const admin = serviceClient();

    const { data: colab } = await admin
      .from("dp_colaboradores")
      .select("id, user_id, company_id")
      .eq("cpf", cpf)
      .not("user_id", "is", null)
      .maybeSingle();
    if (!colab?.user_id) {
      return jsonResponse(req, 400, { error: "Link inválido ou já utilizado." });
    }

    const token = await consumirToken(admin, colab.user_id, codigo);
    if (!token || token.colaborador_id !== colab.id) {
      return jsonResponse(req, 400, { error: "Link inválido, expirado ou já utilizado." });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(colab.user_id, {
      password: novaSenha,
    });
    if (updErr) {
      return jsonResponse(req, 400, {
        error: "Não foi possível salvar essa senha. Tente outra combinação.",
      });
    }

    const { error: secErr } = await admin.from("auth_user_security_state").upsert(
      {
        user_id: colab.user_id,
        must_change_password: false,
        access_blocked: false,
        password_changed_at: new Date().toISOString(),
        password_changed_by: colab.user_id,
      },
      { onConflict: "user_id" },
    );
    if (secErr) console.error("[dp-definir-senha] security_state:", secErr.message);

    await registrarEvento(
      admin,
      token.purpose === "activation" ? "access_activated" : "password_reset_completed",
      {
        actorUserId: colab.user_id,
        targetUserId: colab.user_id,
        companyId: colab.company_id,
        colaboradorId: colab.id,
      },
    );

    return jsonResponse(req, 200, { success: true });
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
