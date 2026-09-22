/**
 * Libera o acesso do colaborador ao portal — caminho único de criação de conta.
 *
 * O gestor não define nem recebe senha: a função cria a conta (login pelo CPF)
 * com uma senha aleatória descartada e devolve apenas um link de ativação de
 * uso único, para o colaborador criar a própria senha.
 *
 * Nunca há busca global por e-mail/CPF nem reaproveitamento automático de conta:
 * se já existir conta com aquele login sem vínculo com este cadastro, a operação
 * falha fechada, preserva os dados e devolve um erro administrativo claro.
 */

import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { requireColaboradorAdmin } from "../_shared/authz.ts";
import {
  emitirToken,
  gerarCodigo,
  linkDeAcesso,
  mensagemSituacao,
  registrarEvento,
  situacaoAcesso,
} from "../_shared/portal-access.ts";

const SYNTHETIC_EMAIL_DOMAIN = "portal.360food.local";

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Erro do GoTrue que indica login já existente. */
function jaRegistrado(msg: string | undefined): boolean {
  const m = (msg ?? "").toLowerCase();
  return (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("already exists") ||
    m.includes("duplicate key")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const body = await req.json().catch(() => ({}));
    const colaboradorId = String(body?.colaborador_id ?? "").trim();
    if (!colaboradorId) return jsonError(req, "invalid_input", "colaborador_id ausente");

    const auth = await requireColaboradorAdmin(req, colaboradorId);
    if (!auth.ok) return jsonError(req, auth.reason);
    const { caller, colaborador: colab, admin } = auth;

    const cpf = digitsOnly(colab.cpf);
    if (cpf.length !== 11) {
      return jsonResponse(req, 400, {
        error: "O CPF do colaborador está incompleto. Complete o cadastro antes de liberar o acesso.",
      });
    }

    // Falha fechada: bloqueio, vínculo encerrado, cadastro removido ou empresa
    // inativa impedem liberar acesso. Reativar é sempre uma ação explícita.
    const situacao = await situacaoAcesso(admin, colab.id);
    const impedimento = mensagemSituacao(situacao);
    if (impedimento) {
      return jsonResponse(req, 409, { code: situacao, error: impedimento });
    }

    const origin = req.headers.get("origin");
    let targetUserId = colab.user_id as string | null;

    if (!targetUserId) {
      const email = `cpf${cpf}@${SYNTHETIC_EMAIL_DOMAIN}`;

      // Conflito de cadastro: o mesmo CPF já é login de outro colaborador.
      const { data: existente } = await admin
        .from("dp_colaboradores")
        .select("id")
        .eq("email_portal", email)
        .neq("id", colab.id)
        .maybeSingle();
      if (existente) {
        return jsonResponse(req, 409, {
          code: "conflito_cadastro",
          error:
            "Este CPF já está em uso como login de outro cadastro de colaborador. " +
            "Verifique se há cadastro duplicado antes de liberar o acesso.",
        });
      }

      const created = await admin.auth.admin.createUser({
        email,
        // Senha aleatória descartada: nunca sai daqui, nunca é usada para entrar.
        password: `${gerarCodigo(20)}aA1!`,
        email_confirm: true,
        user_metadata: { colaborador_id: colab.id, kind: "dp_colaborador", cpf, nome: colab.nome },
      });

      if (created.error && jaRegistrado(created.error.message)) {
        // Falha fechada: existe conta com este login e ela não pertence a este
        // cadastro. Nada é vinculado, nada é sobrescrito.
        console.error("[dp-criar-acesso-colaborador] conflito de conta para colaborador", colab.id);
        return jsonResponse(req, 409, {
          code: "conflito_cadastro",
          error:
            "Já existe uma conta de acesso com este CPF que não está vinculada a este cadastro. " +
            "Peça a revisão do cadastro do CPF ao suporte antes de liberar o acesso.",
        });
      }
      if (created.error || !created.data.user) {
        return jsonError(req, "internal", created.error?.message ?? "createUser falhou");
      }
      targetUserId = created.data.user.id;

      const { error: linkErr } = await admin
        .from("dp_colaboradores")
        .update({ user_id: targetUserId, email_portal: email })
        .eq("id", colab.id)
        .is("user_id", null);
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
