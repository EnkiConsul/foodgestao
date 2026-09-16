/**
 * Experiência do candidato (sem login), sempre atrás do convite validado.
 *
 * O candidato só grava os campos da allowlist — payload com campo fora da lista
 * é REJEITADO, não filtrado em silêncio. A empresa vem do convite, nunca do
 * cliente. Depois que a ficha entra em revisão/contabilidade, o candidato não
 * grava mais nada: nem dados, nem pessoas.
 */
import { jsonError, jsonResponse, strictCorsHeaders } from "../_shared/http.ts";
import { serviceClient } from "../_shared/authz.ts";
import { ipRateLimited } from "../_shared/rate-limit.ts";
import {
  camposNaoPermitidos,
  candidatoPodeEditar,
  filtrarCamposCandidato,
  registrarEvento,
  requisitosEmpresa,
  requisitosPrevistos,
  transicionar,
  validarConvite,
  validarDadosCandidato,
} from "../_shared/preadmissao.ts";
import { montarChecklist, pendenciasDocumentais } from "../_shared/preadmissao-checklist.ts";

const MOTIVOS: Record<string, string> = {
  nao_encontrado: "Este link não é válido. Peça um novo link à empresa.",
  expirado: "Este link expirou. Peça um novo link à empresa.",
  revogado: "Este link foi cancelado. Peça um novo link à empresa.",
  encerrado: "Este processo já foi encerrado pela empresa.",
};

const FASE_ENCERRADA =
  "Sua ficha já está em análise pela empresa. Aguarde o contato: não é possível alterar os dados agora.";

const OBRIGATORIOS = [
  "nome", "cpf", "data_nascimento", "email", "estado_civil", "nome_mae",
  "grau_instrucao", "telefone", "cep", "endereco", "cidade", "uf",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: strictCorsHeaders(req) });
  if (req.method !== "POST") return jsonError(req, "invalid_input", "método inválido");

  try {
    const admin = serviceClient();
    if (await ipRateLimited(admin as unknown as Parameters<typeof ipRateLimited>[0], req, "preadmissao_publica", 300)) {
      return jsonError(req, "rate_limited");
    }

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

    /** Sempre relê a ficha do banco: nada de responder com estado velho. */
    const carregar = async () => {
      const [{ data: atual }, { data: pessoas }, { data: docs }, reqs, reqsEmpresa] = await Promise.all([
        admin
          .from("dp_preadmissoes")
          .select("status, dados, correcao_motivo, data_nascimento, estado_civil, cpf, email")
          .eq("id", pa.id)
          .maybeSingle(),
        admin
          .from("dp_preadmissao_pessoas")
          .select("*")
          .eq("preadmissao_id", pa.id)
          .is("removido_em", null)
          .order("created_at"),
        admin
          .from("dp_preadmissao_documentos")
          .select("id, requisito_codigo, pessoa_id, file_name, status, created_at")
          .eq("preadmissao_id", pa.id)
          .is("substituido_em", null),
        requisitosPrevistos(admin, pa),
        requisitosEmpresa(admin, pa.company_id),
      ]);
      const linha = (atual ?? {}) as Record<string, unknown>;
      const dados = (linha.dados ?? {}) as Record<string, unknown>;
      const checklist = montarChecklist({
        ficha: {
          data_nascimento: (linha.data_nascimento as string) ?? null,
          estado_civil: (linha.estado_civil as string) ?? null,
          sexo: (dados.sexo as string) ?? null,
        },
        pessoas: (pessoas ?? []) as never,
        requisitosCargo: reqs.cargo,
        requisitosUnidade: reqs.unidade,
        requisitosEmpresa: reqsEmpresa,
      });
      const status = String(linha.status ?? pa.status);
      return {
        candidato_nome: pa.candidato_nome,
        cargo_previsto: cargo?.nome ?? null,
        unidade_prevista: unidade?.nome ?? null,
        status,
        editavel: candidatoPodeEditar(status),
        correcao_motivo: (linha.correcao_motivo as string) ?? null,
        dados,
        pessoas: pessoas ?? [],
        documentos: docs ?? [],
        checklist,
        pendencias: pendenciasDocumentais(checklist, (docs ?? []) as never).map((i) => i.key),
      };
    };

    if (acao === "ler") {
      if (pa.status === "aguardando_preenchimento") {
        const t = await transicionar(admin, pa.id, ["aguardando_preenchimento"], "em_preenchimento");
        if (t.ok) await registrarEvento(admin, pa.id, pa.company_id, "preenchimento_iniciado");
      }
      return jsonResponse(req, 200, await carregar());
    }

    if (acao === "salvar") {
      if (!candidatoPodeEditar(pa.status)) {
        return jsonResponse(req, 409, { error: FASE_ENCERRADA, status: pa.status });
      }

      // Requisito 70: campo fora da allowlist derruba o pedido.
      const invasores = camposNaoPermitidos(body?.dados);
      if (invasores.length) {
        return jsonResponse(req, 400, {
          error: "Não foi possível salvar: há informações inválidas no formulário.",
          campos_invalidos: invasores,
        });
      }

      const dados = { ...((pa.dados ?? {}) as Record<string, unknown>), ...filtrarCamposCandidato(body?.dados) };
      const erros = validarDadosCandidato(dados);
      if (Object.keys(erros).length) {
        return jsonResponse(req, 400, { error: "Confira as informações destacadas.", erros });
      }

      const texto = (k: string) => {
        const v = dados[k];
        return typeof v === "string" && v.trim() ? v.trim() : null;
      };
      const proximo = pa.status === "correcao_solicitada"
        ? "aguardando_nova_versao"
        : pa.status === "aguardando_preenchimento"
        ? "em_preenchimento"
        : pa.status;

      const t = await transicionar(admin, pa.id, [...new Set([pa.status])], proximo, {
        dados,
        cpf: (texto("cpf") ?? "").replace(/\D/g, ""),
        email: texto("email") ?? "",
        data_nascimento: texto("data_nascimento") ?? "",
        estado_civil: texto("estado_civil") ?? "",
      });
      if (!t.ok) {
        return t.motivo === "status_inesperado"
          ? jsonResponse(req, 409, { error: FASE_ENCERRADA, status: t.status })
          : jsonError(req, "internal", "não foi possível salvar");
      }

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
            const { error } = await admin
              .from("dp_preadmissao_pessoas")
              .update(linha)
              .eq("id", id)
              .eq("preadmissao_id", pa.id)
              .is("removido_em", null);
            if (error) return jsonError(req, "internal", "não foi possível salvar as pessoas informadas");
            manter.push(id);
          } else {
            const { data, error } = await admin
              .from("dp_preadmissao_pessoas")
              .insert(linha)
              .select("id")
              .single();
            if (error || !data?.id) return jsonError(req, "internal", "não foi possível salvar as pessoas informadas");
            manter.push(data.id as string);
          }
        }
        // Quem sai da lista é marcado como removido: histórico e titular dos
        // documentos continuam rastreáveis. Nada é apagado.
        const { data: atuais, error: erroAtuais } = await admin
          .from("dp_preadmissao_pessoas")
          .select("id")
          .eq("preadmissao_id", pa.id)
          .is("removido_em", null);
        if (erroAtuais) return jsonError(req, "internal", "não foi possível atualizar a lista de pessoas");
        const remover = (atuais ?? []).map((a) => a.id as string).filter((id) => !manter.includes(id));
        if (remover.length) {
          const { error } = await admin
            .from("dp_preadmissao_pessoas")
            .update({ removido_em: new Date().toISOString() })
            .in("id", remover);
          if (error) return jsonError(req, "internal", "não foi possível atualizar a lista de pessoas");
        }
      }

      return jsonResponse(req, 200, await carregar());
    }

    if (acao === "enviar") {
      if (!candidatoPodeEditar(pa.status)) {
        return jsonResponse(req, 409, { error: FASE_ENCERRADA, status: pa.status });
      }
      const estado = await carregar();
      const dados = estado.dados as Record<string, unknown>;
      const erros = validarDadosCandidato(dados);
      const faltando = OBRIGATORIOS.filter((campo) => {
        const v = dados[campo];
        return !(typeof v === "string" ? v.trim() : v);
      });
      if (faltando.length || estado.pendencias.length || Object.keys(erros).length) {
        return jsonResponse(req, 400, {
          error: "Ainda faltam informações ou documentos obrigatórios.",
          campos_faltando: faltando,
          documentos_faltando: estado.pendencias,
          erros,
        });
      }
      const t = await transicionar(
        admin,
        pa.id,
        [...new Set([pa.status, estado.status])],
        "aguardando_revisao",
        { enviado_em: true, correcao_motivo: "" },
      );
      if (!t.ok) {
        return t.motivo === "status_inesperado"
          ? jsonResponse(req, 409, { error: FASE_ENCERRADA, status: t.status })
          : jsonError(req, "internal", "não foi possível enviar a ficha");
      }
      await registrarEvento(
        admin,
        pa.id,
        pa.company_id,
        t.status_anterior === "aguardando_nova_versao" ? "ficha_reenviada" : "ficha_enviada",
      );
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
