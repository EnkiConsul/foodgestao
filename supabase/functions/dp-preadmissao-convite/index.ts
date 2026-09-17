/**
 * Convite de Pré-Admissão (ação do gestor): criar, reenviar e cancelar.
 *
 * Só dono/administrador da empresa passa. Cargo e Unidade previstos são
 * validados como pertencentes à empresa antes de gravar. O link completo é
 * devolvido UMA vez na resposta; no banco fica apenas o hash.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { canAdminister, requireCompanyAccess, requireUser, serviceClient } from "../_shared/authz.ts";
import {
  VALIDADE_PADRAO_DIAS,
  gerarToken,
  hashToken,
  linkPreadmissao,
  normalizarWhatsapp,
  registrarEvento,
} from "../_shared/preadmissao.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const caller = await requireUser(req);
    if (!caller) return jsonError(req, "unauthorized");

    const body = await req.json().catch(() => ({}));
    const acao = String(body?.action ?? "").trim();
    const admin = serviceClient();
    const origin = req.headers.get("origin");
    const dias = Math.min(Math.max(Number(body?.dias_validade ?? VALIDADE_PADRAO_DIAS) || VALIDADE_PADRAO_DIAS, 1), 60);

    /** Autorização: sempre pela empresa lida no banco, nunca pelo corpo. */
    const autorizar = async (companyId: string) => {
      const access = await requireCompanyAccess(caller.id, companyId);
      return !!access && canAdminister(access);
    };

    if (acao === "criar") {
      const companyId = String(body?.company_id ?? "").trim();
      if (!companyId) return jsonError(req, "invalid_input", "company_id ausente");
      if (!(await autorizar(companyId))) return jsonError(req, "forbidden");

      const nome = String(body?.candidato_nome ?? "").trim();
      const whatsapp = normalizarWhatsapp(String(body?.whatsapp ?? ""));
      const cargoId = body?.cargo_previsto_id ? String(body.cargo_previsto_id) : null;
      const unidadeId = body?.unidade_prevista_id ? String(body.unidade_prevista_id) : null;
      const apos22h = body?.trabalho_apos_22h;
      if (nome.length < 3) return jsonError(req, "invalid_input", "nome curto");
      if (!whatsapp) return jsonResponse(req, 400, { error: "Informe o WhatsApp com DDD." });
      if (typeof apos22h !== "boolean") {
        return jsonResponse(req, 400, { error: "Informe se haverá trabalho após as 22h." });
      }

      if (cargoId) {
        const { data } = await admin.from("dp_cargos").select("id").eq("id", cargoId).eq("company_id", companyId).maybeSingle();
        if (!data) return jsonResponse(req, 400, { error: "Cargo previsto não pertence a esta empresa." });
      }
      if (unidadeId) {
        const { data } = await admin.from("dp_unidades").select("id").eq("id", unidadeId).eq("company_id", companyId).maybeSingle();
        if (!data) return jsonResponse(req, 400, { error: "Unidade prevista não pertence a esta empresa." });
      }

      const { data: pa, error } = await admin
        .from("dp_preadmissoes")
        .insert({
          company_id: companyId,
          candidato_nome: nome.toLocaleUpperCase("pt-BR"),
          whatsapp,
          cargo_previsto_id: cargoId,
          unidade_prevista_id: unidadeId,
          trabalho_apos_22h: apos22h,
          created_by: caller.id,
        })
        .select("id, company_id, whatsapp")
        .single();
      if (error || !pa) return jsonError(req, "internal", error?.message);

      const token = gerarToken();
      const { data: convite, error: cErr } = await admin
        .from("dp_preadmissao_convites")
        .insert({
          preadmissao_id: pa.id,
          company_id: companyId,
          token_hash: await hashToken(token),
          expires_at: new Date(Date.now() + dias * 86_400_000).toISOString(),
          created_by: caller.id,
        })
        .select("id, expires_at")
        .single();
      if (cErr || !convite) return jsonError(req, "internal", cErr?.message);

      await registrarEvento(admin, pa.id, companyId, "convite_criado", { dias }, caller.id);
      return jsonResponse(req, 200, {
        success: true,
        preadmissao_id: pa.id,
        // Número já normalizado (com DDI): a tela usa este valor no WhatsApp.
        whatsapp,
        link: linkPreadmissao(origin, convite.id as string, token),
        expires_at: convite.expires_at,
      });
    }

    const preadmissaoId = String(body?.preadmissao_id ?? "").trim();
    if (!preadmissaoId) return jsonError(req, "invalid_input", "preadmissao_id ausente");
    const { data: pa } = await admin
      .from("dp_preadmissoes")
      .select("id, company_id, status, whatsapp")
      .eq("id", preadmissaoId)
      .maybeSingle();
    if (!pa) return jsonError(req, "not_found");
    if (!(await autorizar(pa.company_id as string))) return jsonError(req, "forbidden");

    if (acao === "reenviar") {
      if (["cancelado", "concluido"].includes(pa.status as string)) {
        return jsonResponse(req, 409, { error: "Esta pré-admissão já foi encerrada." });
      }
      const token = gerarToken();
      await admin.from("dp_preadmissao_convites").update({ revoked_at: new Date().toISOString() })
        .eq("preadmissao_id", pa.id).is("revoked_at", null);
      const { data: convite, error } = await admin
        .from("dp_preadmissao_convites")
        .insert({
          preadmissao_id: pa.id,
          company_id: pa.company_id,
          token_hash: await hashToken(token),
          expires_at: new Date(Date.now() + dias * 86_400_000).toISOString(),
          created_by: caller.id,
        })
        .select("id, expires_at")
        .single();
      if (error || !convite) return jsonError(req, "internal", error?.message);
      if (pa.status === "expirado") {
        await admin.from("dp_preadmissoes").update({ status: "aguardando_preenchimento" }).eq("id", pa.id);
      }
      await registrarEvento(admin, pa.id, pa.company_id as string, "convite_reenviado", { dias }, caller.id);
      return jsonResponse(req, 200, {
        success: true,
        whatsapp: pa.whatsapp,
        link: linkPreadmissao(origin, convite.id as string, token),
        expires_at: convite.expires_at,
      });
    }

    if (acao === "revogar") {
      await admin.from("dp_preadmissao_convites").update({ revoked_at: new Date().toISOString() })
        .eq("preadmissao_id", pa.id).is("revoked_at", null);
      await admin.from("dp_preadmissoes").update({ status: "cancelado" }).eq("id", pa.id);
      await registrarEvento(admin, pa.id, pa.company_id as string, "cancelada", {}, caller.id);
      return jsonResponse(req, 200, { success: true, status: "cancelado" });
    }

    return jsonError(req, "invalid_input", "ação desconhecida");
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
