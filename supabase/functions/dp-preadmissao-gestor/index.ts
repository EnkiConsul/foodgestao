/**
 * Revisão da Pré-Admissão pelo gestor.
 *
 * Usa o MESMO módulo de regras do candidato (checklist e bloqueio trabalhista),
 * então não existe divergência entre o que o candidato vê e o que o gestor
 * cobra. Toda ação exige dono/administrador da empresa lida no banco.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { canAdminister, requireCompanyAccess, requireUser, serviceClient } from "../_shared/authz.ts";
import { registrarEvento, requisitosPrevistos, type Preadmissao } from "../_shared/preadmissao.ts";
import { bloqueioMenorNoturno, montarChecklist, pendenciasDocumentais } from "../_shared/preadmissao-checklist.ts";

/** Situações em que a ficha pode seguir para a contabilidade. */
const PODE_PREPARAR = ["aguardando_revisao", "correcao_solicitada", "aguardando_nova_versao"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const caller = await requireUser(req);
    if (!caller) return jsonError(req, "unauthorized");
    const admin = serviceClient();
    const body = await req.json().catch(() => ({}));
    const acao = String(body?.action ?? "ler").trim();
    const id = String(body?.preadmissao_id ?? "").trim();
    if (!id) return jsonError(req, "invalid_input", "preadmissao_id ausente");

    const { data: paRow } = await admin.from("dp_preadmissoes").select("*").eq("id", id).maybeSingle();
    if (!paRow) return jsonError(req, "not_found");
    const pa = paRow as unknown as Preadmissao;
    const access = await requireCompanyAccess(caller.id, pa.company_id);
    if (!access || !canAdminister(access)) return jsonError(req, "forbidden");

    const montar = async () => {
      const [{ data: pessoas }, { data: docs }, reqs, { data: eventos }] = await Promise.all([
        admin.from("dp_preadmissao_pessoas").select("*").eq("preadmissao_id", pa.id).order("created_at"),
        admin
          .from("dp_preadmissao_documentos")
          .select("id, requisito_codigo, pessoa_id, file_name, status, versao, created_at, substituido_em")
          .eq("preadmissao_id", pa.id)
          .order("created_at", { ascending: false }),
        requisitosPrevistos(admin, pa),
        admin.from("dp_preadmissao_eventos").select("evento, detalhe, created_at").eq("preadmissao_id", pa.id)
          .order("created_at", { ascending: false }).limit(50),
      ]);
      const dados = (pa.dados ?? {}) as Record<string, unknown>;
      const vigentes = (docs ?? []).filter((d) => !d.substituido_em);
      const checklist = montarChecklist({
        ficha: { data_nascimento: pa.data_nascimento, estado_civil: pa.estado_civil, sexo: (dados.sexo as string) ?? null },
        pessoas: (pessoas ?? []) as never,
        requisitosCargo: reqs.cargo,
        requisitosUnidade: reqs.unidade,
      });
      const pendencias = pendenciasDocumentais(checklist, vigentes as never);
      return {
        preadmissao: pa,
        pessoas: pessoas ?? [],
        documentos: docs ?? [],
        checklist,
        pendencias: pendencias.map((p) => ({ key: p.key, titulo: p.titulo, pessoa_nome: p.pessoa_nome })),
        bloqueio: bloqueioMenorNoturno(pa),
        eventos: eventos ?? [],
      };
    };

    if (acao === "ler") return jsonResponse(req, 200, await montar());

    if (acao === "solicitar_correcao") {
      const motivo = String(body?.motivo ?? "").trim();
      if (motivo.length < 5) return jsonResponse(req, 400, { error: "Descreva o que precisa ser corrigido." });
      await admin.from("dp_preadmissoes")
        .update({ status: "correcao_solicitada", correcao_motivo: motivo, revisado_em: new Date().toISOString(), revisado_por: caller.id })
        .eq("id", pa.id);
      await registrarEvento(admin, pa.id, pa.company_id, "correcao_solicitada", { motivo }, caller.id);
      return jsonResponse(req, 200, { success: true });
    }

    if (acao === "salvar_admin") {
      const entrada = (body?.admin_dados ?? {}) as Record<string, unknown>;
      await admin.from("dp_preadmissoes")
        .update({ admin_dados: { ...(pa.admin_dados ?? {}), ...entrada } })
        .eq("id", pa.id);
      await registrarEvento(admin, pa.id, pa.company_id, "dados_administrativos_salvos", {}, caller.id);
      return jsonResponse(req, 200, { success: true });
    }

    if (acao === "alterar_previsto") {
      const patch: Record<string, unknown> = {};
      if (body?.cargo_previsto_id !== undefined) {
        const cargoId = body.cargo_previsto_id ? String(body.cargo_previsto_id) : null;
        if (cargoId) {
          const { data } = await admin.from("dp_cargos").select("id").eq("id", cargoId).eq("company_id", pa.company_id).maybeSingle();
          if (!data) return jsonResponse(req, 400, { error: "Cargo não pertence a esta empresa." });
        }
        patch.cargo_previsto_id = cargoId;
      }
      if (body?.unidade_prevista_id !== undefined) {
        const unidadeId = body.unidade_prevista_id ? String(body.unidade_prevista_id) : null;
        if (unidadeId) {
          const { data } = await admin.from("dp_unidades").select("id").eq("id", unidadeId).eq("company_id", pa.company_id).maybeSingle();
          if (!data) return jsonResponse(req, 400, { error: "Unidade não pertence a esta empresa." });
        }
        patch.unidade_prevista_id = unidadeId;
      }
      if (typeof body?.trabalho_apos_22h === "boolean") patch.trabalho_apos_22h = body.trabalho_apos_22h;
      if (!Object.keys(patch).length) return jsonError(req, "invalid_input", "nada a alterar");
      await admin.from("dp_preadmissoes").update(patch).eq("id", pa.id);
      await registrarEvento(admin, pa.id, pa.company_id, "previsto_alterado", { campos: Object.keys(patch) }, caller.id);
      // Documentos já enviados nunca são apagados; o checklist é recalculado.
      return jsonResponse(req, 200, await montar());
    }

    if (acao === "preparar_contabilidade") {
      if (!PODE_PREPARAR.includes(pa.status)) {
        return jsonResponse(req, 409, { error: "A ficha ainda não está em revisão." });
      }
      const estado = await montar();
      if (estado.bloqueio.situacao !== "ok") {
        return jsonResponse(req, 409, { error: estado.bloqueio.mensagem, bloqueio: estado.bloqueio });
      }
      if (estado.pendencias.length) {
        return jsonResponse(req, 409, {
          error: "Ainda há documentos obrigatórios pendentes.",
          pendencias: estado.pendencias,
        });
      }
      await admin.from("dp_preadmissoes")
        .update({ status: "pronto_contabilidade", revisado_em: new Date().toISOString(), revisado_por: caller.id })
        .eq("id", pa.id);
      await registrarEvento(admin, pa.id, pa.company_id, "pronta_para_contabilidade", {}, caller.id);
      return jsonResponse(req, 200, { success: true, status: "pronto_contabilidade" });
    }

    if (acao === "marcar_status") {
      const novo = String(body?.status ?? "");
      const permitidos: Record<string, string[]> = {
        pronto_contabilidade: ["enviado_contabilidade"],
        enviado_contabilidade: ["aguardando_retorno_contabilidade"],
        aguardando_retorno_contabilidade: ["registro_recebido"],
      };
      if (!(permitidos[pa.status] ?? []).includes(novo)) {
        return jsonResponse(req, 409, { error: "Esta mudança de situação não é permitida agora." });
      }
      const patch: Record<string, unknown> = { status: novo };
      if (novo === "enviado_contabilidade") patch.contabilidade_enviado_em = new Date().toISOString();
      if (novo === "registro_recebido") patch.contabilidade_retorno_em = new Date().toISOString();
      await admin.from("dp_preadmissoes").update(patch).eq("id", pa.id);
      await registrarEvento(admin, pa.id, pa.company_id, `status_${novo}`, { anterior: pa.status }, caller.id);
      return jsonResponse(req, 200, { success: true, status: novo });
    }

    return jsonError(req, "invalid_input", "ação desconhecida");
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
