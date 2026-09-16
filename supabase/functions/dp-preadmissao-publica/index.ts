/**
 * Experiência do candidato (sem login), sempre atrás do convite validado.
 *
 * O candidato só grava os campos da allowlist; Cargo Previsto, Unidade Prevista,
 * trabalho após as 22h e qualquer dado contratual são ignorados mesmo se vierem
 * no corpo do pedido. A empresa vem do convite, nunca do cliente.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { serviceClient } from "../_shared/authz.ts";
import { ipRateLimited } from "../_shared/rate-limit.ts";
import {
  filtrarCamposCandidato,
  registrarEvento,
  requisitosPrevistos,
  validarConvite,
} from "../_shared/preadmissao.ts";
import { montarChecklist, pendenciasDocumentais } from "../_shared/preadmissao-checklist.ts";

const MOTIVOS: Record<string, string> = {
  nao_encontrado: "Este link não é válido. Peça um novo link à empresa.",
  expirado: "Este link expirou. Peça um novo link à empresa.",
  revogado: "Este link foi cancelado. Peça um novo link à empresa.",
  encerrado: "Este processo já foi encerrado pela empresa.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const admin = serviceClient();
    if (await ipRateLimited(admin as unknown as Parameters<typeof ipRateLimited>[0], req, "preadmissao_publica", 300)) return jsonError(req, "rate_limited");

    const body = await req.json().catch(() => ({}));
    const conviteId = String(body?.t ?? "").trim();
    const token = String(body?.c ?? "").trim();
    const acao = String(body?.action ?? "ler").trim();

    const valid = await validarConvite(admin, conviteId, token);
    if (!valid.ok) return jsonResponse(req, 403, { error: MOTIVOS[valid.motivo], motivo: valid.motivo });
    const pa = valid.preadmissao;

    const [{ data: cargo }, { data: unidade }] = await Promise.all([
      pa.cargo_previsto_id
        ? admin.from("dp_cargos").select("nome").eq("id", pa.cargo_previsto_id).maybeSingle()
        : Promise.resolve({ data: null }),
      pa.unidade_prevista_id
        ? admin.from("dp_unidades").select("nome").eq("id", pa.unidade_prevista_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const carregar = async () => {
      const [{ data: pessoas }, { data: docs }, reqs] = await Promise.all([
        admin.from("dp_preadmissao_pessoas").select("*").eq("preadmissao_id", pa.id).order("created_at"),
        admin
          .from("dp_preadmissao_documentos")
          .select("id, requisito_codigo, pessoa_id, file_name, status, created_at")
          .eq("preadmissao_id", pa.id)
          .is("substituido_em", null),
        requisitosPrevistos(admin, pa),
      ]);
      const dados = (pa.dados ?? {}) as Record<string, unknown>;
      const checklist = montarChecklist({
        ficha: {
          data_nascimento: pa.data_nascimento,
          estado_civil: pa.estado_civil,
          sexo: (dados.sexo as string) ?? null,
        },
        pessoas: (pessoas ?? []) as never,
        requisitosCargo: reqs.cargo,
        requisitosUnidade: reqs.unidade,
      });
      return {
        candidato_nome: pa.candidato_nome,
        cargo_previsto: cargo?.nome ?? null,
        unidade_prevista: unidade?.nome ?? null,
        status: pa.status,
        correcao_motivo: pa.correcao_motivo,
        dados,
        pessoas: pessoas ?? [],
        documentos: docs ?? [],
        checklist,
        pendencias: pendenciasDocumentais(checklist, (docs ?? []) as never).map((i) => i.key),
      };
    };

    if (acao === "ler") {
      if (pa.status === "aguardando_preenchimento") {
        await admin.from("dp_preadmissoes").update({ status: "em_preenchimento" }).eq("id", pa.id);
        await registrarEvento(admin, pa.id, pa.company_id, "preenchimento_iniciado");
      }
      return jsonResponse(req, 200, await carregar());
    }

    if (acao === "salvar") {
      const dados = { ...((pa.dados ?? {}) as Record<string, unknown>), ...filtrarCamposCandidato(body?.dados) };
      const texto = (k: string) => {
        const v = dados[k];
        return typeof v === "string" && v.trim() ? v.trim() : null;
      };
      const nascimento = texto("data_nascimento");
      const patch: Record<string, unknown> = {
        dados,
        cpf: (texto("cpf") ?? "").replace(/\D/g, "") || null,
        email: texto("email"),
        data_nascimento: nascimento && /^\d{4}-\d{2}-\d{2}$/.test(nascimento) ? nascimento : null,
        estado_civil: texto("estado_civil"),
      };
      if (["aguardando_preenchimento", "correcao_solicitada"].includes(pa.status)) {
        patch.status = pa.status === "correcao_solicitada" ? "aguardando_nova_versao" : "em_preenchimento";
      }
      const { error } = await admin.from("dp_preadmissoes").update(patch).eq("id", pa.id);
      if (error) return jsonError(req, "internal", error.message);

      // Pessoas relacionadas: uma pessoa, várias finalidades.
      if (Array.isArray(body?.pessoas)) {
        const enviadas = body.pessoas as Record<string, unknown>[];
        const manter: string[] = [];
        for (const p of enviadas) {
          const nome = String(p?.nome ?? "").trim();
          if (!nome) continue;
          const linha = {
            preadmissao_id: pa.id,
            company_id: pa.company_id,
            nome: nome.toLocaleUpperCase("pt-BR"),
            data_nascimento: /^\d{4}-\d{2}-\d{2}$/.test(String(p?.data_nascimento ?? "")) ? String(p.data_nascimento) : null,
            parentesco: p?.parentesco ? String(p.parentesco) : null,
            cpf: String(p?.cpf ?? "").replace(/\D/g, "") || null,
            rg: p?.rg ? String(p.rg) : null,
            finalidade_dependente: !!p?.finalidade_dependente,
            finalidade_sesc: !!p?.finalidade_sesc,
          };
          if (!linha.finalidade_dependente && !linha.finalidade_sesc) continue;
          const id = typeof p?.id === "string" && p.id.length === 36 ? p.id : null;
          if (id) {
            await admin.from("dp_preadmissao_pessoas").update(linha).eq("id", id).eq("preadmissao_id", pa.id);
            manter.push(id);
          } else {
            const { data } = await admin.from("dp_preadmissao_pessoas").insert(linha).select("id").single();
            if (data?.id) manter.push(data.id as string);
          }
        }
        // Remove só o que o candidato retirou da lista nesta etapa.
        const { data: atuais } = await admin.from("dp_preadmissao_pessoas").select("id").eq("preadmissao_id", pa.id);
        const remover = (atuais ?? []).map((a) => a.id as string).filter((id) => !manter.includes(id));
        if (remover.length) await admin.from("dp_preadmissao_pessoas").delete().in("id", remover);
      }

      return jsonResponse(req, 200, await carregar());
    }

    if (acao === "enviar") {
      const estado = await carregar();
      const dados = estado.dados as Record<string, unknown>;
      const faltando: string[] = [];
      for (const campo of ["nome", "cpf", "data_nascimento", "email", "estado_civil", "nome_mae", "grau_instrucao", "telefone", "cep", "endereco", "cidade", "uf"]) {
        const v = dados[campo];
        if (!(typeof v === "string" ? v.trim() : v)) faltando.push(campo);
      }
      if (faltando.length || estado.pendencias.length) {
        return jsonResponse(req, 400, {
          error: "Ainda faltam informações ou documentos obrigatórios.",
          campos_faltando: faltando,
          documentos_faltando: estado.pendencias,
        });
      }
      await admin
        .from("dp_preadmissoes")
        .update({ status: "aguardando_revisao", enviado_em: new Date().toISOString(), correcao_motivo: null })
        .eq("id", pa.id);
      await registrarEvento(admin, pa.id, pa.company_id, pa.status === "aguardando_nova_versao" ? "ficha_reenviada" : "ficha_enviada");
      return jsonResponse(req, 200, {
        success: true,
        mensagem: "Seus dados e documentos foram enviados para análise da empresa.",
      });
    }

    return jsonError(req, "invalid_input", "ação desconhecida");
  } catch (e) {
    return jsonError(req, "internal", e);
  }
});
