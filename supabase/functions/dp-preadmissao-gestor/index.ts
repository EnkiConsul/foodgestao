/**
 * Revisão da Pré-Admissão pelo gestor.
 *
 * Usa o MESMO módulo de regras do candidato (checklist e bloqueio trabalhista),
 * então não existe divergência entre o que o candidato vê e o que o gestor
 * cobra. Toda ação exige dono/administrador da empresa lida no banco.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { canAdminister, requireCompanyAccess, requireUser, serviceClient } from "../_shared/authz.ts";
import {
  registrarEvento,
  requisitosEmpresa,
  requisitosPrevistos,
  transicionar,
  transicionarComVersao,
  type Preadmissao,
} from "../_shared/preadmissao.ts";
import { bloqueioMenorNoturno, montarChecklist, pendenciasDocumentais } from "../_shared/preadmissao-checklist.ts";

/**
 * Situações em que a ficha pode seguir para a contabilidade. Correção pedida
 * NÃO entra: a ficha está com o candidato, ainda sem a nova versão.
 */
const PODE_PREPARAR = ["aguardando_revisao", "aguardando_nova_versao"];

/** Mínimos administrativos que a contabilidade precisa receber. */
const ADMIN_OBRIGATORIOS: Array<[string, string]> = [
  ["data_admissao", "Data de admissão"],
  ["regime_trabalho", "Vínculo/regime"],
  ["salario", "Salário"],
  ["forma_pagamento", "Forma de pagamento"],
  ["jornada_descricao", "Jornada prevista"],
];

/** Mínimos da ficha do candidato exigidos antes do envio à contabilidade. */
const FICHA_OBRIGATORIOS: Array<[string, string]> = [
  ["nome", "Nome"],
  ["cpf", "CPF"],
  ["data_nascimento", "Data de nascimento"],
  ["nome_mae", "Nome da mãe"],
  ["endereco", "Endereço"],
  ["cidade", "Cidade"],
  ["uf", "UF"],
];

function faltantes(fonte: Record<string, unknown>, campos: Array<[string, string]>): string[] {
  return campos
    .filter(([k]) => {
      const v = fonte[k];
      if (v === null || v === undefined) return true;
      return typeof v === "string" ? !v.trim() : v === "";
    })
    .map(([, rotulo]) => rotulo);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const caller = await requireUser(req);
    if (!caller) return jsonError(req, "unauthorized");
    const admin = serviceClient();
    const body = await req.json().catch(() => ({}));
    const acao = String(body?.action ?? "ler").trim();

    /** Lista da empresa: autorização pela empresa lida no banco, nunca pelo corpo. */
    if (acao === "listar") {
      const companyId = String(body?.company_id ?? "").trim();
      if (!companyId) return jsonError(req, "invalid_input", "company_id ausente");
      const acesso = await requireCompanyAccess(caller.id, companyId);
      if (!acesso || !canAdminister(acesso)) return jsonError(req, "forbidden");
      const { data, error } = await admin
        .from("dp_preadmissoes")
        .select(
          "id, company_id, candidato_nome, whatsapp, status, cargo_previsto_id, unidade_prevista_id, " +
            "trabalho_apos_22h, enviado_em, revisado_em, contabilidade_enviado_em, " +
            "ficha_oficial_conferida_em, colaborador_id, created_at, updated_at",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) return jsonError(req, "internal", error.message);
      const { data: convites } = await admin
        .from("dp_preadmissao_convites")
        .select("preadmissao_id, expires_at, revoked_at, created_at")
        .eq("company_id", companyId)
        .is("revoked_at", null);
      const validade = new Map<string, string>();
      for (const c of convites ?? []) validade.set(c.preadmissao_id as string, c.expires_at as string);
      return jsonResponse(req, 200, {
        preadmissoes: ((data ?? []) as unknown as Array<Record<string, unknown>>).map((p) => ({
          ...p,
          convite_expira_em: validade.get(String(p.id)) ?? null,
        })),
      });
    }

    const id = String(body?.preadmissao_id ?? "").trim();
    if (!id) return jsonError(req, "invalid_input", "preadmissao_id ausente");

    const { data: paRow } = await admin.from("dp_preadmissoes").select("*").eq("id", id).maybeSingle();
    if (!paRow) return jsonError(req, "not_found");
    const pa = paRow as unknown as Preadmissao;
    const access = await requireCompanyAccess(caller.id, pa.company_id);
    if (!access || !canAdminister(access)) return jsonError(req, "forbidden");

    /** Sempre relê a ficha: nenhuma resposta é montada com estado antigo. */
    const montar = async () => {
      // A ficha é lida ANTES dos requisitos: cargo/unidade recém-alterados
      // valem imediatamente no checklist (nunca o estado antigo em memória).
      const { data: atual } = await admin.from("dp_preadmissoes").select("*").eq("id", pa.id).maybeSingle();
      const fichaAtual = (atual ?? pa) as unknown as Preadmissao;
      const [{ data: pessoas }, { data: docs }, reqs, reqsEmpresa, { data: eventos }] = await Promise.all([
        admin.from("dp_preadmissao_pessoas").select("*").eq("preadmissao_id", pa.id)
          .is("removido_em", null).order("created_at"),
        admin
          .from("dp_preadmissao_documentos")
          .select("id, requisito_codigo, pessoa_id, file_name, status, motivo_recusa, versao, created_at, substituido_em")
          .eq("preadmissao_id", pa.id)
          .order("created_at", { ascending: false }),
        requisitosPrevistos(admin, fichaAtual),
        requisitosEmpresa(admin, pa.company_id),
        admin.from("dp_preadmissao_eventos").select("evento, detalhe, created_at").eq("preadmissao_id", pa.id)
          .order("created_at", { ascending: false }).limit(50),
      ]);
      const ficha = (atual ?? pa) as unknown as Preadmissao;
      const dados = (ficha.dados ?? {}) as Record<string, unknown>;
      const vigentes = (docs ?? []).filter((d) => !d.substituido_em);
      const checklist = montarChecklist({
        ficha: { data_nascimento: ficha.data_nascimento, estado_civil: ficha.estado_civil, sexo: (dados.sexo as string) ?? null },
        pessoas: (pessoas ?? []) as never,
        requisitosCargo: reqs.cargo,
        requisitosUnidade: reqs.unidade,
        requisitosEmpresa: reqsEmpresa,
      });
      const pendencias = pendenciasDocumentais(checklist, vigentes as never);
      return {
        preadmissao: ficha,
        pessoas: pessoas ?? [],
        documentos: docs ?? [],
        checklist,
        pendencias: pendencias.map((p) => ({ key: p.key, titulo: p.titulo, pessoa_nome: p.pessoa_nome })),
        bloqueio: bloqueioMenorNoturno(ficha),
        eventos: eventos ?? [],
      };
    };

    if (acao === "ler") return jsonResponse(req, 200, await montar());

    if (acao === "solicitar_correcao") {
      const motivo = String(body?.motivo ?? "").trim();
      if (motivo.length < 5) return jsonResponse(req, 400, { error: "Descreva o que precisa ser corrigido." });
      const t = await transicionar(admin, pa.id, ["aguardando_revisao", "aguardando_nova_versao", "em_preenchimento"], "correcao_solicitada", {
        correcao_motivo: motivo,
        revisado_em: true,
        revisado_por: caller.id,
      });
      if (!t.ok) {
        return t.motivo === "status_inesperado"
          ? jsonResponse(req, 409, { error: "A ficha não está em revisão agora.", status: t.status })
          : jsonError(req, "internal", "não foi possível registrar a correção");
      }
      await registrarEvento(admin, pa.id, pa.company_id, "correcao_solicitada", { motivo }, caller.id);
      return jsonResponse(req, 200, { success: true });
    }

    if (acao === "salvar_admin") {
      const entrada = (body?.admin_dados ?? {}) as Record<string, unknown>;
      // Versão sobe: uma conferência iniciada antes disso não será aplicada.
      const t = await transicionarComVersao(admin, pa.id, null, null, {
        admin_dados: { ...(pa.admin_dados ?? {}), ...entrada },
      });
      if (!t.ok) return jsonError(req, "internal", "não foi possível salvar os dados administrativos");
      await registrarEvento(admin, pa.id, pa.company_id, "dados_administrativos_salvos", {}, caller.id);
      return jsonResponse(req, 200, { success: true, ...(await montar()) });
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
      // Muda os requisitos exigidos: a versão sobe para invalidar preparações
      // que já tinham conferido o checklist antigo.
      const t = await transicionarComVersao(admin, pa.id, null, null, patch);
      if (!t.ok) return jsonError(req, "internal", "não foi possível alterar a previsão");
      await registrarEvento(admin, pa.id, pa.company_id, "previsto_alterado", { campos: Object.keys(patch) }, caller.id);
      // Documentos já enviados nunca são apagados; o checklist é recalculado.
      return jsonResponse(req, 200, await montar());
    }

    /** Análise de um documento enviado pelo candidato (nunca aprova em massa). */
    if (acao === "avaliar_documento") {
      const documentoId = String(body?.documento_id ?? "").trim();
      const novo = String(body?.status ?? "");
      if (!["aprovado", "recusado"].includes(novo)) {
        return jsonError(req, "invalid_input", "situação inválida");
      }
      const motivo = String(body?.motivo ?? "").trim();
      if (novo === "recusado" && motivo.length < 5) {
        return jsonResponse(req, 400, { error: "Explique por que o documento foi recusado." });
      }
      const { data: doc } = await admin
        .from("dp_preadmissao_documentos")
        .select("id, requisito_codigo, substituido_em")
        .eq("id", documentoId)
        .eq("preadmissao_id", pa.id)
        .eq("company_id", pa.company_id)
        .maybeSingle();
      if (!doc) return jsonError(req, "not_found");
      if (doc.substituido_em) {
        return jsonResponse(req, 409, { error: "Esta versão foi substituída por outra mais recente." });
      }
      const { error } = await admin
        .from("dp_preadmissao_documentos")
        .update({
          status: novo,
          motivo_recusa: novo === "recusado" ? motivo : null,
        })
        .eq("id", doc.id);
      if (error) return jsonError(req, "internal", error.message);
      // A análise muda as pendências: a versão sobe para invalidar conferências antigas.
      await transicionarComVersao(admin, pa.id, null, null, {});
      await registrarEvento(
        admin,
        pa.id,
        pa.company_id,
        novo === "aprovado" ? "documento_aprovado" : "documento_recusado",
        { requisito_codigo: doc.requisito_codigo },
        caller.id,
      );
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
      const fichaFalta = faltantes(
        (estado.preadmissao.dados ?? {}) as Record<string, unknown>,
        FICHA_OBRIGATORIOS,
      );
      const adminFalta = faltantes(
        (estado.preadmissao.admin_dados ?? {}) as Record<string, unknown>,
        ADMIN_OBRIGATORIOS,
      );
      if (fichaFalta.length || adminFalta.length) {
        return jsonResponse(req, 409, {
          error: "Complete as informações antes de preparar o envio para a contabilidade.",
          ficha_faltando: fichaFalta,
          admin_faltando: adminFalta,
        });
      }
      // A conferência acima vale para esta versão: se cargo/unidade, dados
      // administrativos ou documentos mudarem antes da transição, o banco recusa.
      const t = await transicionarComVersao(admin, pa.id, PODE_PREPARAR, "pronto_contabilidade", {
        revisado_em: true,
        revisado_por: caller.id,
      }, Number((estado.preadmissao as unknown as { versao?: number }).versao ?? 0));
      if (!t.ok) {
        if (t.motivo === "versao_alterada") {
          return jsonResponse(req, 409, {
            error: "A ficha mudou enquanto você conferia. Recarregue e confira novamente.",
            status: t.status,
          });
        }
        return t.motivo === "status_inesperado"
          ? jsonResponse(req, 409, { error: "A ficha ainda não está em revisão.", status: t.status })
          : jsonError(req, "internal", "não foi possível preparar o envio");
      }
      await registrarEvento(admin, pa.id, pa.company_id, "pronta_para_contabilidade", {}, caller.id);
      return jsonResponse(req, 200, { success: true, status: "pronto_contabilidade" });
    }

    if (acao === "marcar_status") {
      const novo = String(body?.status ?? "");
      // Receber a ficha oficial NÃO é uma simples mudança de situação: exige o
      // arquivo anexado e conferido (ação "ficha_oficial" da função de arquivos).
      const permitidos: Record<string, string[]> = {
        pronto_contabilidade: ["enviado_contabilidade"],
        enviado_contabilidade: ["aguardando_retorno_contabilidade"],
      };
      if (!(permitidos[pa.status] ?? []).includes(novo)) {
        return jsonResponse(req, 409, {
          error: novo === "registro_recebido"
            ? "Anexe a ficha oficial da contabilidade e registre a conferência para receber o registro."
            : "Esta mudança de situação não é permitida agora.",
        });
      }
      const t = await transicionar(admin, pa.id, [pa.status], novo, {
        ...(novo === "enviado_contabilidade" ? { contabilidade_enviado_em: true } : {}),
      });
      if (!t.ok) {
        return t.motivo === "status_inesperado"
          ? jsonResponse(req, 409, { error: "A situação mudou enquanto você trabalhava. Recarregue a ficha.", status: t.status })
          : jsonError(req, "internal", "não foi possível mudar a situação");
      }
      await registrarEvento(admin, pa.id, pa.company_id, `status_${novo}`, { anterior: pa.status }, caller.id);
      return jsonResponse(req, 200, { success: true, status: novo });
    }

    return jsonError(req, "invalid_input", "ação desconhecida");
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
