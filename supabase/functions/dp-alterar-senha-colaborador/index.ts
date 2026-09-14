/**
 * O colaborador define a própria senha do portal.
 *
 * Chamada pública (sem sessão): a identidade autorizada vem do próprio registro
 * do link de uso único — nunca de um id enviado pelo navegador e nunca de uma
 * busca por CPF. O CPF serve apenas como confirmação de que quem está na tela é
 * o colaborador daquele link. O gestor não define nem conhece a senha.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { serviceClient } from "../_shared/authz.ts";
import { ipRateLimited, isRateLimited, sha256Hex } from "../_shared/rate-limit.ts";
import {
  confirmarToken,
  liberarToken,
  registrarEvento,
  reservarToken,
  type Purpose,
} from "../_shared/portal-access.ts";

const MAX_POR_IP = 20;
const MAX_POR_TOKEN = 8;

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
    const admin = serviceClient();

    // Limite persistente (compartilhado entre instâncias), por IP e por link.
    if (await ipRateLimited(admin, req, "dp_definir_senha", MAX_POR_IP)) {
      return jsonError(req, "rate_limited");
    }

    const body = await req.json().catch(() => ({}));
    const cpf = String(body?.cpf ?? "").replace(/\D/g, "");
    const tokenId = String(body?.token_id ?? "").trim();
    const codigo = String(body?.codigo ?? "").trim().toUpperCase();
    const purposeBruto = String(body?.purpose ?? "");
    const novaSenha = typeof body?.nova_senha === "string" ? body.nova_senha : "";

    if (purposeBruto !== "activation" && purposeBruto !== "reset") {
      return jsonError(req, "invalid_input", "finalidade inválida");
    }
    const purpose = purposeBruto as Purpose;

    if (cpf.length !== 11 || !tokenId || codigo.length < 8) {
      return jsonError(req, "invalid_input", "payload incompleto");
    }
    if (!senhaForte(novaSenha)) {
      return jsonResponse(req, 400, {
        error:
          "A senha precisa ter ao menos 8 caracteres, com maiúscula, minúscula, número e um símbolo.",
      });
    }

    const chaveToken = await sha256Hex(`dp_definir_senha:token:${tokenId}`);
    if (await isRateLimited(admin, "dp_definir_senha_token", chaveToken, MAX_POR_TOKEN)) {
      return jsonError(req, "rate_limited");
    }

    // 1) Reserva exclusiva do link, já conferindo hash, prazo e finalidade.
    const token = await reservarToken(admin, tokenId, codigo, purpose);
    if (!token) {
      return jsonResponse(req, 400, { error: "Link inválido, expirado ou já utilizado." });
    }

    // 2) O CPF informado tem que ser o do colaborador desse link.
    const { data: colab, error: colabErr } = await admin
      .from("dp_colaboradores")
      .select("id, cpf, user_id, company_id")
      .eq("id", token.colaborador_id)
      .maybeSingle();
    if (colabErr) {
      await liberarToken(admin, token.id);
      return jsonError(req, "internal", "falha ao validar o cadastro");
    }
    const cpfCadastro = String(colab?.cpf ?? "").replace(/\D/g, "");
    if (
      !colab ||
      colab.user_id !== token.user_id ||
      colab.company_id !== token.company_id ||
      cpfCadastro !== cpf
    ) {
      await liberarToken(admin, token.id);
      return jsonResponse(req, 400, { error: "Link inválido, expirado ou já utilizado." });
    }

    // 3) Troca a senha; se falhar, o link volta a valer.
    const { error: updErr } = await admin.auth.admin.updateUserById(token.user_id, {
      password: novaSenha,
    });
    if (updErr) {
      await liberarToken(admin, token.id);
      return jsonResponse(req, 400, {
        error: "Não foi possível salvar essa senha. Tente outra combinação.",
      });
    }

    // 4) Só agora o link é definitivamente queimado.
    await confirmarToken(admin, token.id);

    const { error: secErr } = await admin.from("auth_user_security_state").upsert(
      {
        user_id: token.user_id,
        must_change_password: false,
        access_blocked: false,
        password_changed_at: new Date().toISOString(),
        password_changed_by: token.user_id,
      },
      { onConflict: "user_id" },
    );
    if (secErr) console.error("[dp-definir-senha] security_state:", secErr.message);

    await registrarEvento(
      admin,
      purpose === "activation" ? "access_activated" : "password_reset_completed",
      {
        actorUserId: token.user_id,
        targetUserId: token.user_id,
        companyId: token.company_id,
        colaboradorId: token.colaborador_id,
      },
    );

    return jsonResponse(req, 200, { success: true });
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
