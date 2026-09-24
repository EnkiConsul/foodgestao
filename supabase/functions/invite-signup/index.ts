/**
 * Primeiro acesso por convite (público). O token do convite é a prova de posse
 * do link enviado por WhatsApp/e-mail.
 *  - action "info": dados mínimos do convite para a tela.
 *  - action "criar_conta": cria a conta com a senha escolhida e aplica o convite.
 * Se já existir conta com aquele e-mail/WhatsApp, não cria nada: a pessoa entra
 * e aceita o convite (fluxo accept-invite).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { ipRateLimited } from "../_shared/rate-limit.ts";
import { avaliarSenha } from "../_shared/password-policy.ts";
import { aplicarGrupoConvite, waEmail } from "../_shared/company-invite-accept.ts";

const Body = z.object({
  action: z.enum(["info", "criar_conta"]),
  token: z.string().trim().min(16).max(256).regex(/^[0-9a-f]+$/i),
  password: z.string().max(200).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input");

  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError(req, "invalid_input");
    const { action, token, password } = parsed.data;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (await ipRateLimited(admin, req, `invite-signup:${action}`, action === "info" ? 60 : 10)) {
      return jsonError(req, "rate_limited");
    }

    const { data: invite } = await admin
      .from("company_invites")
      .select("id, grupo_id, full_name, whatsapp, invited_email, expires_at, status, companies(name)")
      .eq("token", token)
      .maybeSingle();

    if (!invite || invite.status !== "pending") {
      return jsonResponse(req, 404, { code: "invalido", error: "Convite não encontrado ou já utilizado." });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await admin.from("company_invites").update({ status: "expired" }).eq("grupo_id", invite.grupo_id).eq("status", "pending");
      return jsonResponse(req, 410, { code: "expirado", error: "Este convite expirou. Peça um novo ao administrador." });
    }

    const loginEmail = invite.invited_email
      ? String(invite.invited_email).toLowerCase()
      : waEmail(String(invite.whatsapp ?? ""));

    const { data: existente } = await admin.rpc("resolve_login_identifier", { _identifier: loginEmail });
    const contaExiste = Array.isArray(existente) && existente.length > 0;

    if (action === "info") {
      const { data: grupo } = await admin
        .from("company_invites").select("companies(name)").eq("grupo_id", invite.grupo_id).eq("status", "pending");
      return jsonResponse(req, 200, {
        nome: invite.full_name,
        empresas: (grupo ?? []).map((g: any) => g.companies?.name).filter(Boolean),
        login: invite.invited_email ? "email" : "whatsapp",
        login_hint: invite.invited_email
          ? String(invite.invited_email).replace(/^(.{2}).*(@.*)$/, "$1***$2")
          : `(**) *****-${String(invite.whatsapp ?? "").slice(-4)}`,
        conta_existe: contaExiste,
      });
    }

    if (contaExiste) {
      return jsonResponse(req, 409, { code: "conta_existe", error: "Você já tem conta. Entre com sua senha para aceitar o convite." });
    }
    const aval = avaliarSenha(password ?? "", { nome: invite.full_name, email: invite.invited_email });
    if (!aval.valida) return jsonResponse(req, 400, { code: "senha_fraca", error: aval.mensagem });

    const created = await admin.auth.admin.createUser({
      email: loginEmail,
      password: password!,
      email_confirm: true,
      user_metadata: { full_name: invite.full_name, whatsapp: invite.whatsapp, kind: "company_invite" },
    });
    if (created.error || !created.data.user) {
      return jsonResponse(req, 409, { code: "conta_existe", error: "Não foi possível criar a conta. Tente entrar com sua senha." });
    }
    const userId = created.data.user.id;

    await admin.from("profiles").update({ full_name: invite.full_name, phone: invite.whatsapp }).eq("user_id", userId);
    const empresas = await aplicarGrupoConvite(admin, invite.grupo_id, userId);

    return jsonResponse(req, 200, { success: true, login_email: loginEmail, empresas });
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
